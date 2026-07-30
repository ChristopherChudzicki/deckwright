import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "@commander-js/extra-typings";
import { SHUFFLE_SEED, shuffleSeeded } from "../src/data/iconDescriptions/shuffle";
import { FLAGS, positiveDollars, positiveInt, workbenchCorpus } from "./icon-descriptions/cli";
import {
  buildFlagPrompt,
  chunk,
  estimateFlagCost,
  extractVerdicts,
  FLAG_SCHEMA,
  pairArms,
  readVerdicts,
  type Verdict,
} from "./icon-descriptions/flag";
import { apiHeaders, assertApiKey, resolveModel } from "./icon-descriptions/invoke-api";
import { readDescriptions } from "./icon-descriptions/store";
import type { BatchFailure } from "./icon-descriptions/transport";

const API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 600_000;
const MAX_TOKENS = 32_000;
const RETRY_DELAYS_MS = [5_000, 20_000];
const FATAL_STATUSES = new Set([400, 401, 403, 404]);

// `a` is the arm that ships, so it is the one `nameConflict` is asked about.
const SHIPPED_ARM = "claude-opus-5";
const OTHER_ARM = "claude-sonnet-5";

const program = new Command()
  .name("npm run flag:icon-descriptions")
  .usage("-- [flags]")
  .description(
    "Reads both model corpora and asks a model, per icon, whether the two descriptions " +
      "disagree about what the artwork depicts and whether the shipped one contradicts the " +
      "icon's name. Sends no images — this is a text pass over descriptions already paid for, " +
      "which is why it costs a fraction of a generation arm.\n\n" +
      "It flags; it does not resolve. Reading the queue against the actual artwork is a " +
      "human's job, and the fix lands in corpus/choices.json or overrides.json.",
  )
  .option("--model <name>", "which model judges", "sonnet")
  // The API defaults this to `high`, which on a mechanical comparison buys
  // deliberation nobody asked for: a measured chunk spent four times more
  // output tokens on thinking than on the verdicts themselves.
  .option("--effort <low|medium|high|xhigh|max>", "how hard the judge thinks", "medium")
  .option("--chunk <n>", "icons per request", positiveInt, 50)
  .option("--limit <n>", "judge at most n unjudged icons")
  .option("--out <path>", "where to write the verdicts", FLAGS)
  .option("--max-cost <usd>", "stop once the running total reaches this", positiveDollars)
  .option("--force", "re-judge icons that already have a verdict")
  .option("--dry-run", "print the selection and the estimate, then exit without sending")
  .parse();

const opts = program.opts();

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const OUT = resolve(opts.out);

const writeFlags = (verdicts: Record<string, Verdict>): void => {
  const sorted: Record<string, Verdict> = {};
  for (const key of Object.keys(verdicts).sort()) sorted[key] = verdicts[key];
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  renameSync(tmp, OUT);
};

const { pairs, unpaired } = pairArms(
  readDescriptions(workbenchCorpus(SHIPPED_ARM)),
  readDescriptions(workbenchCorpus(OTHER_ARM)),
);
if (!pairs.length) {
  fail(`No icon is described by both ${SHIPPED_ARM} and ${OTHER_ARM}; nothing to compare.`);
}

const judged = existsSync(OUT) ? readVerdicts(JSON.parse(readFileSync(OUT, "utf8")), OUT) : {};

// Shuffled before the limit is applied, for the same reason selection.ts does
// it: the collection is alphabetical and its names are thematically clustered,
// so the first n of it are not a sample of anything. The first 50 alphabetically
// are `3d-meeple` followed by the `abstract-0NN` block — the least
// representative icons in the collection, and the ones two models are likeliest
// to disagree about. Seeded, so a --limit run stays paired across re-runs.
const shuffled = shuffleSeeded(pairs, SHUFFLE_SEED);
const pending = opts.force ? shuffled : shuffled.filter(({ name }) => !(name in judged));
const selected = opts.limit === undefined ? pending : pending.slice(0, positiveInt(opts.limit));
const chunks = chunk(selected, opts.chunk);

const { id: modelId, price } = resolveModel(opts.model);
const estimate = estimateFlagCost(selected.length, price);

