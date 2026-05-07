import { describe, expect, test } from "vitest";
import { backSlotIndex, imposeBackPage } from "./backImposition";

describe("backSlotIndex", () => {
  test("4-up portrait (cols=2, rows=2) — mirrors each pair", () => {
    expect(backSlotIndex(0, 2)).toBe(1);
    expect(backSlotIndex(1, 2)).toBe(0);
    expect(backSlotIndex(2, 2)).toBe(3);
    expect(backSlotIndex(3, 2)).toBe(2);
  });

  test("2-up landscape (cols=2, rows=1) — swaps the pair", () => {
    expect(backSlotIndex(0, 2)).toBe(1);
    expect(backSlotIndex(1, 2)).toBe(0);
  });

  test("1-column layout — no-op (degrades correctly)", () => {
    expect(backSlotIndex(0, 1)).toBe(0);
    expect(backSlotIndex(1, 1)).toBe(1);
    expect(backSlotIndex(2, 1)).toBe(2);
  });
});

describe("imposeBackPage", () => {
  test("full 4-up page: [A,B,C,D] → [B,A,D,C]", () => {
    expect(imposeBackPage(["A", "B", "C", "D"], 4, 2)).toEqual(["B", "A", "D", "C"]);
  });

  test("full 2-up page: [A,B] → [B,A]", () => {
    expect(imposeBackPage(["A", "B"], 2, 2)).toEqual(["B", "A"]);
  });

  test("partial last 4-up page (3 fronts) → length-4 dense array with one undefined slot", () => {
    const result = imposeBackPage(["A", "B", "C"], 4, 2);
    expect(result).toEqual(["B", "A", undefined, "C"]);
    expect(result).toHaveLength(4);
    // Density check: index 2 must exist as an own property, not a sparse hole.
    // A sparse array would let CSS grid compress entries left-to-right and break
    // duplex alignment.
    expect(2 in result).toBe(true);
  });

  test("empty front page → length-`slotsPerPage` array of undefineds", () => {
    const result = imposeBackPage([] as string[], 4, 2);
    expect(result).toEqual([undefined, undefined, undefined, undefined]);
    expect(result).toHaveLength(4);
  });
});
