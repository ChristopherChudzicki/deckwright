import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { validateEntry } from "../../src/data/iconDescriptions/entries";
import { server } from "../../src/test/msw";
import {
  acceptCollected,
  type BatchRecord,
  collectBatch,
  outstandingBatches,
  readRecord,
  readResults,
  requestId,
  submitBatch,
  writeRecord,
} from "./batch";
import { buildRequestParams } from "./invoke-api";

const BATCHES_URL = "https://api.anthropic.com/v1/messages/batches";
const RESULTS_URL = "https://api.anthropic.com/v1/messages/batches/msgbatch_01/results";

// Chosen so the arithmetic below is legible: 12,000 × $1 + 1,200 × $5 per
// million = $0.018 a request.
const PRICE = { input: 1, output: 5 };
const USAGE = { input_tokens: 12_000, output_tokens: 1_200 };
const COST_PER_REQUEST = 0.018;

// Only `price` and `requests` are read when collecting; a real model id here
// would imply a dependency that isn't there.
const record = (requests: Record<string, string[]>): BatchRecord => ({
  id: "msgbatch_01",
  model: "stub-model",
  price: PRICE,
  out: "/corpus/icons.json",
  submittedAt: "2026-07-27T00:00:00.000Z",
  requests,
});

const succeeded = (customId: string, descriptions: Record<string, string>) =>
  JSON.stringify({
    custom_id: customId,
    result: {
      type: "succeeded",
      message: {
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              descriptions: Object.entries(descriptions).map(([name, description]) => ({
                name,
                description,
              })),
            }),
          },
        ],
        usage: USAGE,
      },
    },
  });

// Real JSONL ends in a newline; the blank final element must not be parsed.
const jsonl = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("requestId", () => {
  // A 30-icon request cannot be keyed by icon name, so results are tied back to
  // icons by an index the record maps.
  test("numbers requests from one", () => {
    expect(requestId(0)).toBe("icons-0001");
    expect(requestId(137)).toBe("icons-0138");
  });
});

describe("readResults", () => {
  test("merges every request in the file and accumulates their cost", () => {
    const collected = readResults(
      jsonl(
        succeeded("icons-0001", { fireball: "A ball of flame." }),
        succeeded("icons-0002", { broadsword: "A straight blade." }),
      ),
      record({ "icons-0001": ["fireball"], "icons-0002": ["broadsword"] }),
    );

    expect(collected.descriptions).toEqual({
      fireball: "A ball of flame.",
      broadsword: "A straight blade.",
    });
    expect(collected.cost).toBeCloseTo(COST_PER_REQUEST * 2, 6);
    expect(collected.failures).toEqual([]);
  });

  // errored, canceled and expired all arrive as ordinary result lines, so a
  // partly-failed batch still has to yield everything that succeeded.
  test("reports a failed request without discarding the rest", () => {
    const collected = readResults(
      jsonl(
        JSON.stringify({
          custom_id: "icons-0001",
          result: {
            type: "errored",
            error: {
              type: "error",
              error: { type: "invalid_request_error", message: "too large" },
            },
          },
        }),
        succeeded("icons-0002", { broadsword: "A straight blade." }),
      ),
      record({ "icons-0001": ["fireball"], "icons-0002": ["broadsword"] }),
    );

    expect(collected.descriptions).toEqual({ broadsword: "A straight blade." });
    expect(collected.failures).toEqual(["icons-0001: errored — too large"]);
  });

  // A short results body produces no failing line of its own, so counting the
  // file against the record is the only thing that stops a partial collection
  // being reported as a complete one and paid for twice.
  test("reports a recorded request that no line accounted for", () => {
    const collected = readResults(
      jsonl(succeeded("icons-0001", { fireball: "A ball of flame." })),
      record({ "icons-0001": ["fireball"], "icons-0002": ["broadsword"] }),
    );

    expect(collected.descriptions).toEqual({ fireball: "A ball of flame." });
    expect(collected.failures).toEqual([expect.stringContaining("icons-0002")]);
  });

  test("keeps the requests above an unparseable line", () => {
    const collected = readResults(
      `${succeeded("icons-0001", { fireball: "A ball of flame." })}\n{"custom_id": "icons-00`,
      record({ "icons-0001": ["fireball"] }),
    );

    expect(collected.descriptions).toEqual({ fireball: "A ball of flame." });
    expect(collected.failures).toEqual([expect.stringContaining("line 2")]);
  });

  // The response was billed whether or not anything usable came back, so its
  // cost has to reach the reported total.
  test("charges a request whose message could not be read", () => {
    const collected = readResults(
      jsonl(
        JSON.stringify({
          custom_id: "icons-0001",
          result: {
            type: "succeeded",
            message: {
              stop_reason: "max_tokens",
              content: [
                { type: "text", text: '{"descriptions":[{"name":"fireball","description":"A ba' },
              ],
              usage: USAGE,
            },
          },
        }),
      ),
      record({ "icons-0001": ["fireball"] }),
    );

    expect(collected.descriptions).toEqual({});
    expect(collected.cost).toBeCloseTo(COST_PER_REQUEST, 6);
    expect(collected.failures).toEqual([expect.stringContaining("max_tokens")]);
  });
});

