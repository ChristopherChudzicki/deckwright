import { describe, expect, test } from "vitest";
import { selectionCountLabel } from "./printSelectionLabel";

describe("selectionCountLabel", () => {
  test("all selected reads 'All N cards'", () => {
    expect(selectionCountLabel(15, 15)).toBe("All 15 cards");
  });

  test("narrowed reads 'X of N cards'", () => {
    expect(selectionCountLabel(7, 15)).toBe("7 of 15 cards");
  });

  test("zero selected reads '0 of N cards'", () => {
    expect(selectionCountLabel(0, 15)).toBe("0 of 15 cards");
  });

  test("singular total pluralizes correctly", () => {
    expect(selectionCountLabel(1, 1)).toBe("All 1 card");
    expect(selectionCountLabel(0, 1)).toBe("0 of 1 card");
  });
});
