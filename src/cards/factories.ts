import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { ItemCard } from "./types";

const rarities = ["common", "uncommon", "rare", "very rare", "legendary"];

export const itemCardFactory = Factory.define<ItemCard>(() => {
  const now = new Date().toISOString();
  return {
    id: faker.string.nanoid(),
    kind: "item",
    name: faker.commerce.productName(),
    typeLine: `Wondrous item, ${faker.helpers.arrayElement(rarities)}`,
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
