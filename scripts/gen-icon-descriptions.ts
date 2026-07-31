import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CommanderError } from "@commander-js/extra-typings";
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
import { parseCliArgs } from "./icon-descriptions/cli";
import { confirm } from "./icon-descriptions/confirm";
import { assertClaudeAvailable, describeIcon } from "./icon-descriptions/invoke";
import {
  assertApiKey,
  canonicalModel,
  describeIconApi,
  estimateCost,
  type Price,
  pricingFor,
} from "./icon-descriptions/invoke-api";
import { ensurePngs, iconNames, loadCollection } from "./icon-descriptions/rasterize";
import { runRequests } from "./icon-descriptions/run";
import { selectIcons } from "./icon-descriptions/selection";
import { corpusModel, mergeDescriptions, readDescriptions } from "./icon-descriptions/store";
import { type CacheTtl, formatCacheUsage } from "./icon-descriptions/transport";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERRIDES = resolve(__dirname, "../src/data/iconDescriptions/overrides.json");
const CACHE_DIR = resolve(__dirname, "../.icon-cache");
const LOCKFILE = join(CACHE_DIR, "run.lock");
const BATCH_DIR = join(CACHE_DIR, "batches");

// Commander has already written its own message by the time it throws; this
// only maps its exit code onto the one the rest of the script uses for a refusal.
const values = (() => {
  try {
    return parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.exit(err instanceof CommanderError && err.exitCode === 0 ? 0 : 2);
  }
})();

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const OUTPUT = values.out;

