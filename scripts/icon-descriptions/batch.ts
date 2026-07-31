import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { apiHeaders, buildRequestParams, extractMessage, type Price } from "./invoke-api";
import {
  addCacheUsage,
  type CacheTtl,
  type CacheUsage,
  type RequestFailure,
  requestFailure,
} from "./transport";

const BATCHES_URL = "https://api.anthropic.com/v1/messages/batches";
// The submit POST uploads ~100MB of base64, so this is far longer than the
// synchronous transport's ceiling. An unbounded wait would hang holding the run
// lockfile, blocking every later invocation with no indication why.
const HTTP_TIMEOUT_MS = 900_000;

export type BatchRecord = {
  id: string;
  model: string;
  // Frozen at submit rather than re-derived at collection: an introductory rate
  // that lapses between the two would otherwise be reported as the billed one.
  price: Price;
  // Frozen for the same reason. The multiplier that prices a cached prefix is a
  // property of the request that was sent, and a run collected under a different
  // --cache-ttl hours later would report every cached token at the wrong rate.
  // Absent on records written before caching existed, which sent no prefix.
  cacheTtl?: CacheTtl;
  // Where this batch's descriptions belong. Carried on the record rather than
  // passed to `--fetch`, so collecting an Opus batch into the Sonnet corpus is
  // not something an operator can do by mistyping a flag hours later.
  out: string;
  submittedAt: string;
  // The icons this batch was submitted for, in submission order. Kept even
  // though `custom_id` now carries the name, because collection checks the
  // downloaded results against the manifest: a short results body has no
  // failures of its own to report.
  requests: string[];
  collectedAt?: string;
};

const recordPath = (dir: string, id: string): string => join(dir, `${id}.json`);

const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(`${path}.tmp`, path);
};

// A record outlives the tool version that wrote it. Reaching a missing `price`
// deep inside the per-line loop would price a fully billed batch at $0.00 and
// merge nothing, so the shape is checked once, up front, where it can say so.
function assertRecord(value: unknown, path: string): BatchRecord {
  const record = value as BatchRecord;
  const priced =
    typeof record?.price?.input === "number" && typeof record.price?.output === "number";
  if (
    !priced ||
    typeof record.out !== "string" ||
    typeof record.requests !== "object" ||
    record.requests === null
  ) {
    throw new Error(`Batch record at ${path} is missing its price, corpus path, or requests.`);
  }
  return record;
}

export function readRecord(dir: string, id: string): BatchRecord {
  const path = recordPath(dir, id);
  if (!existsSync(path)) {
    throw new Error(`No submitted batch recorded at ${path}.`);
  }
  return assertRecord(JSON.parse(readFileSync(path, "utf8")), path);
}

export function writeRecord(dir: string, record: BatchRecord): void {
  writeJson(recordPath(dir, record.id), record);
}

// A pending record is written before the POST and so has no id yet. It cannot
// be collected with `--fetch` — the GET would ask for batch `undefined` — and it
// is exactly the case where a batch may already have been created and billed,
// so it is reported apart from the collectable ones.
export type OutstandingBatch = { name: string; out: string; pending: boolean };

// Submitting is the only irreversible step here, and the selection that drives
// it reads the corpus file, which an outstanding batch has not yet written to.
// Without this, re-running submit while a batch is in flight silently pays for
// the same 4,134 icons twice. Scoped by corpus: two batches writing to different
// files do not select from each other, so a Sonnet and an Opus run can be in
// flight at once.
export function outstandingBatches(dir: string, out: string): OutstandingBatch[] {
  if (!existsSync(dir)) return [];
  const outstanding: OutstandingBatch[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    let record: BatchRecord;
    try {
      record = assertRecord(JSON.parse(readFileSync(path, "utf8")), path);
    } catch (err) {
      // An unreadable record cannot be shown to target another corpus, so it has
      // to block: the alternative is paying twice for whatever it was carrying.
      throw new Error(`Cannot read ${path}: ${(err as Error).message}`);
    }
    if (record.out !== out || record.collectedAt !== undefined) continue;
    // Keyed on the absent id rather than the filename: a record that reached its
    // id but crashed before being renamed is still sitting under its pending
    // name, and it is collectable — `--fetch` resolves a record by filename.
    outstanding.push({
      name: file.replace(/\.json$/, ""),
      out: record.out,
      pending: typeof record.id !== "string",
    });
  }
  return outstanding;
}

async function assertOk(response: Response, what: string): Promise<string> {
  const body = await response.text();
  if (!response.ok) {
    throw requestFailure(
      `${what} failed: HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`,
    );
  }
  return body;
}

