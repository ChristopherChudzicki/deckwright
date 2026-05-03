import { describe, expect, test } from "vitest";
import { itemCardFactory } from "./factories";
import { FALLBACK_ICON_KEY, pickIconKey } from "./iconRules";

describe("pickIconKey", () => {
  test("Trident in the name picks 'trident', not 'broadsword'", () => {
    const card = itemCardFactory.build({
      name: "Flame Tongue Trident",
      headerTags: ["Weapon", "rare"],
    });
    expect(pickIconKey(card)).toBe("trident");
  });

  test("Axe variants pick 'battle-axe'", () => {
    expect(pickIconKey(itemCardFactory.build({ name: "Battleaxe", headerTags: [] }))).toBe(
      "battle-axe",
    );
    expect(pickIconKey(itemCardFactory.build({ name: "Greataxe of Vorpal", headerTags: [] }))).toBe(
      "battle-axe",
    );
    expect(pickIconKey(itemCardFactory.build({ name: "Handaxe", headerTags: [] }))).toBe(
      "battle-axe",
    );
  });

  test("Hammer variants pick 'warhammer'", () => {
    expect(
      pickIconKey(itemCardFactory.build({ name: "Warhammer of Thunder", headerTags: [] })),
    ).toBe("warhammer");
    expect(pickIconKey(itemCardFactory.build({ name: "Maul +1", headerTags: [] }))).toBe(
      "warhammer",
    );
  });

  test("Bow variants pick 'bow-arrow' (not the broadsword catch-all)", () => {
    expect(pickIconKey(itemCardFactory.build({ name: "Elven Longbow", headerTags: [] }))).toBe(
      "bow-arrow",
    );
    expect(pickIconKey(itemCardFactory.build({ name: "Shortbow", headerTags: [] }))).toBe(
      "bow-arrow",
    );
  });

  test("Crossbow picks 'crossbow', not 'bow-arrow'", () => {
    expect(pickIconKey(itemCardFactory.build({ name: "Crossbow of Speed", headerTags: [] }))).toBe(
      "crossbow",
    );
  });

  test("Generic weapon catch-all picks 'broadsword'", () => {
    const card = itemCardFactory.build({
      name: "Vorpal Sword",
      headerTags: ["Weapon", "very rare"],
    });
    expect(pickIconKey(card)).toBe("broadsword");
  });

  test("Armor headerTags picks 'shield'", () => {
    const card = itemCardFactory.build({
      name: "Sentinel Shield",
      headerTags: ["Armor (shield)", "uncommon"],
    });
    expect(pickIconKey(card)).toBe("shield");
  });

  test("Rings headerTags picks 'ring'", () => {
    const card = itemCardFactory.build({
      name: "Ring of Protection",
      headerTags: ["Rings", "rare"],
    });
    expect(pickIconKey(card)).toBe("ring");
  });

  test("Potion headerTags picks 'potion-ball'", () => {
    const card = itemCardFactory.build({
      name: "Potion of Healing",
      headerTags: ["Potions", "common"],
    });
    expect(pickIconKey(card)).toBe("potion-ball");
  });

  test("Scroll headerTags picks 'scroll-unfurled'", () => {
    const card = itemCardFactory.build({
      name: "Spell Scroll",
      headerTags: ["Scrolls", "uncommon"],
    });
    expect(pickIconKey(card)).toBe("scroll-unfurled");
  });

  test("Rod/wand/staff picks 'wizard-staff'", () => {
    expect(
      pickIconKey(
        itemCardFactory.build({ name: "Rod of Absorption", headerTags: ["Rods", "very rare"] }),
      ),
    ).toBe("wizard-staff");
    expect(
      pickIconKey(
        itemCardFactory.build({
          name: "Wand of Magic Missiles",
          headerTags: ["Wands", "uncommon"],
        }),
      ),
    ).toBe("wizard-staff");
    expect(
      pickIconKey(
        itemCardFactory.build({ name: "Staff of Power", headerTags: ["Staves", "very rare"] }),
      ),
    ).toBe("wizard-staff");
  });

  test("Ammunition headerTags picks 'arrow-cluster'", () => {
    const card = itemCardFactory.build({
      name: "Arrow +1",
      headerTags: ["Ammunition", "uncommon"],
    });
    expect(pickIconKey(card)).toBe("arrow-cluster");
  });

  test("Wondrous Items falls through to the fallback", () => {
    const card = itemCardFactory.build({
      name: "Bag of Holding",
      headerTags: ["Wondrous Items", "uncommon"],
    });
    expect(pickIconKey(card)).toBe(FALLBACK_ICON_KEY);
  });

  test("Completely unmatched item falls through to the fallback", () => {
    const card = itemCardFactory.build({ name: "Mysterious Object", headerTags: [] });
    expect(pickIconKey(card)).toBe(FALLBACK_ICON_KEY);
  });

  test("Case-insensitive matching", () => {
    const card = itemCardFactory.build({ name: "POTION OF HEALING", headerTags: [] });
    expect(pickIconKey(card)).toBe("potion-ball");
  });
});
