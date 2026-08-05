import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "@commander-js/extra-typings";
import {
  collectBatch,
  outstandingBatches,
  readRecord,
  submitBatch,
  writeRecord,
} from "./icon-descriptions/batch";
import { positiveDollars, positiveInt, workbenchCorpus } from "./icon-descriptions/cli";
import {
  buildCompareParams,
  type Comparison,
  countPromptTokens,
  estimateCompareCost,
  extractVerdict,
  formatReport,
  type Pair,
  pairArms,
} from "./icon-descriptions/compare";
import { assertApiKey, canonicalModel, pricingFor } from "./icon-descriptions/invoke-api";
import { readDescriptions } from "./icon-descriptions/store";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const BATCH_DIR = resolve(REPO, ".icon-cache/batches");
// Deliberately not inside BATCH_DIR: `outstandingBatches` reads every *.json
// there and refuses to run if one is not a batch record, so a sidecar filed
// beside the records would block icon runs as well as comparison ones.
const PAIR_DIR = resolve(REPO, ".icon-cache/compare");

const program = new Command()
  .exitOverride()
  .name("npm run compare:icon-descriptions")
  .usage("-- [flags]")
  .description(
    "Asks a model whether two arms' descriptions of the same icon say the same thing, and " +
      "writes the disagreements to a markdown file for human review. Every pair goes to the " +
      "Batch API; there is no cheaper pre-filter, because lexical overlap does not separate " +
      "paraphrase from real disagreement.\n\n" +
      "Full documentation: scripts/icon-descriptions/README.md",
  )
  .option("--a <model>", "the arm reported as A", "claude-sonnet-5")
  .option("--b <model>", "the arm reported as B", "claude-opus-5")
  .option("--judge <model>", "model that compares the pairs", "sonnet")
  .option("--out <path>", "where to write the report", "corpus/comparison.md")
  .option("--limit <n>", "compare at most n pairs", positiveInt)
  .option(
    "--only <name>",
    "compare exactly these; repeatable",
    (value: string, previous: string[] = []) => [...previous, value],
  )
  .option("--max-cost <usd>", "refuse to submit above this estimate", positiveDollars)
  .option("--dry-run", "print the selection and the estimate, then exit without sending")
  .option("--fetch <batch-id>", "collect a submitted comparison batch");

const opts = (() => {
  try {
    program.parse(process.argv.slice(2), { from: "user" });
    return program.opts();
  } catch (err) {
    process.exit(err instanceof CommanderError && err.exitCode === 0 ? 0 : 2);
  }
})();

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const OUT = resolve(opts.out);

// The pairs a batch was submitted for, kept beside its record. The record itself
// carries only the icon names, and the report needs the two sentences and which
// arms they came from — none of which can be re-derived at collection time,
// because regenerating an arm in between would silently pair the verdicts with
// text nobody judged.
type Submission = { a: string; b: string; pairs: Pair[] };
const submissionPath = (id: string): string => resolve(PAIR_DIR, `${id}.json`);

if (opts.fetch !== undefined) {
  try {
    const record = readRecord(BATCH_DIR, opts.fetch);
    const path = submissionPath(record.id);
    if (!existsSync(path)) {
      fail(`Batch ${record.id} has no submitted pairs at ${path}; its verdicts cannot be read.`);
    }
    const submission = JSON.parse(readFileSync(path, "utf8")) as Submission;

    const collected = await collectBatch(record, assertApiKey(), extractVerdict);
    if (!collected.ended) {
      console.log(
        `Batch ${record.id} is ${collected.status}; re-run --fetch later. ` +
          `Results are retained 29 days from submission (${record.submittedAt}).`,
      );
      process.exit(0);
    }

    const comparisons = collected.values as Record<string, Comparison>;
    const collectedAt = new Date().toISOString();
    mkdirSync(dirname(record.out), { recursive: true });
    writeFileSync(
      record.out,
      formatReport({
        ...submission,
        judge: record.model,
        collectedAt,
        comparisons,
        failures: collected.failures,
      }),
      "utf8",
    );
    writeRecord(BATCH_DIR, { ...record, collectedAt });

    const counts = { agree: 0, trivial: 0, substantial: 0 };
    for (const { verdict } of Object.values(comparisons)) counts[verdict] += 1;
    console.log(
      `Judged ${Object.keys(comparisons).length} of ${record.requests.length} pairs into ` +
        `${record.out} ($${collected.cost.toFixed(3)} billed).\n` +
        `  ${counts.substantial} substantial, ${counts.trivial} trivial, ${counts.agree} agree.`,
    );
    for (const failure of collected.failures) console.warn(`  ${failure}`);
    process.exit(collected.failures.length ? 1 : 0);
  } catch (err) {
    fail((err as Error).message);
  }
}

