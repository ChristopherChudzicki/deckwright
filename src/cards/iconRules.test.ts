import { describe, expect, test } from "vitest";
import { itemCardFactory, spellCardFactory } from "./factories";
import { FALLBACK_ICON_KEY, pickIconKey, pickSpellIconKey, SCHOOL_ICONS } from "./iconRules";

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

describe("pickSpellIconKey — school detection", () => {
  test.each([
    ["abjuration", SCHOOL_ICONS.abjuration],
    ["conjuration", SCHOOL_ICONS.conjuration],
    ["divination", SCHOOL_ICONS.divination],
    ["enchantment", SCHOOL_ICONS.enchantment],
    ["evocation", SCHOOL_ICONS.evocation],
    ["illusion", SCHOOL_ICONS.illusion],
    ["necromancy", SCHOOL_ICONS.necromancy],
    ["transmutation", SCHOOL_ICONS.transmutation],
  ] as const)("%s in headerTags resolves to its school icon", (school, expected) => {
    const card = spellCardFactory.build({
      name: "Mystery Spell",
      headerTags: [`3rd-level ${school}`],
    });
    expect(pickSpellIconKey(card)).toBe(expected);
  });

  test("cantrip form '<School> cantrip' is detected (case-insensitive)", () => {
    const card = spellCardFactory.build({
      name: "Mystery Spell",
      headerTags: ["Divination cantrip"],
    });
    expect(pickSpellIconKey(card)).toBe(SCHOOL_ICONS.divination);
  });

  test("custom spell with no school in headerTags falls through to fallback", () => {
    const card = spellCardFactory.build({
      name: "Mystery Spell",
      headerTags: ["1 action"],
    });
    expect(pickSpellIconKey(card)).toBe(FALLBACK_ICON_KEY);
  });
});