if (values.validate) {
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

const { cacheTtl, limit, maxCost, model, size, transport } = values;

// `cli` spends subscription quota; `api` and `batch` spend money on an
// ANTHROPIC_API_KEY. Defaulting to `cli` keeps the zero-real-money path the one
// you get by accident.
const paid = transport !== "cli";

// `cli` sends its prompt after the images and marks nothing, so pricing or
// reporting one of its runs under the requested ttl would describe a cache it
// never asked for.
const effectiveTtl: CacheTtl = paid ? cacheTtl : "off";

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

    console.log(
      `Described ${Object.keys(accepted).length} of ${record.requests.length} icons from ` +
        `${record.model} into ${record.out} ($${collected.cost.toFixed(3)} billed).`,
    );
    // The only place the batch transport's cache hit rate is observable, and the
    // number the whole one-image-per-request design turns on. Reported under the
    // ttl the batch was submitted with, not this invocation's flag.
    const cacheReport = formatCacheUsage(collected.cache, record.cacheTtl ?? "off");
    if (cacheReport) console.log(`  ${cacheReport}`);
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

// Both rails below are about a run that is *about to describe icons*, so they sit
// after --fetch has had its turn and exited. Checking them earlier made a bare
// --fetch answer rail 4 with an instruction to run the command it had just
// refused, since --out and the outstanding batch resolve to the same corpus by
// construction now. Collecting is the remedy for rail 4, not an instance of it.

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

const collection = loadCollection();
const all = iconNames(collection);
const existing = readDescriptions(OUTPUT);

const selectOrFail = (): string[] => {
  try {
    return selectIcons({
      all,
      existing: new Set(Object.keys(existing)),
      only: values.only,
      force: values.force,
      limit,
    });
  } catch (err) {
    return fail((err as Error).message);
  }
};
const icons = selectOrFail();

const total = icons.length;
console.log(
  `${all.length} icons, ${Object.keys(existing).length} described; ` +
    `${total} to do, one request each (${transport}, ${model}, ${size}px).`,
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
  const estimate = estimateCost(total, price, effectiveTtl);
  // A batch is billed only once its results come back, so the ceiling can do
  // nothing but refuse to submit. That is a weaker guarantee than the
  // synchronous path's running total, which aborts partway through a real spend.
  const ceiling =
    maxCost === undefined
      ? ""
      : transport === "batch"
        ? ` Refusing to submit above $${maxCost.toFixed(2)}.`
        : ` Stopping at $${maxCost.toFixed(2)}.`;
  // The two bounds are the same number when no prefix is cached, and otherwise
  // straddle a hit rate nobody can predict — which is why the run reports the
  // rate it actually got.
  const range =
    estimate.floor === estimate.ceiling
      ? `at least $${estimate.floor.toFixed(2)}`
      : `$${estimate.floor.toFixed(2)}–$${estimate.ceiling.toFixed(2)}, depending on how ` +
        `many requests re-read the cached instructions rather than writing them again`;
  console.log(
    `Estimated ${range} — image and text tokens only, thinking tokens are extra.${ceiling}`,
  );
  // Compared against the worst case, not the best: a submitted batch cannot be
  // stopped partway, so a ceiling that only the luckiest cache outcome fits
  // under is not a ceiling.
  if (transport === "batch" && maxCost !== undefined && estimate.ceiling > maxCost) {
    fail(
      `Estimated up to $${estimate.ceiling.toFixed(2)} against --max-cost ` +
        `$${maxCost.toFixed(2)}, and the estimate counts no thinking tokens. Nothing submitted.`,
    );
  }

  // Bare --force re-describes every icon that already has an entry. On the CLI
  // that spends quota which refills; over the API it is an unbounded charge one
  // keystroke away from a scoped re-run. Asked here rather than at parse time so
  // the question carries the count and the estimate it is really about — and
  // still before any PNG is rendered or any request sent. Not asked under
  // --dry-run, which reaches no spend to approve.
  if (values.force && !values.only && limit === undefined && !values.dryRun) {
    const proceed = await confirm(
      `Re-describing all ${total} icons in ${OUTPUT} over ${transport} ` +
        `(${model}), estimated ${range}. Proceed?`,
    );
    if (!proceed) {
      fail(
        process.stdin.isTTY
          ? "Cancelled; nothing spent."
          : "--force needs an interactive confirmation on a paid transport. " +
              "Scope it with --only or --limit, or re-run in a terminal.",
      );
    }
  }
}

// After the selection and the estimate have printed and before anything is
// rendered or sent. The old way to preview a run was a --max-cost the estimate
// could not meet, which only ever worked by luck of magnitude: it is rail 3
// refusing, so a selection small enough to fit under the ceiling submits instead.
// That is how a run meant as a preview submitted a live batch.
if (values.dryRun) {
  console.log("Dry run; nothing rendered, nothing sent.");
  process.exit(0);
}

console.log("Rendering PNGs…");
const { pngDir } = await ensurePngs({
  collection,
  names: icons,
  size,
  cacheDir: CACHE_DIR,
});

if (transport === "batch") {
  const { id: modelId, price: rate } = pricingFor(model, transport);
  // Submitting uploads ~114MB, so the failure worth reading here is a rejected
  // payload — which arrives as an HTTP error carrying the pending record's path,
  // not as something a stack trace would explain.
  try {
    const record = await submitBatch({
      icons,
      pngDir,
      modelId,
      price: rate,
      cacheTtl,
      out: OUTPUT,
      key: assertApiKey(),
      recordDir: BATCH_DIR,
    });
    console.log(
      `Submitted batch ${record.id}: ${total} requests, one icon each (${modelId}).\n` +
        `Results are retained 29 days from submission. Collect with:\n` +
        `  npm run gen:icon-descriptions -- --fetch ${record.id}`,
    );
  } catch (err) {
    fail((err as Error).message);
  }
  process.exit(0);
}

const result = await runRequests({
  icons,
  describeIcon: transport === "api" ? describeIconApi : describeIcon,
  pngDir,
  model,
  cache: effectiveTtl,
  validateEntry,
  maxCost,
  onAccept: (accepted) => mergeDescriptions(OUTPUT, accepted, canonicalModel(model)),
});

console.log(
  `Described ${result.described} icons in ${result.succeededRequests} requests ` +
    `($${result.totalCost.toFixed(3)} ${transport === "api" ? "billed" : "API-equivalent"}).`,
);
const cacheReport = formatCacheUsage(result.cache, effectiveTtl);
if (cacheReport) console.log(`  ${cacheReport}`);
if (result.failedRequests) {
  console.warn(`${result.failedRequests} requests failed; re-run to retry.`);
}
process.exit(result.aborted ? 1 : 0);
