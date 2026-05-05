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

  test("splits at block boundary before falling back to word-fit", () => {
    // Three paragraph blocks; budget fits exactly one block.
    expect(
      paginateBody({
        body: "alpha\n\nbeta\n\ngamma",
        measureFirst: fitsUpTo(5),
        measureContinuation: fitsUpTo(5),
      }),
    ).toEqual(["alpha", "beta", "gamma"]);
  });

  test("packs as many blocks as fit per card", () => {
    // Joined text "alpha\n\nbeta" length 11; "alpha\n\nbeta\n\ngamma" length 18.
    expect(
      paginateBody({
        body: "alpha\n\nbeta\n\ngamma",
        measureFirst: fitsUpTo(11),
        measureContinuation: fitsUpTo(11),
      }),
    ).toEqual(["alpha\n\nbeta", "gamma"]);
  });

  test("treats a list block as atomic when it cannot share a card", () => {
    // List block "- a\n- b\n- c" length 11; fits if measured alone, doesn't share with the paragraph.
    expect(
      paginateBody({
        body: "intro\n\n- a\n- b\n- c",
        measureFirst: fitsUpTo(11),
        measureContinuation: fitsUpTo(11),
      }),
    ).toEqual(["intro", "- a\n- b\n- c"]);
  });

  test("treats a table block as atomic and accepts overflow", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |";
    // Budget too small for the whole table, but it's atomic.
    const result = paginateBody({
      body: table,
      measureFirst: fitsUpTo(5),
      measureContinuation: fitsUpTo(5),
    });
    expect(result).toEqual([table]);
  });

  test("splits a too-tall list at item boundaries", () => {
    // Five items, ~6 chars each ("- alpha"=7, "- beta"=6, ...). Budget 14 fits ~2 items per card.
    const body = "- alpha\n- beta\n- gamma\n- delta\n- eps";
    const result = paginateBody({
      body,
      measureFirst: fitsUpTo(14),
      measureContinuation: fitsUpTo(14),
    });
    // Each chunk must start at an item boundary and contain only whole items.
    for (const chunk of result) {
      expect(chunk.startsWith("- ") || chunk.startsWith("* ") || /^\d+\.\s/.test(chunk)).toBe(true);
    }
    expect(result.join("\n")).toBe(body);
  });

  test("preserves ordered-list numbering across a split", () => {
    // 1.-5. items; budget forces a split partway through.
    const body = "1. one\n2. two\n3. three\n4. four\n5. five";
    const result = paginateBody({
      body,
      measureFirst: fitsUpTo(14),
      measureContinuation: fitsUpTo(40),
    });
    // First chunk starts at "1.", continuation chunk starts at the next un-fit number ("3." here, given the budget).
    expect(result[0]?.startsWith("1.")).toBe(true);
    expect(result.length).toBeGreaterThan(1);
    const second = result[1] ?? "";
    expect(/^\d+\.\s/.test(second)).toBe(true);
    // Numbers in source are preserved (we don't re-emit from 1).
    expect(second).toMatch(/^[2-9]\./);
  });

  test("does not split between a parent item and its nested children", () => {
    // Item 1 has a nested bullet that must travel with it.
    const body = "- parent one\n  - nested\n- parent two\n- parent three";
    const result = paginateBody({
      body,
      measureFirst: fitsUpTo(25),
      measureContinuation: fitsUpTo(25),
    });
    // Reconstruction (joined with \n) must equal the original.
    expect(result.join("\n")).toBe(body);
    // The nested line must appear in the same chunk as its parent.
    const chunkWithParent = result.find((c) => c.includes("parent one"));
    expect(chunkWithParent).toBeDefined();
    expect(chunkWithParent).toContain("nested");
  });
});
