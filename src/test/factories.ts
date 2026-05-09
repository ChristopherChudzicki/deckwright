import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { AbilityCard, ItemCard, SpellCard } from "../cards/types";
import type { CardRow, DeckRow, DeckSummary, PublicDeck } from "../decks/types";

// Re-export DB row types for tests that want them via this barrel.
export type { CardRow, DeckRow, DeckSummary, PublicDeck };

export const makeDeckRow = Factory.define<DeckRow>(() => {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    owner_id: faker.string.uuid(),
    name: faker.lorem.words({ min: 2, max: 4 }),
    created_at: now,
    updated_at: now,
  };
});

export const makeItemPayload = Factory.define<Omit<ItemCard, "id">>(() => {
  const now = faker.date.recent().toISOString();
  return {
    kind: "item",
    name: faker.commerce.productName(),
    headerTags: ["Weapon"],
    body: faker.lorem.paragraph(),
    source: "custom",
    footerTags: [],
    createdAt: now,
    updatedAt: now,
  };
});

export const makeSpellPayload = Factory.define<Omit<SpellCard, "id">>(() => {
  const now = faker.date.recent().toISOString();
  return {
    kind: "spell",
    name: faker.lorem.words(2),
    headerTags: [],
    body: faker.lorem.paragraph(),
    footerTags: [],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});

export const makeAbilityPayload = Factory.define<Omit<AbilityCard, "id">>(() => {
  const now = faker.date.recent().toISOString();
  return {
    kind: "ability",
    name: faker.lorem.words(2),
    headerTags: [],
    body: faker.lorem.paragraph(),
    footerTags: [],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});

export const makeCardRow = Factory.define<CardRow>(() => {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    deck_id: faker.string.uuid(),
    position: 0,
    payload: makeItemPayload.build(),
    created_at: now,
    updated_at: now,
  };
});

export const makeDeckSummary = Factory.define<DeckSummary>(() => {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    name: faker.lorem.words({ min: 2, max: 4 }),
    created_at: now,
    updated_at: now,
  };
});

export const makePublicDeck = Factory.define<PublicDeck>(() => {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    name: faker.lorem.words({ min: 2, max: 4 }),
    created_at: now,
    updated_at: now,
    is_owner: false,
  };
});
