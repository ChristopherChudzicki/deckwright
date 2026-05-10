import { describe, expect, test, vi } from "vitest";
import { itemCardFactory, spellCardFactory } from "./factories";
import {
  FALLBACK_ICON_KEY,
  ITEM_RULES,
  pickIconKey,
  pickSpellIconKey,
  SCHOOL_ICONS,
  SPELL_NAME_RULES,
} from "./iconRules";

describe("icon rules registry", () => {
  test("every referenced iconKey exists in @iconify-json/game-icons", async () => {
    // Bypass the test-fixture mock from src/test/setup.ts; this guard
    // only means anything against the real ~4000-icon bundle.
    const real = await vi.importActual<{ default: { icons: Record<string, unknown> } }>(
      "@iconify-json/game-icons/icons.json",
    );
    const available = new Set(Object.keys(real.default.icons));
    const referenced = new Set<string>();
    for (const rule of ITEM_RULES) referenced.add(rule.iconKey);
    for (const rule of SPELL_NAME_RULES) referenced.add(rule.iconKey);
    for (const icon of Object.values(SCHOOL_ICONS)) referenced.add(icon);
    referenced.add(FALLBACK_ICON_KEY);
    const missing = [...referenced].filter((k) => !available.has(k));
    expect(missing).toEqual([]);
  });
});

describe("pickIconKey", () => {
  test("Trident in the name picks 'trident', not 'broadsword'", () => {
    const card = itemCardFactory.build({
      name: "Flame Tongue Trident",
      headerTags: ["Weapon", "rare"],
    });
    expect(pickIconKey(card)).toBe("trident");
  });

  test("Axe variants pick 'battle-axe'", () => {
    expect(pickIconKey(itemCardFactory.build({ name: "Battleaxe" }))).toBe("battle-axe");
    expect(pickIconKey(itemCardFactory.build({ name: "Greataxe of Vorpal" }))).toBe("battle-axe");
    expect(pickIconKey(itemCardFactory.build({ name: "Handaxe" }))).toBe("battle-axe");
  });

  test("Hammer variants pick 'warhammer'", () => {
    expect(pickIconKey(itemCardFactory.build({ name: "Warhammer of Thunder" }))).toBe("warhammer");
    expect(pickIconKey(itemCardFactory.build({ name: "Maul +1" }))).toBe("warhammer");
  });

  test("Bow variants pick 'bow-arrow' (not the broadsword catch-all)", () => {
    expect(pickIconKey(itemCardFactory.build({ name: "Elven Longbow" }))).toBe("bow-arrow");
    expect(pickIconKey(itemCardFactory.build({ name: "Shortbow" }))).toBe("bow-arrow");
  });

  test("Crossbow picks 'crossbow', not 'bow-arrow'", () => {
    expect(pickIconKey(itemCardFactory.build({ name: "Crossbow of Speed" }))).toBe("crossbow");
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
    const card = itemCardFactory.build({ name: "POTION OF HEALING" });
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
  // Default factory headerTags ("1 action", "60 feet", "Instantaneous") don't
  // trigger any name rule, so name alone determines the iconKey for these.
  test.each([
    // Specific-name overrides that beat more generic patterns later in the list
    { name: "Faerie Fire", expected: "sun" },
    { name: "Sacred Flame", expected: "holy-symbol" },
    { name: "Fireball", expected: "fireball" },
    // Element / damage-type rules
    { name: "Wall of Fire", expected: "fire-flower" },
    { name: "Lightning Bolt", expected: "lightning-arc" },
    { name: "Thunderwave", expected: "lightning-arc" },
    { name: "Cone of Cold", expected: "ice-cube" },
    { name: "Cloudkill", expected: "poison-cloud" },
    // Healing / divine — note: heal rule fires before power-word, so
    // "Power Word Heal" intentionally lands on caduceus, not skull.
    { name: "Cure Wounds", expected: "caduceus" },
    { name: "Bless", expected: "holy-symbol" },
    { name: "Searing Smite", expected: "holy-symbol" },
    { name: "Power Word Heal", expected: "caduceus" },
    { name: "Power Word Kill", expected: "skull-crossed-bones" },
    // Protection / movement
    { name: "Shield", expected: "magic-shield" },
    { name: "Fly", expected: "feathered-wing" },
    { name: "Feather Fall", expected: "feathered-wing" },
    // Mind effects
    { name: "Sleep", expected: "night-sleep" },
    { name: "Charm Person", expected: "charm" },
    { name: "Hold Person", expected: "charm" },
    { name: "Cause Fear", expected: "evil-eyes" },
    { name: "Bestow Curse", expected: "cursed-star" },
    // Conjuration / detection / light
    { name: "Find Familiar", expected: "magic-portal" },
    { name: "Misty Step", expected: "magic-portal" },
    { name: "Detect Magic", expected: "evil-eyes" },
    { name: "Daylight", expected: "sun" },
    { name: "Moonbeam", expected: "moon" },
  ])("'$name' picks '$expected'", ({ name, expected }) => {
    const card = spellCardFactory.build({ name });
    expect(pickSpellIconKey(card)).toBe(expected);
  });

  test("falls through to school dispatch when no name keyword matches (Counterspell → abjuration)", () => {
    const card = spellCardFactory.build({
      name: "Counterspell",
      headerTags: ["3rd-level abjuration"],
    });
    expect(pickSpellIconKey(card)).toBe("magic-shield");
  });
});

describe("pickIconKey — kind dispatch", () => {
  test("spell card routes through pickSpellIconKey (Fireball → fireball)", () => {
    const card = spellCardFactory.build({
      name: "Fireball",
      headerTags: ["3rd-level evocation"],
    });
    expect(pickIconKey(card)).toBe("fireball");
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
