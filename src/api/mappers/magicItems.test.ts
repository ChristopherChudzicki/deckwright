import { describe, expect, test } from "vitest";
import { itemCardSchema } from "../../decks/schema";
import type { EquipmentDetail } from "../endpoints/equipment";
import type { MagicItemDetail2014 } from "../endpoints/magicItems";
import { magicItemDetail2014Factory, magicItemDetail2024Factory } from "../factories";
import { magicItemDetailToCard } from "./magicItems";

describe("magicItemDetailToCard — 2024", () => {
  test("output is a valid ItemCard", () => {
    const detail = magicItemDetail2024Factory.build();
    const card = magicItemDetailToCard(detail);
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("composes headerTags from category, footerTags from rarity", () => {
    const detail = magicItemDetail2024Factory.build({
      equipment_category: {
        index: "wondrous-items",
        name: "Wondrous Items",
        url: "",
      },
      rarity: { name: "Uncommon" },
      attunement: false,
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Wondrous Items"]);
    expect(card.footerTags).toEqual(["uncommon"]);
  });

  test("adds attunement tag to headerTags when attunement is true", () => {
    const detail = magicItemDetail2024Factory.build({
      equipment_category: { index: "rings", name: "Rings", url: "" },
      rarity: { name: "Rare" },
      attunement: true,
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Rings", "requires attunement"]);
    expect(card.footerTags).toEqual(["rare"]);
  });

  test("carries through source + apiRef with ruleset", () => {
    const detail = magicItemDetail2024Factory.build({ index: "bag-of-holding" });
    const card = magicItemDetailToCard(detail);
    expect(card.source).toBe("api");
    expect(card.apiRef).toEqual({
      system: "dnd5eapi",
      slug: "bag-of-holding",
      ruleset: "2024",
    });
  });

  test("builds an absolute imageUrl when image is present", () => {
    const detail = magicItemDetail2024Factory.build({
      image: "/api/images/magic-items/bag-of-holding.png",
    });
    const card = magicItemDetailToCard(detail);
    expect(card.imageUrl).toBe("https://www.dnd5eapi.co/api/images/magic-items/bag-of-holding.png");
  });
});

describe("magicItemDetailToCard — 2014", () => {
  test("output is a valid ItemCard", () => {
    const detail = magicItemDetail2014Factory.build();
    const card = magicItemDetailToCard(detail);
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("joins desc array with blank-line separators for body", () => {
    const detail = magicItemDetail2014Factory.build({
      desc: ["line A", "line B", "line C"],
    });
    const card = magicItemDetailToCard(detail);
    expect(card.body).toBe("line A\n\nline B\n\nline C");
  });

  test("detects requires-attunement from desc[0]", () => {
    const detail = magicItemDetail2014Factory.build({
      equipment_category: { index: "rings", name: "Rings", url: "" },
      rarity: { name: "Rare" },
      desc: ["Ring, rare (requires attunement)", "body"],
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Rings", "requires attunement"]);
    expect(card.footerTags).toEqual(["rare"]);
  });
});

describe("magicItemDetailToCard — enrichment", () => {
  const sunBladeLike: MagicItemDetail2014 = magicItemDetail2014Factory.build({
    equipment_category: { index: "weapon", name: "Weapon", url: "" },
    rarity: { name: "Rare" },
    desc: ["Weapon (longsword), rare (requires attunement)", "..."],
  });
  const dwarvenPlateLike: MagicItemDetail2014 = magicItemDetail2014Factory.build({
    equipment_category: { index: "armor", name: "Armor", url: "" },
    rarity: { name: "Very Rare" },
    desc: ["Armor (plate), very rare", "..."],
  });
  const longsword: EquipmentDetail = {
    index: "longsword",
    name: "Longsword",
    damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
    weight: 3,
  };
  const plate: EquipmentDetail = {
    index: "plate-armor",
    name: "Plate Armor",
    armor_class: { base: 18 },
    weight: 65,
  };

  test("splices weapon damage into header and weight into footer", () => {
    const card = magicItemDetailToCard(sunBladeLike, longsword);
    expect(card.headerTags).toEqual(["Weapon", "1d8 slashing", "requires attunement"]);
    expect(card.footerTags).toEqual(["rare", "3 lb"]);
  });

  test("splices armor AC into header and weight into footer", () => {
    const card = magicItemDetailToCard(dwarvenPlateLike, plate);
    expect(card.headerTags).toEqual(["Armor", "AC 18"]);
    expect(card.footerTags).toEqual(["very rare", "65 lb"]);
  });

  test("omits header insert when enrichment has neither damage nor AC", () => {
    const empty: EquipmentDetail = { index: "x", name: "X" };
    const card = magicItemDetailToCard(sunBladeLike, empty);
    expect(card.headerTags).toEqual(["Weapon", "requires attunement"]);
    expect(card.footerTags).toEqual(["rare"]);
  });

  test("works without enrichment (existing behavior)", () => {
    const card = magicItemDetailToCard(sunBladeLike);
    expect(card.headerTags).toEqual(["Weapon", "requires attunement"]);
    expect(card.footerTags).toEqual(["rare"]);
  });
});
