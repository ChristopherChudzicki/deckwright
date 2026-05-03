import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type {
  MagicItemDetail2014,
  MagicItemDetail2024,
  MagicItemIndex,
  MagicItemIndexEntry,
} from "./endpoints/magicItems";

const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const categories = [
  { index: "wondrous-items", name: "Wondrous Items", descName: "Wondrous Item" },
  { index: "rings", name: "Rings", descName: "Ring" },
  { index: "rods", name: "Rods", descName: "Rod" },
  { index: "weapons", name: "Weapons", descName: "Weapon" },
];

export const magicItemIndexEntryFactory = Factory.define<MagicItemIndexEntry>(() => {
  const slug = faker.helpers.slugify(faker.commerce.productName()).toLowerCase();
  return {
    index: `${slug}-${faker.string.alphanumeric(5)}`,
    name: faker.commerce.productName(),
    url: `/api/2024/magic-items/${slug}`,
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

export const magicItemDetail2024Factory = Factory.define<MagicItemDetail2024>(() => {
  const { descName, ...category } = faker.helpers.arrayElement(categories);
  const slug = faker.helpers.slugify(faker.commerce.productName()).toLowerCase();
  return {
    ruleset: "2024",
    index: slug,
    name: faker.commerce.productName(),
    equipment_category: { ...category, url: `/api/2024/equipment-categories/${category.index}` },
    rarity: { name: faker.helpers.arrayElement(rarities) },
    attunement: faker.datatype.boolean(),
    desc: `${descName}  \n${faker.lorem.paragraph()}`,
    image: `/api/images/magic-items/${slug}.png`,
    variants: [],
    variant: false,
  };
});

export const magicItemDetail2014Factory = Factory.define<MagicItemDetail2014>(() => {
  const { descName, ...category } = faker.helpers.arrayElement(categories);
  const rarity = faker.helpers.arrayElement(rarities);
  const slug = faker.helpers.slugify(faker.commerce.productName()).toLowerCase();
  return {
    ruleset: "2014",
    index: slug,
    name: faker.commerce.productName(),
    equipment_category: { ...category, url: `/api/2014/equipment-categories/${category.index}` },
    rarity: { name: rarity },
    desc: [
      `${descName}, ${rarity.toLowerCase()}`,
      faker.lorem.paragraph(),
      faker.lorem.paragraph(),
    ],
    image: `/api/images/magic-items/${slug}.png`,
    variants: [],
    variant: false,
  };
});