export async function submitBatch(opts: {
  icons: readonly string[];
  pngDir: string;
  modelId: string;
  price: Price;
  cacheTtl: CacheTtl;
  out: string;
  key: string;
  recordDir: string;
}): Promise<BatchRecord> {
  const { icons, pngDir, modelId, price, cacheTtl, out, key, recordDir } = opts;

  // Built one at a time: each request reads and base64-encodes its own PNG, and
  // resolving them all concurrently would hold 4,134 file descriptors open.
  //
  // custom_id must match ^[a-zA-Z0-9_-]{1,64}$, which every icon name does — the
  // longest is 33 characters — so with one icon per request the name itself ties
  // a result line back to its icon. The API documents that results may come back
  // in any order, which is why the tie has to be carried explicitly.
  const requests = [];
  for (const name of icons) {
    requests.push({
      custom_id: name,
      params: await buildRequestParams(name, pngDir, modelId, cacheTtl),
    });
  }

  const submittedAt = new Date().toISOString();
  const mapping = [...icons];
  // The mapping is written before the request, not after: if the connection
  // drops once the server has accepted the batch, this file is the only copy of
  // it, and a batch whose mapping is lost is billed and uncollectable.
  const pendingPath = join(recordDir, `pending-${submittedAt.replaceAll(/[:.]/g, "-")}.json`);
  writeJson(pendingPath, { model: modelId, price, cacheTtl, out, submittedAt, requests: mapping });

  // Only the transport failure is caught here. A request that never got an
  // answer may or may not have created a batch, and the pending record is the
  // only copy of its mapping, so it has to survive.
  let response: Response;
  try {
    response = await fetch(BATCHES_URL, {
      method: "POST",
      headers: apiHeaders(key),
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (err) {
    throw requestFailure(
      `${(err as Error).message}\nThe batch may still have been created. Its request ` +
        `mapping is at ${pendingPath}; list your batches before submitting again.`,
    );
  }

  // A rejected request created nothing, so the record is noise. Left behind it
  // would block every later run against this corpus while telling the operator
  // to go looking for a batch that does not exist.
  if (!response.ok) rmSync(pendingPath);
  const body = await assertOk(response, "Submitting the batch");

  const id = (JSON.parse(body) as { id?: unknown }).id;
  if (typeof id !== "string") {
    throw requestFailure(`Batch was accepted but carried no id: ${body.slice(0, 300)}`);
  }

  const record: BatchRecord = {
    id,
    model: modelId,
    price,
    cacheTtl,
    out,
    submittedAt,
    requests: mapping,
  };
  // Rewritten in place and renamed rather than written to its final name and the
  // pending file then deleted: a crash between those two would leave both files
  // for one batch, and the pending one — never collectable, never marked — would
  // block every later run against this corpus with no way to tell it was stale.
  writeJson(pendingPath, record);
  renameSync(pendingPath, recordPath(recordDir, id));
  return record;
}

type ResultLine = {
  custom_id?: unknown;
  // The batch envelope nests a whole error response under `error`, so the
  // human-readable text is at `error.error.message`.
  result?: { type?: unknown; message?: unknown; error?: { error?: { message?: unknown } } };
};

export type Collected = {
  descriptions: Record<string, string>;
  cost: number;
  cache: CacheUsage;
  failures: string[];
};

// Pure so the envelope handling can be tested without a server: the JSONL is
// the only place per-request outcomes (errored, canceled, expired) surface, and
// the only place a batch's cache hit rate can be counted.
export function readResults(jsonl: string, record: BatchRecord): Collected {
  const descriptions: Record<string, string> = {};
  const failures: string[] = [];
  const seen = new Set<string>();
  const submitted = new Set(record.requests);
  let cost = 0;
  let cache: CacheUsage = { created: 0, read: 0 };

  for (const [index, line] of jsonl.split("\n").entries()) {
    if (!line.trim()) continue;
    let id = `line ${index + 1}`;
    try {
      const { custom_id: customId, result } = JSON.parse(line) as ResultLine;
      if (typeof customId === "string") id = customId;
      if (!submitted.has(id)) {
        failures.push(`${id}: result for a request this batch did not record`);
        continue;
      }
      seen.add(id);
      if (result?.type !== "succeeded") {
        const detail = result?.error?.error?.message;
        failures.push(`${id}: ${String(result?.type)}${detail ? ` — ${String(detail)}` : ""}`);
        continue;
      }
      const extracted = extractMessage(result.message, id, record.price, record.cacheTtl ?? "off");
      cost += extracted.cost;
      cache = addCacheUsage(cache, extracted.cache);
      descriptions[id] = extracted.description;
    } catch (err) {
      // A request that reached the model was billed whether or not anything
      // usable came back, and it wrote or read its prefix either way.
      const failure = err as RequestFailure;
      cost += failure.cost ?? 0;
      cache = addCacheUsage(cache, failure.cache);
      failures.push(`${id}: ${failure.message}`);
    }
  }

  // Counted against the record, not the file. A short results body yields fewer
  // lines with no failures of their own, which would otherwise report a partial
  // collection as a complete one and send the missing icons back through a
  // second, paid submission.
  for (const name of record.requests) {
    if (!seen.has(name)) failures.push(`${name}: no result line in the downloaded results`);
  }

  return { descriptions, cost, cache, failures };
}

// Validation is what stands between a paid-for response and the shipped corpus,
// and dropping one bad entry must never discard the rest of the collection.
export function acceptCollected(
  descriptions: Record<string, string>,
  validateEntry: (name: string, description: string) => string | null,
): { accepted: Record<string, string>; dropped: string[] } {
  const accepted: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [name, description] of Object.entries(descriptions)) {
    const problem = validateEntry(name, description);
    if (problem) dropped.push(problem);
    else accepted[name] = description;
  }
  return { accepted, dropped };
}

export async function collectBatch(
  record: BatchRecord,
  key: string,
): Promise<{ ended: false; status: string } | ({ ended: true } & Collected)> {
  const get = (url: string) =>
    fetch(url, { headers: apiHeaders(key), signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });

  const status = await get(`${BATCHES_URL}/${record.id}`);
  const body = await assertOk(status, `Retrieving batch ${record.id}`);
  const { processing_status: processingStatus, results_url: resultsUrl } = JSON.parse(body) as {
    processing_status?: unknown;
    results_url?: unknown;
  };

  if (processingStatus !== "ended") {
    return { ended: false, status: String(processingStatus) };
  }
  if (typeof resultsUrl !== "string") {
    throw requestFailure(`Batch ${record.id} has ended but published no results_url.`);
  }

  const results = await get(resultsUrl);
  const jsonl = await assertOk(results, `Downloading results for batch ${record.id}`);
  return { ended: true, ...readResults(jsonl, record) };
}
