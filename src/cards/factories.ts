import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { ItemCard, SpellCard } from "./types";

const rarities = ["common", "uncommon", "rare", "very rare", "legendary"];

export const itemCardFactory = Factory.define<ItemCard>(() => {
  const now = new Date().toISOString();
  return {
    id: faker.string.nanoid(),
    kind: "item",
    name: faker.commerce.productName(),
    headerTags: ["Wondrous item", faker.helpers.arrayElement(rarities)],
    body: faker.lorem.paragraph(),
    footerTags: [
      `${faker.number.int({ min: 10, max: 5000 })} gp`,
      `${faker.number.int({ min: 1, max: 30 })} lb`,
    ],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});

export const spellCardFactory = Factory.define<SpellCard>(() => {
  const now = new Date().toISOString();
  return {
    id: faker.string.nanoid(),
    kind: "spell",
    name: faker.lorem.words(2),
    headerTags: ["1 action", "60 feet", "Instantaneous"],
    body: faker.lorem.paragraph(),
    footerTags: ["V, S"],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});
