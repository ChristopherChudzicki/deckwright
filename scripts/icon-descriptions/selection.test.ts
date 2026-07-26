import { describe, expect, test } from "vitest";
import { selectBatches } from "./selection";

const alphabet = Array.from({ length: 100 }, (_, i) => `icon-${String(i).padStart(3, "0")}`);

const select = (overrides: Partial<Parameters<typeof selectBatches>[0]> = {}) =>
  selectBatches({ all: alphabet, existing: new Set(), batchSize: 10, ...overrides });

describe("selectBatches", () => {
  test("covers every icon when nothing exists yet", () => {
    expect(select().flat().sort()).toEqual([...alphabet].sort());
  });

  test("leaves a short final batch", () => {
    expect(select({ batchSize: 30 }).map((b) => b.length)).toEqual([30, 30, 30, 10]);
  });

  test("skips already-described icons", () => {
    const existing = new Set(alphabet.slice(0, 90));
    expect(select({ existing }).flat().sort()).toEqual(alphabet.slice(90).sort());
  });

  // The property that costs money. Every invocation carries the same fixed
  // cost whether it describes 1 icon or 30, so a resume holding one leftover
  // per original batch must coalesce them, not run an invocation apiece.
  test("a resume packs scattered leftovers into full batches", () => {
    const full = select();
    const done = new Set(full.flat().filter((_, i) => i % 10 !== 0));

    expect(select({ existing: done }).map((b) => b.length)).toEqual([10]);
  });

  test("drops batches that are fully described", () => {
    const full = select();
    const done = new Set(full[0]);
    expect(select({ existing: done })).toEqual(full.slice(1));
  });

  test("--force reselects icons that already have entries", () => {
    expect(
      select({ existing: new Set(alphabet), force: true })
        .flat()
        .sort(),
    ).toEqual([...alphabet].sort());
  });

  test("--only restricts to the named icons and implies force", () => {
    const only = ["icon-005", "icon-042"];
    expect(
      select({ existing: new Set(alphabet), only })
        .flat()
        .sort(),
    ).toEqual([...only].sort());
  });

  test("--only rejects a name that is not in the collection", () => {
    expect(() => select({ only: ["icon-005", "nope", "also-nope"] })).toThrow(/nope, also-nope/);
  });

  test("--limit truncates before chunking", () => {
    expect(select({ limit: 25 }).map((b) => b.length)).toEqual([10, 10, 5]);
  });

  test("--limit truncates in shuffled order, not alphabetical order", () => {
    expect(select({ limit: 10 }).flat()).toEqual(select().at(0));
  });

  // Discriminates --limit applied to the surviving icons from --limit applied
  // to the full collection before the resume filter.
  test("--limit counts icons still to do, not icons already described", () => {
    const existing = new Set(alphabet.slice(0, 90));
    expect(select({ existing, limit: 5 }).flat()).toHaveLength(5);
  });
});