describe("acceptCollected", () => {
  // All-or-nothing here would throw away 29 paid-for descriptions over one bad
  // entry.
  test("keeps the good entries alongside a rejected one", () => {
    const { accepted, dropped } = acceptCollected(
      { fireball: "A ball of flame rendered as a sphere.", broadsword: "short" },
      validateEntry,
    );

    expect(accepted).toEqual({ fireball: "A ball of flame rendered as a sphere." });
    expect(dropped).toEqual([expect.stringContaining("broadsword")]);
  });
});

describe("readRecord", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "icon-batches-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("names the path it expected when no batch was recorded there", () => {
    expect(() => readRecord(dir, "msgbatch_missing")).toThrow(/msgbatch_missing\.json/);
  });

  // Reaching a missing price deep inside the per-line loop would report a fully
  // billed batch as $0.00 and merge nothing.
  test("rejects a record that carries no price", () => {
    const { price, ...priceless } = record({ "icons-0001": ["fireball"] });
    writeFileSync(join(dir, "msgbatch_01.json"), JSON.stringify(priceless), "utf8");

    expect(() => readRecord(dir, "msgbatch_01")).toThrow(/missing its price/);
  });
});

describe("outstandingBatches", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "icon-batches-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const submitted = record({ "icons-0001": ["fireball"] });

  test("reports nothing when the directory has never been written to", () => {
    expect(outstandingBatches(join(dir, "absent"), submitted.out)).toEqual([]);
  });

  // A batch that has been submitted but not collected is invisible to selection,
  // so submitting again pays for the same icons twice.
  test("lists submitted batches until they are marked collected", () => {
    writeRecord(dir, submitted);
    expect(outstandingBatches(dir, submitted.out)).toEqual([
      { name: "msgbatch_01", out: submitted.out, pending: false },
    ]);

    writeRecord(dir, { ...submitted, collectedAt: "2026-07-27T01:00:00.000Z" });
    expect(outstandingBatches(dir, submitted.out)).toEqual([]);
  });

  // Two models write to different corpora and so do not select from each other.
  // Blocking on the other one would force the runs to be serialized for nothing.
  test("ignores a batch writing to a different corpus", () => {
    writeRecord(dir, submitted);
    expect(outstandingBatches(dir, "/corpus/opus.json")).toEqual([]);
  });

  // Written before the POST, so it has no id and --fetch cannot reach it. The
  // caller has to tell those apart to give the right recovery instruction.
  test("marks a record written before its batch id was known", () => {
    writeFileSync(
      join(dir, "pending-2026-07-27T00-00-00-000Z.json"),
      JSON.stringify({ ...submitted, id: undefined }),
      "utf8",
    );
    expect(outstandingBatches(dir, submitted.out)).toEqual([
      { name: "pending-2026-07-27T00-00-00-000Z", out: submitted.out, pending: true },
    ]);
  });

  // Silently skipping an unreadable record would let the next submit re-pay for
  // whatever it was carrying.
  test("refuses to proceed past a record it cannot read", () => {
    writeFileSync(join(dir, "msgbatch_02.json"), "{ truncated", "utf8");
    expect(() => outstandingBatches(dir, submitted.out)).toThrow(/msgbatch_02\.json/);
  });
});