console.log(
  `${pairs.length} icons described by both arms, ${Object.keys(judged).length} judged; ` +
    `${selected.length} to do in ${chunks.length} requests of up to ${opts.chunk} (${modelId}).`,
);
if (unpaired.length) {
  console.warn(`  ${unpaired.length} icons are in only one arm and cannot be compared.`);
}
if (selected.length === 0) process.exit(0);
console.log(
  `Estimated $${estimate.toFixed(2)}, calibrated at --effort medium; a lower effort thinks ` +
    "less and bills less.",
);

if (opts.dryRun) {
  console.log("Dry run; nothing sent.");
  process.exit(0);
}

const key = (() => {
  try {
    return assertApiKey();
  } catch (err) {
    return fail((err as Error).message);
  }
})();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const judge = async (batch: typeof pairs) => {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: apiHeaders(key),
    body: JSON.stringify({
      model: modelId,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: buildFlagPrompt(batch) }],
      output_config: {
        effort: opts.effort,
        format: { type: "json_schema", schema: FLAG_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  if (!response.ok) {
    const seconds = Number(response.headers.get("retry-after"));
    throw {
      message: `HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`,
      fatal: FATAL_STATUSES.has(response.status),
      retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : undefined,
    } as BatchFailure;
  }
  return extractVerdicts(
    JSON.parse(body),
    batch.map(({ name }) => name),
    price,
  );
};

let total = 0;
let failedChunks = 0;
let aborted = false;

for (const [index, batch] of chunks.entries()) {
  const label = `chunk ${index + 1}/${chunks.length} (${batch.length})`;
  let accepted: Record<string, Verdict> | null = null;
  let tokens = { input: 0, output: 0, thinking: undefined as number | undefined };
  let nextDelayMs: number | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(nextDelayMs ?? RETRY_DELAYS_MS[attempt - 1]);
    try {
      const result = await judge(batch);
      total += result.cost;
      accepted = result.verdicts;
      tokens = {
        input: result.inputTokens,
        output: result.outputTokens,
        thinking: result.thinkingTokens,
      };
      break;
    } catch (err) {
      const failure = err as BatchFailure;
      total += failure.cost ?? 0;
      console.warn(`  ${label} attempt ${attempt + 1} failed: ${failure.message}`);
      if (failure.fatal) {
        console.error(`Aborting: ${failure.message}`);
        aborted = true;
        break;
      }
      if (failure.retryable === false) break;
      nextDelayMs = failure.retryAfterMs;
    }
  }
  if (aborted) break;

  if (!accepted) {
    failedChunks++;
    continue;
  }

  // Written per chunk rather than at the end, so an abort keeps everything paid
  // for so far and the next run skips it.
  Object.assign(judged, accepted);
  writeFlags(judged);

  const flagged = Object.values(accepted).filter((v) => v.conflict || v.nameConflict).length;
  const missing = batch.length - Object.keys(accepted).length;
  console.log(
    `  ${label}: +${Object.keys(accepted).length}${missing ? `, ${missing} missing` : ""} · ` +
      `${flagged} flagged · ${tokens.input}in/${tokens.output}out` +
      `${tokens.thinking === undefined ? "" : ` (${tokens.thinking} thinking)`} · ` +
      `$${total.toFixed(3)} total`,
  );

  if (opts.maxCost !== undefined && total >= opts.maxCost) {
    console.warn(
      `Stopping: $${total.toFixed(3)} reaches the --max-cost ceiling of ` +
        `$${opts.maxCost.toFixed(2)}. Re-run to continue where this left off.`,
    );
    aborted = true;
    break;
  }
}

const conflicts = Object.entries(judged).filter(([, v]) => v.conflict);
const nameConflicts = Object.entries(judged).filter(([, v]) => v.nameConflict);
console.log(
  `Judged ${Object.keys(judged).length} of ${pairs.length} icons ($${total.toFixed(3)} billed).\n` +
    `  ${conflicts.length} arms disagree · ${nameConflicts.length} contradict the icon name`,
);
if (failedChunks) console.warn(`${failedChunks} chunks failed; re-run to retry them.`);
process.exit(aborted || failedChunks ? 1 : 0);
