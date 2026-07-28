import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  isNameEcho,
  isTautologicalAssociation,
  mergeOverrides,
  styleWord,
  validateEntry,
} from "../src/data/iconDescriptions/entries";
import {
  acceptCollected,
  collectBatch,
  outstandingBatches,
  readRecord,
  submitBatch,
  writeRecord,
} from "./icon-descriptions/batch";
import { assertClaudeAvailable, describeBatch } from "./icon-descriptions/invoke";
import {
  assertApiKey,
  canonicalModel,
  describeBatchApi,
  estimateCost,
  type Price,
  pricingFor,
} from "./icon-descriptions/invoke-api";
import {
  DEFAULT_RENDER_SIZE,
  ensurePngs,
  iconNames,
  loadCollection,
} from "./icon-descriptions/rasterize";
import { runBatches } from "./icon-descriptions/run";
import { DEFAULT_BATCH_SIZE, selectBatches } from "./icon-descriptions/selection";
import { corpusModel, mergeDescriptions, readDescriptions } from "./icon-descriptions/store";
import { DEFAULT_MODEL } from "./icon-descriptions/transport";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT = resolve(__dirname, "../src/data/iconDescriptions/corpus.json");
const OVERRIDES = resolve(__dirname, "../src/data/iconDescriptions/overrides.json");
const CACHE_DIR = resolve(__dirname, "../.icon-cache");
const LOCKFILE = join(CACHE_DIR, "run.lock");
const BATCH_DIR = join(CACHE_DIR, "batches");

