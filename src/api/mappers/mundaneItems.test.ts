import { describe, expect, test } from "vitest";
import { itemCardSchema } from "../../decks/schema";
import { mundaneItemDetailFactory } from "../factories";
import { mundaneItemDetailToCard } from "./mundaneItems";

describe("mundaneItemDetailToCard", () => {
  test("output is a valid ItemCard", () => {
    const detail = mundaneItemDetailFactory.build();
    const card = mundaneItemDetailToCard(detail);
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("category goes to headerTags; no rarity/attunement", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Adventuring Gear" },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Adventuring Gear"]);
    expect(card.footerTags).toEqual([]);
  });

  test("body equals detail.desc verbatim", () => {
    const detail = mundaneItemDetailFactory.build({ desc: "50 feet of rope." });
    const card = mundaneItemDetailToCard(detail);
    expect(card.body).toBe("50 feet of rope.");
  });

  test("apiRef carries open5e system, the detail key as slug, the ruleset, and kind='mundane-items'", () => {
    const detail = mundaneItemDetailFactory.build({ key: "srd-2024_battleaxe" });
    const card = mundaneItemDetailToCard(detail);
    expect(card.apiRef).toEqual({
      system: "open5e",
      slug: "srd-2024_battleaxe",
      ruleset: detail.ruleset,
      kind: "mundane-items",
    });
  });

  test("apiRef.ruleset is '2014' when detail.ruleset is '2014'", () => {
    const detail = mundaneItemDetailFactory.build({ key: "srd_rope", ruleset: "2014" });
    const card = mundaneItemDetailToCard(detail);
    expect(card.apiRef).toEqual({
      system: "open5e",
      slug: "srd_rope",
      ruleset: "2014",
      kind: "mundane-items",
    });
  });

  test("source is 'api', kind is 'item'", () => {
    const detail = mundaneItemDetailFactory.build();
    const card = mundaneItemDetailToCard(detail);
    expect(card.source).toBe("api");
    expect(card.kind).toBe("item");
  });

  test("simple weapon → Simple + damage tag (no Martial)", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d4",
        damage_type: { name: "Bludgeoning" },
        properties: [],
        is_simple: true,
        is_martial: false,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Weapon", "Simple", "1d4 bludgeoning"]);
  });

  test("is_simple takes precedence when both is_simple and is_martial are true", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d4",
        damage_type: { name: "Bludgeoning" },
        properties: [],
        is_simple: true,
        is_martial: true,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Weapon", "Simple", "1d4 bludgeoning"]);
  });

  test("martial weapon with Mastery + Versatile properties", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d8",
        damage_type: { name: "Slashing" },
        properties: [
          { property: { name: "Topple", type: "Mastery" }, detail: null },
          { property: { name: "Versatile", type: null }, detail: "1d10" },
        ],
        is_simple: false,
        is_martial: true,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual([
      "Weapon",
      "Martial",
      "1d8 slashing",
      "Topple (Mastery)",
      "Versatile (1d10)",
    ]);
  });

  test("weapon with empty properties array produces no property tags", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d8",
        damage_type: { name: "Piercing" },
        properties: [],
        is_simple: false,
        is_martial: true,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Weapon", "Martial", "1d8 piercing"]);
  });

  test("ranged weapon: Ammunition property carries range in its detail suffix", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d8",
        damage_type: { name: "Piercing" },
        properties: [
          {
            property: { name: "Ammunition", type: null },
            detail: "Range 150/600; Arrow",
          },
          { property: { name: "Heavy", type: null }, detail: null },
          { property: { name: "Two-Handed", type: null }, detail: null },
        ],
        is_simple: false,
        is_martial: true,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual([
      "Weapon",
      "Martial",
      "1d8 piercing",
      "Ammunition (Range 150/600; Arrow)",
      "Heavy",
      "Two-Handed",
    ]);
  });

  test("category-weapon with weapon: null → only category tag (improvised/consumable)", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      desc: "When you take the Attack action, you can replace one of your attacks with throwing a vial of Acid…",
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Weapon"]);
    expect(card.body).toContain("Acid");
  });

  test("light armor with uncapped dex bonus", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "light",
        ac_base: 11,
        ac_add_dexmod: true,
        ac_cap_dexmod: null,
        grants_stealth_disadvantage: false,
        strength_score_required: null,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Armor", "Light", "AC 11 + dex mod"]);
  });

  test("medium armor (capped dex bonus)", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "medium",
        ac_base: 14,
        ac_add_dexmod: true,
        ac_cap_dexmod: 2,
        grants_stealth_disadvantage: false,
        strength_score_required: null,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Armor", "Medium", "AC 14 + dex mod (max 2)"]);
  });

  test("heavy armor with stealth disadvantage and strength requirement", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "heavy",
        ac_base: 16,
        ac_add_dexmod: false,
        ac_cap_dexmod: null,
        grants_stealth_disadvantage: true,
        strength_score_required: 13,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Armor", "Heavy", "AC 16", "Stealth disadvantage", "Str 13"]);
  });

  test("armor with ac_add_dexmod=false ignores ac_cap_dexmod silently", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "heavy",
        ac_base: 16,
        ac_add_dexmod: false,
        ac_cap_dexmod: 2, // intentionally non-null; should be ignored because dex isn't added
        grants_stealth_disadvantage: false,
        strength_score_required: null,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Armor", "Heavy", "AC 16"]);
  });

  test("shield (Open5e quirk: armor.category='heavy', ac_base<=5) → no tier tag, '+N AC'", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "heavy",
        ac_base: 2,
        ac_add_dexmod: false,
        ac_cap_dexmod: null,
        grants_stealth_disadvantage: false,
        strength_score_required: null,
      },
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Armor", "+2 AC"]);
  });

  test("shield/armor boundary: ac_base=5 is shield format; ac_base=6 is armor format", () => {
    const atThreshold = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "heavy",
        ac_base: 5,
        ac_add_dexmod: false,
        ac_cap_dexmod: null,
        grants_stealth_disadvantage: false,
        strength_score_required: null,
      },
    });
    expect(mundaneItemDetailToCard(atThreshold).headerTags).toEqual(["Armor", "+5 AC"]);

    const justAbove = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "heavy",
        ac_base: 6,
        ac_add_dexmod: false,
        ac_cap_dexmod: null,
        grants_stealth_disadvantage: false,
        strength_score_required: null,
      },
    });
    expect(mundaneItemDetailToCard(justAbove).headerTags).toEqual(["Armor", "Heavy", "AC 6"]);
  });

  test("cost: 10.00 → '10 gp', '0.50' → '5 sp', '0.05' → '5 cp', '0.00' omitted", () => {
    const cases: [string, string | null][] = [
      ["10.00", "10 gp"],
      ["1.00", "1 gp"],
      ["400.00", "400 gp"],
      ["0.50", "5 sp"],
      ["0.40", "4 sp"],
      ["0.20", "2 sp"],
      ["0.10", "1 sp"],
      ["0.05", "5 cp"],
      ["0.04", "4 cp"],
      ["0.02", "2 cp"],
      ["0.01", "1 cp"],
      ["0.00", null],
    ];
    for (const [cost, expected] of cases) {
      const detail = mundaneItemDetailFactory.build({ cost, weight: "0.000" });
      const card = mundaneItemDetailToCard(detail);
      if (expected === null) {
        expect(card.footerTags, `cost=${cost}`).toEqual([]);
      } else {
        expect(card.footerTags, `cost=${cost}`).toContain(expected);
      }
    }
  });

  test("cost first, then weight in footer", () => {
    const detail = mundaneItemDetailFactory.build({
      cost: "10.00",
      weight: "4.000",
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.footerTags).toEqual(["10 gp", "4 lb"]);
  });

  test("weight = '0.000' → no weight tag in footer", () => {
    const detail = mundaneItemDetailFactory.build({
      cost: "10.00",
      weight: "0.000",
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.footerTags).toEqual(["10 gp"]);
  });
});
