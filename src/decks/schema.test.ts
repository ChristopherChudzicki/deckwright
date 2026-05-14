import { describe, expect, test } from "vitest";
import { itemCardSchema } from "./schema";

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
      apiRef: {
        system: "open5e" as const,
        slug: "bag-of-holding",
        ruleset: "2024" as const,
        kind: "magic-items" as const,
      },
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
      apiRef: {
        system: "open5e" as const,
        slug: "bag-of-holding",
        ruleset: "2014" as const,
        kind: "magic-items" as const,
      },
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

  test("accepts an item card without footerTags and defaults to []", () => {
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

  test("accepts an item card without headerTags and defaults to []", () => {
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
      apiRef: { system: "open5e" as const, slug: "x", kind: "magic-items" as const },
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(false);
  });

  test("rejects an apiRef without a kind", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "X",
      headerTags: [],
      body: "",
      source: "api" as const,
      apiRef: { system: "open5e" as const, slug: "x", ruleset: "2024" as const },
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(false);
  });

  test("accepts an item card with a referenceUrl", () => {
    const card = {
      id: "abc",
      kind: "item" as const,
      name: "Bag of Holding",
      headerTags: [],
      body: "Big bag.",
      footerTags: [],
      source: "custom" as const,
      referenceUrl: "https://example.com/reference/magic-items/srd-2024_bag-of-holding",
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    };
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });
});