// No parseArgs defaults: --validate and --fetch are exclusive modes, and a
// defaulted flag is indistinguishable from one the operator actually passed.
const { values } = parseArgs({
  options: {
    only: { type: "string", multiple: true },
    "batch-size": { type: "string" },
    force: { type: "boolean" },
    validate: { type: "boolean" },
    fetch: { type: "string" },
    limit: { type: "string" },
    model: { type: "string" },
    out: { type: "string" },
    size: { type: "string" },
    transport: { type: "string" },
    "max-cost": { type: "string" },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

// --fetch reads everything it needs from the submitted batch's record, so a
// selection or model flag alongside it would silently do nothing.
const RUN_FLAGS = [
  "only",
  "batch-size",
  "force",
  "limit",
  "model",
  "size",
  "transport",
  "max-cost",
] as const;

// `--out` names which corpus to work on, so it is meaningful to a run and to
// `--validate` — scoring a second model's file is what the warning counts exist
// for. `--fetch` is the exception: its batch record already carries the corpus
// the submit chose, and accepting a flag that could disagree with it would let a
// mistyped path merge Opus descriptions into the Sonnet corpus hours later.
const EXCLUSIVE_TO = {
  validate: [...RUN_FLAGS, "fetch"],
  fetch: [...RUN_FLAGS, "validate", "out"],
} as const;

const assertExclusive = (mode: "validate" | "fetch") => {
  const conflicting = EXCLUSIVE_TO[mode].filter((flag) => values[flag] !== undefined);
  if (conflicting.length) {
    fail(`--${mode} is exclusive; remove: ${conflicting.map((f) => `--${f}`).join(", ")}`);
  }
};

// Relative to the invocation, not the script, so `--out corpus/opus.json` means
// what it looks like it means.
const OUTPUT = values.out === undefined ? DEFAULT_OUTPUT : resolve(values.out);

if (values.validate) {
  assertExclusive("validate");

  // Validate what actually ships: an override can be hand-written too long, and
  // one supplying an icon the generated file lacks is not missing.
  const descriptions = mergeOverrides(readDescriptions(OUTPUT), readDescriptions(OVERRIDES));
  const problems: string[] = [];
  const echoes: string[] = [];
  const styled: string[] = [];
  const tautologies: string[] = [];
  for (const [name, description] of Object.entries(descriptions)) {
    const problem = validateEntry(name, description);
    if (problem) {
      problems.push(problem);
      continue;
    }
    if (isNameEcho(name, description)) echoes.push(name);
    const style = styleWord(description);
    if (style) styled.push(`${name}(${style})`);
    if (isTautologicalAssociation(name, description)) tautologies.push(name);
  }

  // Iterating the file alone reports nothing about icons that have no entry at
  // all, which is exactly the list `--only` needs to close a residue.
  const missing = iconNames(loadCollection()).filter((name) => !(name in descriptions));

  const total = Object.keys(descriptions).length;
  // Reported as a rate, not one line per icon: these are prose-quality residues
  // running at a few percent of the corpus, so the number is the thing to watch
  // across prompt revisions and the list is triage for the overrides file.
  const warn = (found: string[], what: string) => {
    if (!found.length) return;
    const rate = ((found.length / total) * 100).toFixed(1);
    console.warn(`  WARN ${found.length} (${rate}%) ${what}: ${found.join(" ")}`);
  };

  console.log(`Validated ${total} entries; ${missing.length} missing.`);
  warn(echoes, "add nothing beyond the icon's own name");
  warn(styled, "describe the drawing style");
  warn(tautologies, "close on an association that restates the subject");
  for (const problem of problems) console.error(`  FAIL: ${problem}`);
  if (missing.length) {
    console.error(`  MISSING (${missing.length}): ${missing.join(" ")}`);
    console.error(`  Close them with: ${missing.map((n) => `--only ${n}`).join(" ")}`);
  }
  process.exit(problems.length || missing.length ? 1 : 0);
}

if (values.fetch !== undefined) assertExclusive("fetch");

const positiveInt = (raw: string | undefined, flag: string, fallback: number): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) fail(`--${flag} must be a positive integer`);
  return value;
};

const batchSize = positiveInt(values["batch-size"], "batch-size", DEFAULT_BATCH_SIZE);
const size = positiveInt(values.size, "size", DEFAULT_RENDER_SIZE);
const limit = values.limit === undefined ? undefined : positiveInt(values.limit, "limit", 0);
const model = values.model ?? DEFAULT_MODEL;

const maxCost = (() => {
  if (values["max-cost"] === undefined) return undefined;
  const value = Number(values["max-cost"]);
  if (!Number.isFinite(value) || value <= 0)
    fail("--max-cost must be a positive number of dollars");
  return value;
})();

// `cli` spends subscription quota; `api` and `batch` spend money on an
// ANTHROPIC_API_KEY. Defaulting to `cli` keeps the zero-real-money path the one
// you get by accident.
const TRANSPORTS = ["cli", "api", "batch"] as const;
type Transport = (typeof TRANSPORTS)[number];
const transport = (values.transport ?? "cli") as Transport;
if (!TRANSPORTS.includes(transport)) fail(`--transport must be one of: ${TRANSPORTS.join(", ")}`);
const paid = transport !== "cli";

// Selection is driven by the corpus file, which an outstanding batch has not
// written to yet, so running again re-describes and re-pays for exactly the same
// icons. The hazard belongs to the corpus, not to the transport doing the
// reading: with a batch in flight, `--transport api` bills the same icons
// synchronously at twice the rate and `cli` burns the same quota, so this is
// checked for every transport. Before rasterization rather than at the POST.
{
  const outstanding = outstandingBatches(BATCH_DIR, OUTPUT);
  if (outstanding.length) {
    const collectable = outstanding.filter((batch) => !batch.pending);
    const pending = outstanding.filter((batch) => batch.pending);
    fail(
      [
        `${outstanding.length} batch(es) writing to ${OUTPUT} are not collected.`,
        ...collectable.map((batch) => `  ${batch.name} — collect with --fetch ${batch.name}`),
        // A pending record was written before its POST, so it carries no batch
        // id and --fetch cannot reach it. Whether the batch exists at all is
        // only answerable at the API.
        ...pending.map(
          (batch) =>
            `  ${batch.name} — submitted without a recorded id; list your batches at ` +
            `the API to find out whether it was created`,
        ),
        `Delete a record in ${BATCH_DIR} to abandon it.`,
      ].join("\n"),
    );
  }
}

// `mergeDescriptions` refuses a cross-model write too, but that check runs after
// the model has answered and been billed. Checked here as well so the wrong
// --model/--out pairing costs nothing rather than a batch.
{
  const wrote = corpusModel(OUTPUT);
  const writing = canonicalModel(model);
  if (wrote !== undefined && wrote !== writing) {
    fail(
      `${OUTPUT} was written by ${wrote}; refusing to add ${writing} to it.\n` +
        `Give each model its own --out — a corpus holding both is indistinguishable ` +
        `afterwards from one holding either.`,
    );
  }
}

// Bare --force re-describes all 4,134 icons. On the CLI that spends quota that
// refills; over the API it is an unbounded charge one keystroke away from a
// scoped re-run, so require the scope to be explicit.
if (paid && values.force && !values.only && limit === undefined) {
  fail(
    `--force with --transport ${transport} re-describes every icon; scope it with --only or --limit.`,
  );
}

// Concurrent runs would lose updates: each reads the file, merges, and renames
// over the other's work.
mkdirSync(CACHE_DIR, { recursive: true });
try {
  closeSync(openSync(LOCKFILE, "wx"));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  fail(`Another run holds ${LOCKFILE}. Delete it if no run is in progress.`);
}
process.on("exit", () => {
  if (existsSync(LOCKFILE)) unlinkSync(LOCKFILE);
});
// Ctrl-C and `kill` default to terminating without running exit handlers, so
// route them through process.exit to release the lock.
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
process.on("SIGHUP", () => process.exit(129));

if (values.fetch !== undefined) {
  try {
    const record = readRecord(BATCH_DIR, values.fetch);
    const collected = await collectBatch(record, assertApiKey());
    if (!collected.ended) {
      console.log(
        `Batch ${record.id} is ${collected.status}; re-run --fetch later. ` +
          `Results are retained 29 days from submission (${record.submittedAt}).`,
      );
      process.exit(0);
    }

    const { accepted, dropped } = acceptCollected(collected.descriptions, validateEntry);
    // The record's own path, not this run's --out: the submit chose where these
    // descriptions belong, and the model that wrote them cannot be changed now.
    mergeDescriptions(record.out, accepted, canonicalModel(record.model));
    // Marked before anything can be reported, so a batch already merged cannot
    // be mistaken for one still outstanding and block the next submission.
    writeRecord(BATCH_DIR, { ...record, collectedAt: new Date().toISOString() });

    const requested = Object.values(record.requests).flat().length;
    console.log(
      `Described ${Object.keys(accepted).length} of ${requested} icons from ${record.model} ` +
        `into ${record.out} ($${collected.cost.toFixed(3)} billed).`,
    );
    for (const problem of dropped) console.warn(`  dropped ${problem}`);
    for (const failure of collected.failures) console.warn(`  ${failure}`);
    // Nothing about a collected batch changes on a second fetch, so the icons a
    // failed request was carrying are closed by submitting them again.
    if (collected.failures.length) {
      console.warn(
        `${collected.failures.length} requests failed; re-run to describe what is left.`,
      );
    }
    process.exit(collected.failures.length ? 1 : 0);
  } catch (err) {
    fail((err as Error).message);
  }
}

const collection = loadCollection();
const all = iconNames(collection);
const existing = readDescriptions(OUTPUT);

const selectOrFail = (): string[][] => {
  try {
    return selectBatches({
      all,
      existing: new Set(Object.keys(existing)),
      only: values.only,
      force: values.force,
      limit,
      batchSize,
    });
  } catch (err) {
    return fail((err as Error).message);
  }
};
const batches = selectOrFail();

const total = batches.reduce((sum, batch) => sum + batch.length, 0);
console.log(
  `${all.length} icons, ${Object.keys(existing).length} described; ` +
    `${total} to do in ${batches.length} batches of up to ${batchSize} ` +
    `(${transport}, ${model}, ${size}px).`,
);
if (total === 0) process.exit(0);

// Up front so a missing key or binary surfaces before every PNG has been
// rendered, rather than as three retries per batch with backoff.
let price: Price | undefined;
try {
  if (paid) {
    price = pricingFor(model, transport).price;
    assertApiKey();
  } else {
    await assertClaudeAvailable();
  }
} catch (err) {
  fail((err as Error).message);
}

if (price) {
  const estimate = estimateCost(total, price);
  // A batch is billed only once its results come back, so the ceiling can do
  // nothing but refuse to submit. That is a weaker guarantee than the
  // synchronous path's running total, which aborts partway through a real spend.
  const ceiling =
    maxCost === undefined
      ? ""
      : transport === "batch"
        ? ` Refusing to submit above $${maxCost.toFixed(2)}.`
        : ` Stopping at $${maxCost.toFixed(2)}.`;
  console.log(
    `Estimated at least $${estimate.toFixed(2)} — image and text tokens ` +
      `only, thinking tokens are extra.${ceiling}`,
  );
  if (transport === "batch" && maxCost !== undefined && estimate > maxCost) {
    fail(
      `Estimated $${estimate.toFixed(2)} already exceeds --max-cost $${maxCost.toFixed(2)}, ` +
        `and the estimate is a floor. Nothing submitted.`,
    );
  }
}

console.log("Rendering PNGs…");
const { pngDir } = await ensurePngs({
  collection,
  names: batches.flat(),
  size,
  cacheDir: CACHE_DIR,
});

if (transport === "batch") {
  const { id: modelId, price: rate } = pricingFor(model, transport);
  const record = await submitBatch({
    batches,
    pngDir,
    modelId,
    price: rate,
    out: OUTPUT,
    key: assertApiKey(),
    recordDir: BATCH_DIR,
  });
  console.log(
    `Submitted batch ${record.id}: ${batches.length} requests, ${total} icons (${modelId}).\n` +
      `Results are retained 29 days from submission. Collect with:\n` +
      `  npm run gen:icon-descriptions -- --fetch ${record.id}`,
  );
  process.exit(0);
}

const result = await runBatches({
  batches,
  describeBatch: transport === "api" ? describeBatchApi : describeBatch,
  pngDir,
  model,
  validateEntry,
  maxCost,
  onAccept: (accepted) => mergeDescriptions(OUTPUT, accepted, canonicalModel(model)),
});

console.log(
  `Described ${result.described} icons in ${result.succeededBatches} batches ` +
    `($${result.totalCost.toFixed(3)} ${transport === "api" ? "billed" : "API-equivalent"}).`,
);
if (result.failedBatches) console.warn(`${result.failedBatches} batches failed; re-run to retry.`);
process.exit(result.aborted ? 1 : 0);
