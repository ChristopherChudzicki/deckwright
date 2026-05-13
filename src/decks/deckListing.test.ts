import { describe, expect, it } from "vitest";
import type { Card } from "../cards/types";
import { deckListing } from "./deckListing";

function card(overrides: Partial<Card> & Pick<Card, "id" | "kind" | "name" | "updatedAt">): Card {
  return {
    body: "",
    source: "custom",
    headerTags: [],
    footerTags: [],
    createdAt: overrides.updatedAt,
    ...overrides,
  } as Card;
}

describe("deckListing", () => {
  it("returns counts for items, spells, and total across all kinds", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "spell", name: "C", updatedAt: "2026-01-03T00:00:00.000Z" }),
      card({ id: "4", kind: "ability", name: "D", updatedAt: "2026-01-04T00:00:00.000Z" }),
    ];
    const { counts } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(counts).toEqual({ all: 4, item: 2, spell: 1 });
  });

  it("kind=all includes ability cards", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "ability", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("kind=item excludes spells and abilities", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "spell", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "ability", name: "C", updatedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "item", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["1"]);
  });

  it("kind=spell excludes items and abilities", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "spell", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "ability", name: "C", updatedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "spell", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["2"]);
  });

  it("sort=updated orders newest first by updatedAt", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "B", updatedAt: "2026-03-01T00:00:00.000Z" }),
      card({ id: "3", kind: "item", name: "C", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(out.map((c) => c.id)).toEqual(["2", "3", "1"]);
  });

  it("sort=name orders A->Z with locale-aware comparison", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "banana", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "Apple", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "item", name: "Éclair", updatedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["2", "1", "3"]);
  });

  it("sort=updated tie-break falls through to name ascending", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const cards = [
      card({ id: "1", kind: "item", name: "Bravo", updatedAt: t }),
      card({ id: "2", kind: "item", name: "Alpha", updatedAt: t }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(out.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("sort=updated tie-break falls through to id when name also ties", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const cards = [
      card({ id: "b", kind: "item", name: "Same", updatedAt: t }),
      card({ id: "a", kind: "item", name: "Same", updatedAt: t }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("sort=name tie-break falls through to id", () => {
    const cards = [
      card({ id: "b", kind: "item", name: "Same", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "a", kind: "item", name: "Same", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "B", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "A", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const snapshot = cards.map((c) => c.id);
    deckListing(cards, { kind: "all", sort: "name" });
    expect(cards.map((c) => c.id)).toEqual(snapshot);
  });

  it("returns empty cards with zero counts for empty input", () => {
    const result = deckListing([], { kind: "all", sort: "updated" });
    expect(result).toEqual({ cards: [], counts: { all: 0, item: 0, spell: 0 } });
  });
});
