import { describe, expect, test } from "vitest";
import { itemCardSchema } from "../../decks/schema";
import { magicItemDetail2014Factory, magicItemDetail2024Factory } from "../factories";
import { magicItemDetailToCard } from "./magicItems";

describe("magicItemDetailToCard — 2024", () => {
  test("output is a valid ItemCard", () => {
    const detail = magicItemDetail2024Factory.build();
    const card = magicItemDetailToCard(detail);
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("composes headerTags from category + rarity", () => {
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
    expect(card.headerTags).toEqual(["Wondrous Items", "uncommon"]);
  });

  test("adds attunement tag when attunement is true", () => {
    const detail = magicItemDetail2024Factory.build({
      equipment_category: { index: "rings", name: "Rings", url: "" },
      rarity: { name: "Rare" },
      attunement: true,
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Rings", "rare", "requires attunement"]);
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
    expect(card.headerTags).toEqual(["Rings", "rare", "requires attunement"]);
  });
});
