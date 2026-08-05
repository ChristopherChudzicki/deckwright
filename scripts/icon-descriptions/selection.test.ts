import { describe, expect, test } from "vitest";
import { selectIcons } from "./selection";

const alphabet = Array.from({ length: 100 }, (_, i) => `icon-${String(i).padStart(3, "0")}`);

const select = (overrides: Partial<Parameters<typeof selectIcons>[0]> = {}) =>
  selectIcons({ all: alphabet, existing: new Set(), ...overrides });

describe("selectIcons", () => {
  test("covers every icon when nothing exists yet", () => {
    expect([...select()].sort()).toEqual([...alphabet].sort());
  });

  test("skips already-described icons", () => {
    const existing = new Set(alphabet.slice(0, 90));
    expect([...select({ existing })].sort()).toEqual(alphabet.slice(90).sort());
  });

  test("--force reselects icons that already have entries", () => {
    expect([...select({ existing: new Set(alphabet), force: true })].sort()).toEqual(
      [...alphabet].sort(),
    );
  });

  test("--only restricts to the named icons and implies force", () => {
    const only = ["icon-005", "icon-042"];
    expect([...select({ existing: new Set(alphabet), only })].sort()).toEqual([...only].sort());
  });

  test("--only rejects a name that is not in the collection", () => {
    expect(() => select({ only: ["icon-005", "nope", "also-nope"] })).toThrow(/nope, also-nope/);
  });

  test("--limit truncates in shuffled order, not alphabetical order", () => {
    expect(select({ limit: 10 })).toEqual(select().slice(0, 10));
  });

  // Discriminates --limit applied to the surviving icons from --limit applied
  // to the full collection before the resume filter.
  test("--limit counts icons still to do, not icons already described", () => {
    const existing = new Set(alphabet.slice(0, 90));
    expect(select({ existing, limit: 5 })).toHaveLength(5);
  });
});