{
  const outstanding = outstandingBatches(BATCH_DIR, OUT);
  if (outstanding.length) {
    fail(
      [
        `${outstanding.length} comparison batch(es) writing to ${OUT} are not collected.`,
        ...outstanding.map(
          (batch) =>
            `  ${batch.name}${batch.pending ? " — submitted without a recorded id" : ` — collect with --fetch ${batch.name}`}`,
        ),
        `Delete a record in ${BATCH_DIR} to abandon it.`,
      ].join("\n"),
    );
  }
}

const armA = canonicalModel(opts.a);
const armB = canonicalModel(opts.b);
const arms = Object.fromEntries(
  [armA, armB].map((model) => {
    const path = workbenchCorpus(model);
    if (!existsSync(path)) fail(`No corpus for ${model} at ${path}.`);
    return [model, readDescriptions(path)];
  }),
);

let pairs = pairArms(arms, armA, armB);
if (opts.only) {
  const wanted = new Set(opts.only);
  pairs = pairs.filter((pair) => wanted.has(pair.name));
  const missing = [...wanted].filter((name) => !pairs.some((pair) => pair.name === name));
  if (missing.length) fail(`Not described by both arms: ${missing.join(" ")}`);
}
if (opts.limit !== undefined) pairs = pairs.slice(0, opts.limit);

console.log(`${pairs.length} icons described by both ${armA} and ${armB}.`);
if (pairs.length === 0) process.exit(0);

const { id: judgeId, price } = pricingFor(opts.judge, "batch");
const key = assertApiKey();

const first = pairs[0];
if (!first) process.exit(0);
const inputTokens = await countPromptTokens(buildCompareParams(first, judgeId), key);
const estimate = estimateCompareCost(pairs.length, price, inputTokens);
console.log(
  `Estimated at least $${estimate.toFixed(2)} — ${inputTokens} counted input tokens per pair ` +
    `plus an output allowance; thinking tokens are billed as output and are not in it.`,
);
if (opts.maxCost !== undefined && estimate > opts.maxCost) {
  fail(
    `Estimated $${estimate.toFixed(2)} against --max-cost $${opts.maxCost.toFixed(2)}, ` +
      `and the estimate is a floor. Nothing submitted.`,
  );
}

if (opts.dryRun) {
  console.log("Dry run; nothing sent.");
  process.exit(0);
}

// Written before the POST, for the same reason the pending batch record is: a
// batch whose pairs are lost is billed and unreadable, and the window where the
// server has accepted it but nothing local has recorded it is exactly where a
// dropped connection lands.
const pendingPairs = submissionPath(`pending-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`);
mkdirSync(PAIR_DIR, { recursive: true });
writeFileSync(
  pendingPairs,
  `${JSON.stringify({ a: armA, b: armB, pairs } satisfies Submission, null, 2)}\n`,
  "utf8",
);

try {
  const byName = new Map(pairs.map((pair) => [pair.name, pair]));
  const record = await submitBatch({
    icons: pairs.map((pair) => pair.name),
    buildParams: async (name) => {
      const pair = byName.get(name);
      if (!pair) throw new Error(`no pair for ${name}`);
      return buildCompareParams(pair, judgeId);
    },
    modelId: judgeId,
    price,
    // No prefix is marked, so there is nothing to expire and nothing to reprice.
    cacheTtl: "off",
    out: OUT,
    key,
    recordDir: BATCH_DIR,
  });
  renameSync(pendingPairs, submissionPath(record.id));
  console.log(
    `Submitted batch ${record.id}: ${pairs.length} pairs (${judgeId}).\n` +
      `Collect with:\n  npm run compare:icon-descriptions -- --fetch ${record.id}`,
  );
} catch (err) {
  fail((err as Error).message);
}
