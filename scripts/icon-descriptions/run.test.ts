import { describe, expect, test, vi } from "vitest";
import { runRequests } from "./run";
import { type DescribeIcon, requestFailure } from "./transport";

const ok = (name: string) => ({ description: `A drawing of a ${name}.`, cost: 0 });

// runRequests only forwards the model to describeIcon, which is stubbed in
// every test here, so naming a real model would imply a dependency there isn't.
const MODEL = "stub-model";

const run = (
  icons: string[],
  describeIcon: DescribeIcon,
  overrides: Partial<Parameters<typeof runRequests>[0]> = {},
) => {
  const accepted: Record<string, string> = {};
  const promise = runRequests({
    icons,
    describeIcon,
    pngDir: "/tmp/png",
    model: MODEL,
    cache: "1h",
    onAccept: (entries) => Object.assign(accepted, entries),
    validateEntry: () => null,
    sleep: async () => {},
    log: () => {},
    ...overrides,
  });
  return { promise, accepted };
};

describe("runRequests", () => {
  test("describes every icon and reports the running cost", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => ({ ...ok(name), cost: 0.3 }));
    const { promise, accepted } = run(["a", "b"], describeIcon);
    const result = await promise;

    expect(Object.keys(accepted).sort()).toEqual(["a", "b"]);
    expect(result).toMatchObject({
      described: 2,
      succeededRequests: 2,
      failedRequests: 0,
      aborted: false,
    });
    expect(result.totalCost).toBeCloseTo(0.6);
    // The cli transport cannot cache and reports nothing; the totals still have
    // to be numbers, since the summary divides by them.
    expect(result.cache).toEqual({ created: 0, read: 0 });
  });

  // A single request can only ever write the prefix, so nothing below the run
  // level can say whether caching paid for itself.
  test("sums the cache usage across requests and forwards the window", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => ({
      ...ok(name),
      cache: name === "a" ? { created: 800, read: 0 } : { created: 0, read: 800 },
    }));
    const result = await run(["a", "b"], describeIcon, { cache: "1h" }).promise;

    expect(result.cache).toEqual({ created: 800, read: 800 });
    expect(describeIcon).toHaveBeenCalledWith("a", expect.objectContaining({ cache: "1h" }));
  });

  // A request billed for a prefix it wrote still wrote it. Counting the cost of
  // a failure without its cache would report the hit rate over a different set
  // of requests than the spend printed beside it.
  test("counts the cache usage a failing request carries out on its error", async () => {
    const describeIcon = vi
      .fn<DescribeIcon>()
      .mockRejectedValue(
        requestFailure("truncated", { cost: 0.01, cache: { created: 948, read: 0 } }),
      );
    const result = await run(["a"], describeIcon).promise;

    expect(result.cache).toEqual({ created: 948 * 3, read: 0 });
  });

  test("invokes requests sequentially", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const describeIcon = vi.fn<DescribeIcon>(async (name) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return ok(name);
    });
    await run(["a", "b", "c"], describeIcon).promise;

    expect(maxInFlight).toBe(1);
  });

  // The file is the progress marker, so a crash must leave every accepted icon
  // on disk. Asserting the interleaving is what rules out a buffer-then-flush
  // refactor; a call count alone is satisfied by three flushes at the end.
  test("hands over each accepted icon as it lands, not once at the end", async () => {
    const events: string[] = [];
    const describeIcon = vi.fn<DescribeIcon>(async (name) => {
      events.push(`describe:${name}`);
      return ok(name);
    });
    await run(["a", "b"], describeIcon, {
      onAccept: (entries) => events.push(`accept:${Object.keys(entries)[0]}`),
    }).promise;

    expect(events).toEqual(["describe:a", "accept:a", "describe:b", "accept:b"]);
  });

  test("retries a failing request and accepts the retry", async () => {
    const describeIcon = vi
      .fn<DescribeIcon>()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockImplementation(async (name) => ok(name));
    const { promise, accepted } = run(["a"], describeIcon);
    const result = await promise;

    expect(describeIcon).toHaveBeenCalledTimes(2);
    expect(accepted).toHaveProperty("a");
    expect(result.failedRequests).toBe(0);
  });

  test("gives up on a request after three attempts and continues to the next", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => {
      if (name === "a") throw new Error("always fails");
      return ok(name);
    });
    const { promise, accepted } = run(["a", "b"], describeIcon);
    const result = await promise;

    expect(describeIcon).toHaveBeenCalledTimes(4);
    expect(accepted).toEqual({ b: "A drawing of a b." });
    expect(result.failedRequests).toBe(1);
  });

  test("backs off between retries", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const describeIcon = vi.fn<DescribeIcon>().mockRejectedValue(new Error("boom"));
    await run(["a"], describeIcon, { sleep }).promise;

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 20_000]);
  });

  // Without this, an expired credential at request 3 of 4,134 logs 4,131
  // failures and exits 0.
  test("aborts after three consecutive request failures", async () => {
    const describeIcon = vi.fn<DescribeIcon>().mockRejectedValue(new Error("expired"));
    const result = await run(["a", "b", "c", "d"], describeIcon).promise;

    expect(result).toMatchObject({ aborted: true, succeededRequests: 0, failedRequests: 3 });
    expect(describeIcon).toHaveBeenCalledTimes(9);
  });

  test("a success resets the consecutive-failure count", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => {
      if (name === "ok") return ok(name);
      throw new Error("boom");
    });
    const result = await run(["a", "b", "ok", "c", "d"], describeIcon).promise;

    expect(result.aborted).toBe(false);
    expect(result.failedRequests).toBe(4);
  });

  // An HTTP 200 is billed whether or not anything usable came back, so a run
  // that only counts successes under-reports what it spent.
  test("charges the cost a failing request carries out on its error", async () => {
    const describeIcon = vi
      .fn<DescribeIcon>()
      .mockRejectedValue(requestFailure("truncated", { cost: 0.04 }));
    const result = await run(["a"], describeIcon).promise;

    expect(result.totalCost).toBeCloseTo(0.12);
  });

  // Without this a revoked key at request 3 of 4,134 spends 9 requests and 75s
  // of backoff per icon discovering that it is still revoked.
  test("aborts the whole run on a fatal failure without retrying", async () => {
    const describeIcon = vi
      .fn<DescribeIcon>()
      .mockRejectedValue(requestFailure("HTTP 401", { fatal: true }));
    const result = await run(["a", "b"], describeIcon).promise;

    expect(describeIcon).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ aborted: true, failedRequests: 1 });
  });

  test("gives up on an unretryable failure but continues to the next icon", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => {
      if (name === "a") throw requestFailure("refused", { retryable: false });
      return ok(name);
    });
    const { promise, accepted } = run(["a", "b"], describeIcon);
    const result = await promise;

    expect(describeIcon).toHaveBeenCalledTimes(2);
    expect(accepted).toEqual({ b: "A drawing of a b." });
    expect(result).toMatchObject({ failedRequests: 1, aborted: false });
  });

  // The fixed ladder is a guess; a 429 tells us the real answer.
  test("prefers the server's retry-after over the backoff ladder", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const describeIcon = vi
      .fn<DescribeIcon>()
      .mockRejectedValue(requestFailure("rate limited", { retryAfterMs: 3_000 }));
    await run(["a"], describeIcon, { sleep }).promise;

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([3_000, 3_000]);
  });

  test("stops once spend reaches the cost ceiling", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => ({ ...ok(name), cost: 0.4 }));
    const result = await run(["a", "b", "c"], describeIcon, { maxCost: 0.5 }).promise;

    expect(describeIcon).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ described: 2, aborted: true });
  });

  // A description the validator refuses is an answer, not a transport fault:
  // the model will say the same thing again, so retrying it twice more just
  // pays three times for the same rejection.
  test("does not retry a description that fails validation, and still pays for it", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => ({ ...ok(name), cost: 0.1 }));
    const result = await run(["a"], describeIcon, { validateEntry: () => "too short" }).promise;

    expect(describeIcon).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ described: 0, succeededRequests: 0, failedRequests: 1 });
    expect(result.totalCost).toBeCloseTo(0.1);
  });

  // At one icon per request a rejection is common enough to cluster, and the
  // abort exists for a dead credential — ending a 4,134-icon run because three
  // adjacent descriptions ran long would strand the rest.
  test("consecutive validation rejections do not abort the run", async () => {
    const describeIcon = vi.fn<DescribeIcon>(async (name) => ok(name));
    const result = await run(["a", "b", "c", "d"], describeIcon, {
      validateEntry: (name) => (name === "d" ? null : "too short"),
    }).promise;

    expect(result).toMatchObject({ described: 1, failedRequests: 3, aborted: false });
  });
});
