import { describe, expect, test } from "vitest";
import { expandCard } from "./expandCard";
import { itemCardFactory } from "./factories";
import type { CardMeasurer } from "./measurer";

const measurerFromBudget = (firstMax: number, contMax: number): CardMeasurer => ({
  measureFirst: (_card, chunk) => chunk.length <= firstMax,
  measureContinuation: (_card, chunk) => chunk.length <= contMax,
});

describe("expandCard", () => {
  test("single physical card with no pagination metadata when body fits", () => {
    const card = itemCardFactory.build({ body: "tiny" });
    const result = expandCard(card, measurerFromBudget(1000, 1000));
    expect(result).toEqual([{ card, bodyChunk: "tiny", pagination: undefined }]);
  });

  test("multiple physical cards with pagination metadata when body splits", () => {
    const card = itemCardFactory.build({ body: "alpha beta gamma" });
    const result = expandCard(card, measurerFromBudget(5, 5));
    expect(result.map((p) => p.bodyChunk)).toEqual(["alpha", "beta", "gamma"]);
    expect(result.map((p) => p.pagination)).toEqual([
      { page: 1, total: 3 },
      { page: 2, total: 3 },
      { page: 3, total: 3 },
    ]);
  });
});