describe("pickSpellIconKey — name keyword rules (run before school)", () => {
  test("Fireball → fire-flower (overrides Evocation school)", () => {
    const card = spellCardFactory.build({
      name: "Fireball",
      headerTags: ["3rd-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("fire-flower");
  });

  test("Lightning Bolt → lightning-arc", () => {
    const card = spellCardFactory.build({
      name: "Lightning Bolt",
      headerTags: ["3rd-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("lightning-arc");
  });

  test("Thunderwave → lightning-arc", () => {
    const card = spellCardFactory.build({
      name: "Thunderwave",
      headerTags: ["1st-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("lightning-arc");
  });

  test("Cone of Cold → ice-cube", () => {
    const card = spellCardFactory.build({
      name: "Cone of Cold",
      headerTags: ["5th-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("ice-cube");
  });

  test("Cloudkill → poison-cloud", () => {
    const card = spellCardFactory.build({
      name: "Cloudkill",
      headerTags: ["5th-level conjuration"],
    });
    expect(pickSpellIconKey(card)).toBe("poison-cloud");
  });

  test("Cure Wounds → caduceus", () => {
    const card = spellCardFactory.build({
      name: "Cure Wounds",
      headerTags: ["1st-level abjuration"],
    });
    expect(pickSpellIconKey(card)).toBe("caduceus");
  });

  test("Bless → holy-symbol", () => {
    const card = spellCardFactory.build({
      name: "Bless",
      headerTags: ["1st-level enchantment"],
    });
    expect(pickSpellIconKey(card)).toBe("holy-symbol");
  });

  test("Shield (the spell) → magic-shield", () => {
    const card = spellCardFactory.build({
      name: "Shield",
      headerTags: ["1st-level abjuration"],
    });
    expect(pickSpellIconKey(card)).toBe("magic-shield");
  });

  test("Fly → feathered-wing", () => {
    const card = spellCardFactory.build({
      name: "Fly",
      headerTags: ["3rd-level transmutation"],
    });
    expect(pickSpellIconKey(card)).toBe("feathered-wing");
  });

  test("Sleep → night-sleep", () => {
    const card = spellCardFactory.build({
      name: "Sleep",
      headerTags: ["1st-level enchantment"],
    });
    expect(pickSpellIconKey(card)).toBe("night-sleep");
  });

  test("Charm Person → charm", () => {
    const card = spellCardFactory.build({
      name: "Charm Person",
      headerTags: ["1st-level enchantment"],
    });
    expect(pickSpellIconKey(card)).toBe("charm");
  });

  test("Hold Person → charm", () => {
    const card = spellCardFactory.build({
      name: "Hold Person",
      headerTags: ["2nd-level enchantment"],
    });
    expect(pickSpellIconKey(card)).toBe("charm");
  });

  test("Cause Fear → evil-eyes", () => {
    const card = spellCardFactory.build({
      name: "Cause Fear",
      headerTags: ["1st-level necromancy"],
    });
    expect(pickSpellIconKey(card)).toBe("evil-eyes");
  });

  test("Bestow Curse → cursed-star", () => {
    const card = spellCardFactory.build({
      name: "Bestow Curse",
      headerTags: ["3rd-level necromancy"],
    });
    expect(pickSpellIconKey(card)).toBe("cursed-star");
  });

  test("Find Familiar → magic-portal", () => {
    const card = spellCardFactory.build({
      name: "Find Familiar",
      headerTags: ["1st-level conjuration"],
    });
    expect(pickSpellIconKey(card)).toBe("magic-portal");
  });

  test("Misty Step → magic-portal", () => {
    const card = spellCardFactory.build({
      name: "Misty Step",
      headerTags: ["2nd-level conjuration"],
    });
    expect(pickSpellIconKey(card)).toBe("magic-portal");
  });

  test("Daylight → sun (and Lightning Bolt is unaffected — order check)", () => {
    expect(
      pickSpellIconKey(
        spellCardFactory.build({ name: "Daylight", headerTags: ["3rd-level evocation"] }),
      ),
    ).toBe("sun");
    expect(
      pickSpellIconKey(
        spellCardFactory.build({
          name: "Lightning Bolt",
          headerTags: ["3rd-level evocation"],
        }),
      ),
    ).toBe("lightning-arc");
  });

  test("Moonbeam → moon", () => {
    const card = spellCardFactory.build({
      name: "Moonbeam",
      headerTags: ["2nd-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("moon");
  });

  test("Detect Magic → evil-eyes", () => {
    const card = spellCardFactory.build({
      name: "Detect Magic",
      headerTags: ["1st-level divination"],
    });
    expect(pickSpellIconKey(card)).toBe("evil-eyes");
  });

  test("school-only fallback works when no name keyword matches (Counterspell → abjuration → magic-shield)", () => {
    const card = spellCardFactory.build({
      name: "Counterspell",
      headerTags: ["3rd-level abjuration"],
    });
    expect(pickSpellIconKey(card)).toBe("magic-shield");
  });

  test("Faerie Fire → sun (override beats fire rule)", () => {
    const card = spellCardFactory.build({
      name: "Faerie Fire",
      headerTags: ["1st-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("sun");
  });

  test("Sacred Flame → holy-symbol (override beats fire rule)", () => {
    const card = spellCardFactory.build({
      name: "Sacred Flame",
      headerTags: ["Evocation cantrip"],
    });
    expect(pickSpellIconKey(card)).toBe("holy-symbol");
  });

  test("Power Word Kill → skull-crossed-bones", () => {
    const card = spellCardFactory.build({
      name: "Power Word Kill",
      headerTags: ["9th-level enchantment"],
    });
    expect(pickSpellIconKey(card)).toBe("skull-crossed-bones");
  });

  test("Power Word Heal → caduceus (heal rule wins over power-word)", () => {
    const card = spellCardFactory.build({
      name: "Power Word Heal",
      headerTags: ["9th-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("caduceus");
  });

  test("Feather Fall → feathered-wing", () => {
    const card = spellCardFactory.build({
      name: "Feather Fall",
      headerTags: ["1st-level transmutation"],
    });
    expect(pickSpellIconKey(card)).toBe("feathered-wing");
  });

  test("Searing Smite → holy-symbol", () => {
    const card = spellCardFactory.build({
      name: "Searing Smite",
      headerTags: ["1st-level evocation"],
    });
    expect(pickSpellIconKey(card)).toBe("holy-symbol");
  });
});

describe("pickIconKey — kind dispatch", () => {
  test("spell card routes through pickSpellIconKey (Fireball → fire-flower)", () => {
    const card = spellCardFactory.build({
      name: "Fireball",
      headerTags: ["3rd-level evocation"],
    });
    expect(pickIconKey(card)).toBe("fire-flower");
  });

  test("item card still uses item rules (Trident → trident)", () => {
    const card = itemCardFactory.build({
      name: "Trident +1",
      headerTags: ["Weapon", "rare"],
    });
    expect(pickIconKey(card)).toBe("trident");
  });

  test("a spell named 'Spirit Hammer' does NOT pick the warhammer item icon", () => {
    const card = spellCardFactory.build({
      name: "Spirit Hammer",
      headerTags: ["2nd-level evocation"],
    });
    // No spell name rule matches "hammer" → falls through to school = evocation
    expect(pickIconKey(card)).toBe(SCHOOL_ICONS.evocation);
  });
});
