import { describe, expect, test } from "vitest";
import { deckSchema, itemCardSchema } from "./schema";

describe("itemCardSchema", () => {
  test("accepts a valid item card", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "Bag of Holding",
      headerTags: ["Wondrous item", "uncommon"],
      body: "Big bag.",
      footerTags: [],
      source: "custom" as const,
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("rejects a card without a kind", () => {
    const result = itemCardSchema.safeParse({ id: "a", name: "x" });
    expect(result.success).toBe(false);
  });

  test("accepts an item card with a 2024 apiRef", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "Bag of Holding",
      headerTags: ["Wondrous item", "uncommon"],
      body: "Big bag.",
      footerTags: [],
      source: "api" as const,
      apiRef: { system: "dnd5eapi" as const, slug: "bag-of-holding", ruleset: "2024" as const },
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("accepts an item card with a 2014 apiRef", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "Bag of Holding",
      headerTags: ["Wondrous item", "uncommon"],
      body: "Big bag.",
      footerTags: [],
      source: "api" as const,
      apiRef: { system: "dnd5eapi" as const, slug: "bag-of-holding", ruleset: "2014" as const },
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("accepts an item card with an iconKey", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "Bag of Holding",
      headerTags: ["Wondrous item", "uncommon"],
      body: "Big bag.",
      footerTags: [],
      source: "custom" as const,
      iconKey: "trident",
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("accepts an item card without footerTags (legacy JSON export) and defaults to []", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "Bag of Holding",
      headerTags: ["Wondrous item", "uncommon"],
      body: "Big bag.",
      source: "custom" as const,
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    const result = itemCardSchema.safeParse(card);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.footerTags).toEqual([]);
  });

  test("accepts an item card without headerTags (legacy JSON export) and defaults to []", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "Bag of Holding",
      body: "Big bag.",
      source: "custom" as const,
      footerTags: [],
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    const result = itemCardSchema.safeParse(card);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.headerTags).toEqual([]);
  });

  test("rejects an apiRef without a ruleset", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "X",
      headerTags: [],
      body: "",
      source: "api" as const,
      apiRef: { system: "dnd5eapi" as const, slug: "x" },
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(false);
  });
});

describe("deckSchema", () => {
  test("accepts an empty deck with version 1", () => {
    expect(deckSchema.safeParse({ version: 1, cards: [] }).success).toBe(true);
  });

  test("rejects a deck with version 2", () => {
    expect(deckSchema.safeParse({ version: 2, cards: [] }).success).toBe(false);
  });

  test("rejects a deck with a malformed card", () => {
    expect(
      deckSchema.safeParse({
        version: 1,
        cards: [{ id: "a", kind: "item", name: "missing fields" }],
      }).success,
    ).toBe(false);
  });
});
