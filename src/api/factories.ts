import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { MagicItemDetail, MagicItemIndex, MagicItemIndexEntry } from "./endpoints/magicItems";

const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const categories = ["Wondrous Item", "Ring", "Rod", "Weapon", "Armor", "Potion", "Scroll", "Wand"];

const open5eKey = (slug: string): string => `srd-2024_${slug}`;

export const magicItemIndexEntryFactory = Factory.define<MagicItemIndexEntry>(() => {
  const slug = faker.helpers
    .slugify(`${faker.commerce.productName()}-${faker.string.alphanumeric(5)}`)
    .toLowerCase();
  return {
    key: open5eKey(slug),
    name: faker.commerce.productName(),
  };
});

type MagicItemIndexTransient = { size: number };

export const magicItemIndexFactory = Factory.define<MagicItemIndex, MagicItemIndexTransient>(
  ({ transientParams }) => {
    const size = transientParams.size ?? 3;
    const results = magicItemIndexEntryFactory.buildList(size);
    return { count: results.length, results };
  },
);

export const magicItemDetailFactory = Factory.define<MagicItemDetail>(() => {
  const slug = faker.helpers
    .slugify(`${faker.commerce.productName()}-${faker.string.alphanumeric(5)}`)
    .toLowerCase();
  return {
    key: open5eKey(slug),
    name: faker.commerce.productName(),
    desc: faker.lorem.paragraph(),
    category: { name: faker.helpers.arrayElement(categories) },
    rarity: { name: faker.helpers.arrayElement(rarities) },
    requires_attunement: false,
    attunement_detail: null,
    ruleset: "2024",
  };
});
