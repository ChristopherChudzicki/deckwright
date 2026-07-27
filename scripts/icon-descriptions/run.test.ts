import { describe, expect, test, vi } from "vitest";
import { runBatches } from "./run";
import { batchFailure, type DescribeBatch } from "./transport";

const ok = (names: readonly string[]): Record<string, string> =>
  Object.fromEntries(names.map((n) => [n, `A drawing of a ${n}.`]));

// runBatches only forwards the model to describeBatch, which is stubbed in
// every test here, so naming a real model would imply a dependency there isn't.
const MODEL = "stub-model";

const run = (
  batches: string[][],
  describeBatch: DescribeBatch,
  overrides: Partial<Parameters<typeof runBatches>[0]> = {},
) => {
  const accepted: Record<string, string> = {};
  const promise = runBatches({
    batches,
    describeBatch,
    pngDir: "/tmp/png",
    model: MODEL,
    onAccept: (entries) => Object.assign(accepted, entries),
    validateEntry: () => null,
    sleep: async () => {},
    log: () => {},
    ...overrides,
  });
  return { promise, accepted };
};

describe("runBatches", () => {
  test("describes every batch and reports the running cost", async () => {
    const describeBatch = vi.fn<DescribeBatch>(async (names) => ({
      descriptions: ok(names),
      cost: 0.3,
    }));
    const { promise, accepted } = run([["a", "b"], ["c"]], describeBatch);
    const result = await promise;

    expect(Object.keys(accepted).sort()).toEqual(["a", "b", "c"]);
    expect(result).toMatchObject({
      described: 3,
      succeededBatches: 2,
      failedBatches: 0,
      aborted: false,
    });
    expect(result.totalCost).toBeCloseTo(0.6);
  });

  test("invokes batches sequentially", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const describeBatch = vi.fn<DescribeBatch>(async (names) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return { descriptions: ok(names), cost: 0 };
    });
    await run([["a"], ["b"], ["c"]], describeBatch).promise;

    expect(maxInFlight).toBe(1);
  });

  // The file is the progress marker, so a crash must leave every accepted batch
  // on disk. Asserting the interleaving is what rules out a buffer-then-flush
  // refactor; a call count alone is satisfied by three flushes at the end.
  test("hands over each accepted batch as it lands, not once at the end", async () => {
    const events: string[] = [];
    const describeBatch = vi.fn<DescribeBatch>(async (names) => {
      events.push(`describe:${names[0]}`);
      return { descriptions: ok(names), cost: 0 };
    });
    await runBatches({
      batches: [["a"], ["b"], ["c"]],
      describeBatch,
      pngDir: "/tmp/png",
      model: MODEL,
      onAccept: (entries) => events.push(`accept:${Object.keys(entries)[0]}`),
      validateEntry: () => null,
      sleep: async () => {},
      log: () => {},
    });

    expect(events).toEqual([
      "describe:a",
      "accept:a",
      "describe:b",
      "accept:b",
      "describe:c",
      "accept:c",
    ]);
  });

  // Partial acceptance: all-or-nothing would discard 29 good descriptions
  // over one bad one, permanently, on every future run.
  test("keeps the good entries of a batch with one invalid entry", async () => {
    const describeBatch = vi.fn<DescribeBatch>(async (names) => ({
      descriptions: { ...ok(names), b: "no" },
      cost: 0,
    }));
    const { promise, accepted } = run([["a", "b", "c"]], describeBatch, {
      validateEntry: (_name, description) => (description === "no" ? "too short" : null),
    });
    const result = await promise;

    expect(Object.keys(accepted).sort()).toEqual(["a", "c"]);
    expect(result).toMatchObject({ described: 2, failedBatches: 0, aborted: false });
  });

  test("retries a failing batch and accepts the retry", async () => {
    const describeBatch = vi
      .fn<DescribeBatch>()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockImplementation(async (names) => ({ descriptions: ok(names), cost: 0 }));
    const { promise, accepted } = run([["a"]], describeBatch);
    const result = await promise;

    expect(describeBatch).toHaveBeenCalledTimes(2);
    expect(accepted).toHaveProperty("a");
    expect(result.failedBatches).toBe(0);
  });

  test("gives up on a batch after three attempts and continues to the next", async () => {
    const describeBatch = vi.fn<DescribeBatch>(async (names) => {
      if (names[0] === "a") throw new Error("always fails");
      return { descriptions: ok(names), cost: 0 };
    });
    const { promise, accepted } = run([["a"], ["b"]], describeBatch);
    const result = await promise;

    expect(describeBatch).toHaveBeenCalledTimes(4);
    expect(accepted).toEqual({ b: "A drawing of a b." });
    expect(result.failedBatches).toBe(1);
  });

  test("backs off between retries", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const describeBatch = vi.fn<DescribeBatch>().mockRejectedValue(new Error("boom"));
    await run([["a"]], describeBatch, { sleep }).promise;

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 20_000]);
  });

  // Without this, an expired credential at batch 3 of 138 logs 135 failures
  // and exits 0.
  test("aborts after three consecutive batch failures", async () => {
    const describeBatch = vi.fn<DescribeBatch>().mockRejectedValue(new Error("expired"));
    const result = await run([["a"], ["b"], ["c"], ["d"]], describeBatch).promise;

    expect(result).toMatchObject({ aborted: true, succeededBatches: 0, failedBatches: 3 });
    expect(describeBatch).toHaveBeenCalledTimes(9);
  });

  test("a success resets the consecutive-failure count", async () => {
    const describeBatch = vi.fn<DescribeBatch>(async (names) => {
      if (names[0] === "ok") return { descriptions: ok(names), cost: 0 };
      throw new Error("boom");
    });
    const result = await run([["a"], ["b"], ["ok"], ["c"], ["d"]], describeBatch).promise;

    expect(result.aborted).toBe(false);
    expect(result.failedBatches).toBe(4);
  });

  // An HTTP 200 is billed whether or not anything usable came back, so a run
  // that only counts successes under-reports what it spent.
  test("charges the cost a failing batch carries out on its error", async () => {
    const describeBatch = vi
      .fn<DescribeBatch>()
      .mockRejectedValue(batchFailure("truncated", { cost: 0.04 }));
    const result = await run([["a"]], describeBatch).promise;

    expect(result.totalCost).toBeCloseTo(0.12);
  });

  // Without this a revoked key at batch 3 of 138 spends 9 requests and 75s of
  // backoff per batch discovering that it is still revoked.
  test("aborts the whole run on a fatal failure without retrying", async () => {
    const describeBatch = vi
      .fn<DescribeBatch>()
      .mockRejectedValue(batchFailure("HTTP 401", { fatal: true }));
    const result = await run([["a"], ["b"]], describeBatch).promise;

    expect(describeBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ aborted: true, failedBatches: 1 });
  });

  test("gives up on an unretryable failure but continues to the next batch", async () => {
    const describeBatch = vi.fn<DescribeBatch>(async (names) => {
      if (names[0] === "a") throw batchFailure("refused", { retryable: false });
      return { descriptions: ok(names), cost: 0 };
    });
    const { promise, accepted } = run([["a"], ["b"]], describeBatch);
    const result = await promise;

    expect(describeBatch).toHaveBeenCalledTimes(2);
    expect(accepted).toEqual({ b: "A drawing of a b." });
    expect(result).toMatchObject({ failedBatches: 1, aborted: false });
  });

  // The fixed ladder is a guess; a 429 tells us the real answer.
  test("prefers the server's retry-after over the backoff ladder", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const describeBatch = vi
      .fn<DescribeBatch>()
      .mockRejectedValue(batchFailure("rate limited", { retryAfterMs: 3_000 }));
    await run([["a"]], describeBatch, { sleep }).promise;

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([3_000, 3_000]);
  });

  test("stops once spend reaches the cost ceiling", async () => {
    const describeBatch = vi.fn<DescribeBatch>(async (names) => ({
      descriptions: ok(names),
      cost: 0.4,
    }));
    const result = await run([["a"], ["b"], ["c"]], describeBatch, { maxCost: 0.5 }).promise;

    expect(describeBatch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ described: 2, aborted: true });
  });

  test("a batch whose entries all fail validation counts as a failure, and is still paid for", async () => {
    const describeBatch = vi.fn<DescribeBatch>(async () => ({
      descriptions: { a: "no" },
      cost: 0.1,
    }));
    const result = await run([["a"]], describeBatch, {
      validateEntry: () => "too short",
    }).promise;

    expect(result).toMatchObject({ described: 0, succeededBatches: 0, failedBatches: 1 });
    expect(result.totalCost).toBeCloseTo(0.3);
  });
});
