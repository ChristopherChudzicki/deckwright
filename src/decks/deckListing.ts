import type { Card } from "../cards/types";

export const DECK_KIND_FILTERS = ["all", "item", "spell"] as const;
export const DECK_SORTS = ["updated", "name"] as const;

export type DeckKindFilter = (typeof DECK_KIND_FILTERS)[number];
export type DeckSort = (typeof DECK_SORTS)[number];

export type DeckListing = {
  cards: Card[];
  counts: { all: number; item: number; spell: number };
};

const nameCollator = new Intl.Collator(undefined, { sensitivity: "base" });

function compareByName(a: Card, b: Card): number {
  return nameCollator.compare(a.name, b.name);
}

function compareById(a: Card, b: Card): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareByUpdated(a: Card, b: Card): number {
  if (a.updatedAt === b.updatedAt) return 0;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

export function deckListing(
  cards: Card[],
  opts: { kind: DeckKindFilter; sort: DeckSort },
): DeckListing {
  let item = 0;
  let spell = 0;
  for (const c of cards) {
    if (c.kind === "item") item++;
    else if (c.kind === "spell") spell++;
  }

  const filtered = opts.kind === "all" ? cards.slice() : cards.filter((c) => c.kind === opts.kind);

  if (opts.sort === "updated") {
    filtered.sort((a, b) => compareByUpdated(a, b) || compareByName(a, b) || compareById(a, b));
  } else {
    filtered.sort((a, b) => compareByName(a, b) || compareById(a, b));
  }

  return { cards: filtered, counts: { all: cards.length, item, spell } };
}
