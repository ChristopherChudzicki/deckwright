import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isNameEcho, validateEntry } from "../src/data/iconDescriptions";
import { assertClaudeAvailable, DEFAULT_MODEL, describeBatch } from "./icon-descriptions/invoke";
import {
  DEFAULT_RENDER_SIZE,
  ensurePngs,
  iconNames,
  loadCollection,
} from "./icon-descriptions/rasterize";
import { runBatches } from "./icon-descriptions/run";
import { DEFAULT_BATCH_SIZE, selectBatches } from "./icon-descriptions/selection";
import { mergeDescriptions, readDescriptions } from "./icon-descriptions/store";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "../src/data/icon-descriptions.json");
const CACHE_DIR = resolve(__dirname, "../.icon-cache");
const LOCKFILE = join(CACHE_DIR, "run.lock");

// No parseArgs defaults: --validate is exclusive, and a defaulted flag is
// indistinguishable from one the operator actually passed.
const { values } = parseArgs({
  options: {
    only: { type: "string", multiple: true },
    "batch-size": { type: "string" },
    force: { type: "boolean" },
    validate: { type: "boolean" },
    limit: { type: "string" },
    model: { type: "string" },
    size: { type: "string" },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

if (values.validate) {
  const conflicting = (["only", "batch-size", "force", "limit", "model", "size"] as const).filter(
    (flag) => values[flag] !== undefined,
  );
  if (conflicting.length) {
    fail(`--validate is exclusive; remove: ${conflicting.map((f) => `--${f}`).join(", ")}`);
  }

  const descriptions = readDescriptions(OUTPUT);
  const problems: string[] = [];
  const echoes: string[] = [];
  for (const [name, description] of Object.entries(descriptions)) {
    const problem = validateEntry(name, description);
    if (problem) problems.push(problem);
    else if (isNameEcho(name, description)) echoes.push(name);
  }

  // Iterating the file alone reports nothing about icons that have no entry at
  // all, which is exactly the list `--only` needs to close a residue.
  const missing = iconNames(loadCollection()).filter((name) => !(name in descriptions));

  console.log(`Validated ${Object.keys(descriptions).length} entries; ${missing.length} missing.`);
  for (const name of echoes) console.warn(`  WARN: ${name} adds nothing beyond its own name`);
  for (const problem of problems) console.error(`  FAIL: ${problem}`);
  if (missing.length) {
    console.error(`  MISSING (${missing.length}): ${missing.join(" ")}`);
    console.error(`  Close them with: ${missing.map((n) => `--only ${n}`).join(" ")}`);
  }
  process.exit(problems.length || missing.length ? 1 : 0);
}

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

// Concurrent runs would lose updates: each reads the file, merges, and renames
// over the other's work.
mkdirSync(CACHE_DIR, { recursive: true });
if (existsSync(LOCKFILE)) {
  fail(`Another run holds ${LOCKFILE}. Delete it if no run is in progress.`);
}
closeSync(openSync(LOCKFILE, "wx"));
process.on("exit", () => {
  if (existsSync(LOCKFILE)) unlinkSync(LOCKFILE);
});
// Ctrl-C and `kill` default to terminating without running exit handlers, so
// route them through process.exit to release the lock.
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
process.on("SIGHUP", () => process.exit(129));

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
    `${total} to do in ${batches.length} batches of up to ${batchSize} (${model}, ${size}px).`,
);
if (total === 0) process.exit(0);

await assertClaudeAvailable();

console.log("Rendering PNGs…");
const { pngDir } = await ensurePngs({
  collection,
  names: batches.flat(),
  size,
  cacheDir: CACHE_DIR,
});

const result = await runBatches({
  batches,
  describeBatch,
  pngDir,
  model,
  validateEntry,
  onAccept: (accepted) => mergeDescriptions(OUTPUT, accepted),
});

console.log(
  `Described ${result.described} icons in ${result.succeededBatches} batches ` +
    `($${result.totalCost.toFixed(2)} API-equivalent).`,
);
if (result.failedBatches) console.warn(`${result.failedBatches} batches failed; re-run to retry.`);
process.exit(result.aborted ? 1 : 0);