describe("submitBatch", () => {
  let pngDir: string;
  let recordDir: string;

  beforeEach(() => {
    pngDir = mkdtempSync(join(tmpdir(), "icon-png-"));
    recordDir = mkdtempSync(join(tmpdir(), "icon-batches-"));
    writeFileSync(join(pngDir, "fireball.png"), Buffer.from([1, 2, 3]));
    writeFileSync(join(pngDir, "broadsword.png"), Buffer.from([4, 5, 6]));
  });
  afterEach(() => {
    rmSync(pngDir, { recursive: true, force: true });
    rmSync(recordDir, { recursive: true, force: true });
  });

  const capture = () => {
    let seen: { requests?: { custom_id: string; params: Record<string, unknown> }[] } = {};
    server.use(
      http.post(BATCHES_URL, async ({ request }) => {
        seen = (await request.json()) as typeof seen;
        return HttpResponse.json({ id: "msgbatch_01", processing_status: "in_progress" });
      }),
    );
    return () => seen.requests ?? [];
  };

  const submit = (batches: string[][]) =>
    submitBatch({
      batches,
      pngDir,
      modelId: "claude-sonnet-5",
      price: PRICE,
      out: "/corpus/icons.json",
      key: "sk-test",
      recordDir,
    });

  // The batch path must not drift from the synchronous one: they have to put the
  // same images, prompt and schema in front of the model.
  test("sends one request per batch, carrying exactly the synchronous params", async () => {
    const requests = capture();
    await submit([["fireball"], ["broadsword"]]);

    expect(requests().map((request) => request.custom_id)).toEqual(["icons-0001", "icons-0002"]);
    expect(requests()[0].params).toEqual(
      await buildRequestParams(["fireball"], pngDir, "claude-sonnet-5"),
    );
  });

  test("records what each request asked for before returning", async () => {
    capture();
    const submitted = await submit([["fireball", "broadsword"]]);

    expect(readRecord(recordDir, "msgbatch_01")).toEqual(submitted);
    expect(submitted.requests).toEqual({ "icons-0001": ["fireball", "broadsword"] });
    expect(submitted.price).toEqual(PRICE);
  });

  // A 200 carrying no id would otherwise write `undefined.json` and print
  // `--fetch undefined`: submitted, billed, and uncollectable.
  test("refuses a batch that came back without an id", async () => {
    server.use(http.post(BATCHES_URL, () => HttpResponse.json({})));

    await expect(submit([["fireball"]])).rejects.toThrow(/carried no id/);
  });

  // If the connection drops after the server accepts the batch, the mapping
  // written up front is the only copy of it.
  test("leaves the request mapping on disk when the submission fails", async () => {
    server.use(http.post(BATCHES_URL, () => HttpResponse.error()));

    await expect(submit([["fireball"]])).rejects.toThrow(/may still have been created/);
    expect(readdirSync(recordDir)).toEqual([expect.stringMatching(/^pending-.*\.json$/)]);
  });

  test("throws with the status when the API rejects the batch", async () => {
    server.use(http.post(BATCHES_URL, () => HttpResponse.text("too large", { status: 413 })));

    await expect(submit([["fireball"]])).rejects.toThrow(/HTTP 413/);
  });
});

describe("collectBatch", () => {
  const status = (body: Record<string, unknown>) =>
    http.get(`${BATCHES_URL}/msgbatch_01`, () => HttpResponse.json(body));

  test("reports the status without downloading while still processing", async () => {
    const results = vi.fn();
    server.use(
      status({ processing_status: "in_progress", results_url: null }),
      http.get(RESULTS_URL, results),
    );

    const collected = await collectBatch(record({}), "sk-test");

    expect(collected).toEqual({ ended: false, status: "in_progress" });
    expect(results).not.toHaveBeenCalled();
  });

  test("downloads and reads the results once the batch has ended", async () => {
    server.use(
      status({ processing_status: "ended", results_url: RESULTS_URL }),
      http.get(RESULTS_URL, () =>
        HttpResponse.text(jsonl(succeeded("icons-0001", { fireball: "A ball of flame." }))),
      ),
    );

    const collected = await collectBatch(record({ "icons-0001": ["fireball"] }), "sk-test");

    expect(collected).toMatchObject({
      ended: true,
      descriptions: { fireball: "A ball of flame." },
    });
  });

  // A failed download must not read as an empty batch, or the operator concludes
  // it produced nothing and re-submits the whole corpus.
  test("names the download as the failure when the results cannot be fetched", async () => {
    server.use(
      status({ processing_status: "ended", results_url: RESULTS_URL }),
      http.get(RESULTS_URL, () => HttpResponse.text("gateway error", { status: 502 })),
    );

    await expect(collectBatch(record({}), "sk-test")).rejects.toThrow(
      /Downloading results.*HTTP 502/,
    );
  });

  test("throws with the status when retrieval fails", async () => {
    server.use(
      http.get(`${BATCHES_URL}/msgbatch_01`, () => HttpResponse.text("gone", { status: 404 })),
    );

    await expect(collectBatch(record({}), "sk-test")).rejects.toThrow(/Retrieving batch.*HTTP 404/);
  });
});
