import { describe, expect, test } from "vitest";
import { itemCardSchema } from "../../decks/schema";
import { magicItemDetailFactory } from "../factories";
import { magicItemDetailToCard } from "./magicItems";

describe("magicItemDetailToCard", () => {
  test("output is a valid ItemCard", () => {
    const detail = magicItemDetailFactory.build();
    const card = magicItemDetailToCard(detail);
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("category goes to headerTags, rarity (lowercased) goes to footerTags", () => {
    const detail = magicItemDetailFactory.build({
      category: { name: "Ring" },
      rarity: { name: "Uncommon" },
      requires_attunement: false,
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Ring"]);
    expect(card.footerTags).toEqual(["uncommon"]);
  });

  test("adds 'requires attunement' to headerTags when requires_attunement is true and detail is null", () => {
    const detail = magicItemDetailFactory.build({
      category: { name: "Ring" },
      requires_attunement: true,
      attunement_detail: null,
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Ring", "requires attunement"]);
  });

  test("appends attunement_detail when present", () => {
    const detail = magicItemDetailFactory.build({
      category: { name: "Weapon" },
      requires_attunement: true,
      attunement_detail: "by a dwarf or paladin",
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Weapon", "requires attunement by a dwarf or paladin"]);
  });

  test("body equals detail.desc verbatim — no header-line stripping", () => {
    const detail = magicItemDetailFactory.build({
      desc: "This suit of armor is reinforced with adamantine.",
    });
    const card = magicItemDetailToCard(detail);
    expect(card.body).toBe("This suit of armor is reinforced with adamantine.");
  });

  test("apiRef carries open5e system, the detail key as slug, and the ruleset", () => {
    const detail = magicItemDetailFactory.build({
      key: "srd-2024_bag-of-holding",
      ruleset: "2024",
    });
    const card = magicItemDetailToCard(detail);
    expect(card.apiRef).toEqual({
      system: "open5e",
      slug: "srd-2024_bag-of-holding",
      ruleset: "2024",
    });
  });

  test("source is 'api' and imageUrl is undefined (Open5e magicitems has no image field)", () => {
    const detail = magicItemDetailFactory.build();
    const card = magicItemDetailToCard(detail);
    expect(card.source).toBe("api");
    expect(card.imageUrl).toBeUndefined();
  });
});
