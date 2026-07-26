import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isNameEcho, validateEntry } from "../src/data/iconDescriptions";
import { DEFAULT_MODEL, describeBatch } from "./icon-descriptions/invoke";
import {
  DEFAULT_RENDER_SIZE,
  ensurePngs,
  iconNames,
  loadCollection,
} from "./icon-descriptions/rasterize";
import { runBatches } from "./icon-descriptions/run";
import { DEFAULT_BATCH_SIZE, selectBatches } from "./icon-descriptions/selection";
import { readDescriptions, writeDescriptions } from "./icon-descriptions/store";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "../src/data/icon-descriptions.json");
const CACHE_DIR = resolve(__dirname, "../.icon-cache");
const LOCKFILE = join(CACHE_DIR, "run.lock");

const { values } = parseArgs({
  options: {
    only: { type: "string", multiple: true },
    "batch-size": { type: "string", default: String(DEFAULT_BATCH_SIZE) },
    force: { type: "boolean", default: false },
    validate: { type: "boolean", default: false },
    limit: { type: "string" },
    model: { type: "string", default: DEFAULT_MODEL },
    size: { type: "string", default: String(DEFAULT_RENDER_SIZE) },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

if (values.validate) {
  const conflicting = (["only", "force", "limit"] as const).filter((flag) => {
    const value = values[flag];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
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

  console.log(`Validated ${Object.keys(descriptions).length} entries.`);
  for (const name of echoes) console.warn(`  WARN: ${name} adds nothing beyond its own name`);
  for (const problem of problems) console.error(`  FAIL: ${problem}`);
  process.exit(problems.length ? 1 : 0);
}

const positiveInt = (raw: string | undefined, flag: string): number | undefined => {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) fail(`--${flag} must be a positive integer`);
  return value;
};

const batchSize = positiveInt(values["batch-size"], "batch-size") as number;
const size = positiveInt(values.size, "size") as number;
const limit = positiveInt(values.limit, "limit");

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
process.on("SIGINT", () => process.exit(130));

const collection = loadCollection();
const all = iconNames(collection);
const existing = readDescriptions(OUTPUT);

const batches = selectBatches({
  all,
  existing: new Set(Object.keys(existing)),
  only: values.only,
  force: values.force,
  limit,
  batchSize,
});

const total = batches.reduce((sum, batch) => sum + batch.length, 0);
console.log(
  `${all.length} icons, ${Object.keys(existing).length} described; ` +
    `${total} to do in ${batches.length} batches of ${batchSize} (${values.model}, ${size}px).`,
);
if (total === 0) process.exit(0);

console.log("Rendering PNGs…");
const pngs = await ensurePngs({ collection, names: batches.flat(), size, cacheDir: CACHE_DIR });
const pngDir = dirname(pngs.values().next().value as string);

const result = await runBatches({
  batches,
  describeBatch,
  pngDir,
  model: values.model as string,
  validateEntry,
  onAccept: (accepted) => {
    // Re-read before each merge: the file is the progress marker, so a crash
    // must leave every accepted batch on disk.
    writeDescriptions(OUTPUT, { ...readDescriptions(OUTPUT), ...accepted });
  },
});

console.log(
  `Described ${result.described} icons in ${batches.length - result.failedBatches} batches ` +
    `($${result.totalCost.toFixed(2)} API-equivalent).`,
);
if (result.failedBatches) console.warn(`${result.failedBatches} batches failed; re-run to retry.`);
process.exit(result.aborted ? 1 : 0);
