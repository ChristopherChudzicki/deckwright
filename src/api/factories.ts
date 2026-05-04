import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { MagicItem, Spell } from "../data/srd-schema";
import type { MagicItemDetail, MagicItemIndex } from "./endpoints/magicItems";
import type { SpellDetail, SpellIndex } from "./endpoints/spells";

const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const categories = ["Wondrous Item", "Ring", "Rod", "Weapon", "Armor", "Potion", "Scroll", "Wand"];

const open5eKey = (slug: string): string => `srd-2024_${slug}`;

export const magicItemIndexEntryFactory = Factory.define<MagicItem>(() => {
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
    weapon: null,
    armor: null,
    weight: "0.000",
    weight_unit: "lb",
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

export const magicItemDetailFactory = Factory.define<MagicItemDetail>(() => ({
  ...magicItemIndexEntryFactory.build(),
  ruleset: "2024",
}));

const spellSchools = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
];

const castingTimes = ["action", "bonus-action", "reaction", "minute", "hour"] as const;

const spellClasses = [
  "Bard",
  "Cleric",
  "Druid",
  "Paladin",
  "Ranger",
  "Sorcerer",
  "Warlock",
  "Wizard",
];

export const spellIndexEntryFactory = Factory.define<Spell>(() => {
  const slug = faker.helpers
    .slugify(`${faker.lorem.words(2)}-${faker.string.alphanumeric(5)}`)
    .toLowerCase();
  return {
    key: open5eKey(slug),
    name: faker.lorem.words(2),
    level: faker.number.int({ min: 0, max: 9 }),
    school: { name: faker.helpers.arrayElement(spellSchools) },
    casting_time: faker.helpers.arrayElement(castingTimes),
    ritual: false,
    range_text: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    verbal: true,
    somatic: true,
    material: false,
    material_specified: "",
    classes: [{ name: faker.helpers.arrayElement(spellClasses) }],
    desc: faker.lorem.paragraph(),
    higher_level: "",
  };
});

type SpellIndexTransient = { size: number };

export const spellIndexFactory = Factory.define<SpellIndex, SpellIndexTransient>(
  ({ transientParams }) => {
    const size = transientParams.size ?? 3;
    const results = spellIndexEntryFactory.buildList(size);
    return { count: results.length, results };
  },
);

export const spellDetailFactory = Factory.define<SpellDetail>(() => ({
  ...spellIndexEntryFactory.build(),
  ruleset: "2024",
}));
