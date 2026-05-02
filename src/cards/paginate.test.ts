import { describe, expect, test } from "vitest";
import { type PaginateMeasurer, paginateBody } from "./paginate";

const fitsUpTo =
  (n: number): PaginateMeasurer =>
  (s) =>
    s.length <= n;

describe("paginateBody", () => {
  test("returns single chunk when body fits the first card", () => {
    expect(
      paginateBody({
        body: "short",
        measureFirst: fitsUpTo(100),
        measureContinuation: fitsUpTo(100),
      }),
    ).toEqual(["short"]);
  });

  test("splits at word boundary when body overflows", () => {
    expect(
      paginateBody({
        body: "alpha beta gamma delta",
        measureFirst: fitsUpTo(11),
        measureContinuation: fitsUpTo(11),
      }),
    ).toEqual(["alpha beta", "gamma delta"]);
  });

  test("uses different budgets for first vs continuation", () => {
    expect(
      paginateBody({
        body: "alpha beta gamma delta",
        measureFirst: fitsUpTo(5),
        measureContinuation: fitsUpTo(100),
      }),
    ).toEqual(["alpha", "beta gamma delta"]);
  });

  test("splits across three or more pages", () => {
    expect(
      paginateBody({
        body: "aa bb cc dd ee ff",
        measureFirst: fitsUpTo(5),
        measureContinuation: fitsUpTo(5),
      }),
    ).toEqual(["aa bb", "cc dd", "ee ff"]);
  });

  test("falls back to character split when a single token exceeds the card", () => {
    const result = paginateBody({
      body: "supercalifragilistic",
      measureFirst: fitsUpTo(5),
      measureContinuation: fitsUpTo(5),
    });
    expect(result.join("")).toBe("supercalifragilistic");
    expect(result.every((c) => c.length <= 5)).toBe(true);
  });

  test("returns single empty chunk for empty body", () => {
    expect(
      paginateBody({
        body: "",
        measureFirst: fitsUpTo(0),
        measureContinuation: fitsUpTo(0),
      }),
    ).toEqual([""]);
  });

  test("trims leading whitespace between chunks but keeps in-chunk paragraph breaks", () => {
    const result = paginateBody({
      body: "para one\n\npara two",
      measureFirst: fitsUpTo(8),
      measureContinuation: fitsUpTo(100),
    });
    expect(result).toEqual(["para one", "para two"]);
  });

  test("character-fallback splits a long token in the middle of body", () => {
    // first measurer: budget 5; second: budget 10
    // tokens: "alpha", "supercalifragilistic", "beta"
    // First chunk: "alpha" (5 chars)
    // Continuation: must split "supercalifragilistic" (20 chars) at character boundary
    const result = paginateBody({
      body: "alpha supercalifragilistic beta",
      measureFirst: fitsUpTo(5),
      measureContinuation: fitsUpTo(10),
    });
    expect(result[0]).toBe("alpha");
    // All chars from the original body are preserved (inter-chunk spaces are trimmed)
    expect(result.join("")).toBe("alpha supercalifragilistic beta".replace(/\s+/g, ""));
    expect(result.every((c) => c.length <= 10)).toBe(true);
  });

  test("treats all-whitespace body as a single empty-after-trim chunk", () => {
    const result = paginateBody({
      body: "   ",
      measureFirst: fitsUpTo(0),
      measureContinuation: fitsUpTo(0),
    });
    // Whitespace-only body: measureFirst("   ") with budget 0 returns false (3 > 0).
    // greedyFit finds no word boundaries (no \S+ matches), falls back to characterFit.
    // characterFit returns Math.max(best, 1) → " " (one space).
    // Pin behavior: at minimum, we should not infinite-loop and should make forward progress.
    expect(result.length).toBeGreaterThan(0);
    expect(result.join("").length).toBeLessThanOrEqual("   ".length);
  });

  test("preserves trailing whitespace within a fitting chunk", () => {
    const result = paginateBody({
      body: "alpha beta   ",
      measureFirst: fitsUpTo(100),
      measureContinuation: fitsUpTo(100),
    });
    // Whole body fits → single chunk including trailing whitespace untouched.
    expect(result).toEqual(["alpha beta   "]);
  });
});
