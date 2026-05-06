# Spell-icon heuristic + curated set expansion — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the spell mapper's hardcoded `iconKey: "magic-swirl"` with a real heuristic — name keywords first, school fallback second — and expand the curated icon set with ~33 spell-flavored entries so the picker offers real options for spell cards.

**Architecture:** Two parallel rule tables (`ITEM_RULES`, `SPELL_NAME_RULES`) plus an 8-entry `SCHOOL_ICONS` map all live in `src/cards/iconRules.ts`. `pickIconKey(card)` dispatches on `card.kind`. Spell mapper drops the hardcode; `Card.tsx`'s existing `card.iconKey ?? pickIconKey(card)` line picks up the slack. Curated set grows from ~95 to ~128 icons.

**Tech Stack:** React 18 + TypeScript + Vite, `@iconify/react@^6`, `@iconify-json/game-icons`, Vitest + RTL + `@testing-library/user-event`, `fishery` + `@faker-js/faker` for factories, Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-05-05-spell-icon-heuristic-design.md`

**Conventions for the executor:**
- Per `CLAUDE.md`: `npm test`, `npm run dev`, `npm run build` are pre-approved; ask before `npm install`.
- Tests use `getByRole(...)` over text/class selectors. Factories pass no values they don't assert on.
- Biome's formatter is authoritative — accept its reformatting if it changes whitespace or import ordering.
- Default to no comments. Only add one when the *why* is non-obvious.
- Don't push or create PRs.
- Work happens on the existing `spell-icons` branch (already created by a pre-commit hook on the spec).

---

## Task 1: Add a `spellCardFactory`

A factory for `SpellCard` doesn't exist yet; the spell-rule tests in later tasks need it. Defaults are deliberately neutral — no school in `headerTags`, no name keyword that would match a rule — so callers must opt in to the values they're asserting on.

**Files:**
- Modify: `src/cards/factories.ts`

- [ ] **Step 1: Add the factory**

In `src/cards/factories.ts`:

```ts
import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { ItemCard, SpellCard } from "./types";

const rarities = ["common", "uncommon", "rare", "very rare", "legendary"];

export const itemCardFactory = Factory.define<ItemCard>(() => {
  const now = new Date().toISOString();
  return {
    id: faker.string.nanoid(),
    kind: "item",
    name: faker.commerce.productName(),
    headerTags: ["Wondrous item", faker.helpers.arrayElement(rarities)],
    body: faker.lorem.paragraph(),
    footerTags: [
      `${faker.number.int({ min: 10, max: 5000 })} gp`,
      `${faker.number.int({ min: 1, max: 30 })} lb`,
    ],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});

export const spellCardFactory = Factory.define<SpellCard>(() => {
  const now = new Date().toISOString();
  return {
    id: faker.string.nanoid(),
    kind: "spell",
    name: faker.lorem.words(2),
    headerTags: ["1 action", "60 feet", "Instantaneous"],
    body: faker.lorem.paragraph(),
    footerTags: ["V, S"],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});
```

Note the spell factory's default `headerTags` deliberately omits any school name and any name keyword that would match a rule, so by default `pickIconKey` on a `spellCardFactory.build()` falls through to the dice fallback.

- [ ] **Step 2: Verify nothing broke**

Run: `npm test -- --run src/cards/factories`

Expected: PASS (no factory tests yet, but the file should compile and existing tests that import from it should still pass).

Run: `npm test -- --run src/cards`

Expected: PASS — all existing card tests still green.

- [ ] **Step 3: Commit**

```bash
git add src/cards/factories.ts
git commit -m "test: add spellCardFactory"
```

---

## Task 2: Expand the curated icon set with 33 spell-flavored entries

Pure additive change. No code path uses these new icons yet, but the existing `curatedIcons.test.ts` will verify they all exist in `@iconify-json/game-icons` once added.

**Files:**
- Modify: `src/cards/curatedIcons.ts`
- Modify: `src/cards/resolveIcon.tsx`

- [ ] **Step 1: Add the entries to `CURATED_ICONS`**

In `src/cards/curatedIcons.ts`, add the new entries to the existing array. Group them in sensible sections. Replace the existing `// Magical effects` section through `// Misc / fallback` with:

```ts
  // Magical effects
  "fire-flower",
  "ice-cube",
  "lightning-arc",
  "holy-symbol",
  "skull-crossed-bones",
  "evil-eyes",
  "moon",
  "sun",
  "snowflake-1",
  "tornado",
  "frozen-orb",
  "fire-spell-cast",
  "bolt-spell-cast",
  "ice-spell-cast",
  "thunder-struck",
  "arcing-bolt",
  "poison-cloud",
  "sunbeams",
  "death-juice",
  "plasma-bolt",
  // Spell schools (defaults + alternates)
  "charm",
  "drama-masks",
  "transform",
  "love-mystery",
  "imprisoned",
  "frog-prince",
  "morph-ball",
  "spectre",
  "theater-curtains",
  "ghost",
  "grim-reaper",
  "all-seeing-eye",
  "eye-of-horus",
  // Healing / divine / buffs / debuffs
  "caduceus",
  "healing",
  "healing-shield",
  "prayer",
  "angel-wings",
  "night-sleep",
  "cursed-star",
  "feathered-wing",
  "wingfoot",
  "enrage",
  // Creature parts
  "dragon-head",
  "wolf-head",
  "claws",
  "fangs",
  "horned-skull",
  // Containers
  "knapsack",
  "swap-bag",
  "locked-chest",
  "bloody-stash",
  "crystal-shrine",
  // Misc / fallback
  "perspective-dice-six-faces-random",
```

The 33 new keys (in order added above):

```
frozen-orb, fire-spell-cast, bolt-spell-cast, ice-spell-cast,
thunder-struck, arcing-bolt, poison-cloud, sunbeams, death-juice, plasma-bolt,
charm, drama-masks, transform, love-mystery, imprisoned, frog-prince,
morph-ball, spectre, theater-curtains, ghost, grim-reaper,
all-seeing-eye, eye-of-horus,
caduceus, healing, healing-shield, prayer, angel-wings,
night-sleep, cursed-star, feathered-wing, wingfoot, enrage
```

- [ ] **Step 2: Run the curated-icons existence test**

Run: `npm test -- --run src/cards/curatedIcons.test.ts`

Expected: PASS — every new key exists in `@iconify-json/game-icons`. (If anything fails, the icon name was misspelled; cross-check the key against the package's icons.json.)

- [ ] **Step 3: Add per-icon imports and CURATED entries in `resolveIcon.tsx`**

In `src/cards/resolveIcon.tsx`, add imports near the existing alphabetical blocks (Biome will reformat):

```ts
import iconAllSeeingEye from "@iconify-icons/game-icons/all-seeing-eye";
import iconAngelWings from "@iconify-icons/game-icons/angel-wings";
import iconArcingBolt from "@iconify-icons/game-icons/arcing-bolt";
import iconBoltSpellCast from "@iconify-icons/game-icons/bolt-spell-cast";
import iconCaduceus from "@iconify-icons/game-icons/caduceus";
import iconCharm from "@iconify-icons/game-icons/charm";
import iconCursedStar from "@iconify-icons/game-icons/cursed-star";
import iconDeathJuice from "@iconify-icons/game-icons/death-juice";
import iconDramaMasks from "@iconify-icons/game-icons/drama-masks";
import iconEnrage from "@iconify-icons/game-icons/enrage";
import iconEyeOfHorus from "@iconify-icons/game-icons/eye-of-horus";
import iconFeatheredWing from "@iconify-icons/game-icons/feathered-wing";
import iconFireSpellCast from "@iconify-icons/game-icons/fire-spell-cast";
import iconFrogPrince from "@iconify-icons/game-icons/frog-prince";
import iconFrozenOrb from "@iconify-icons/game-icons/frozen-orb";
import iconGhost from "@iconify-icons/game-icons/ghost";
import iconGrimReaper from "@iconify-icons/game-icons/grim-reaper";
import iconHealing from "@iconify-icons/game-icons/healing";
import iconHealingShield from "@iconify-icons/game-icons/healing-shield";
import iconIceSpellCast from "@iconify-icons/game-icons/ice-spell-cast";
import iconImprisoned from "@iconify-icons/game-icons/imprisoned";
import iconLoveMystery from "@iconify-icons/game-icons/love-mystery";
import iconMorphBall from "@iconify-icons/game-icons/morph-ball";
import iconNightSleep from "@iconify-icons/game-icons/night-sleep";
import iconPlasmaBolt from "@iconify-icons/game-icons/plasma-bolt";
import iconPoisonCloud from "@iconify-icons/game-icons/poison-cloud";
import iconPrayer from "@iconify-icons/game-icons/prayer";
import iconSpectre from "@iconify-icons/game-icons/spectre";
import iconSunbeams from "@iconify-icons/game-icons/sunbeams";
import iconTheaterCurtains from "@iconify-icons/game-icons/theater-curtains";
import iconThunderStruck from "@iconify-icons/game-icons/thunder-struck";
import iconTransform from "@iconify-icons/game-icons/transform";
import iconWingfoot from "@iconify-icons/game-icons/wingfoot";
```

Then add the corresponding entries to the `CURATED` record (Biome will keep them in key-order):

```ts
  "all-seeing-eye": iconAllSeeingEye,
  "angel-wings": iconAngelWings,
  "arcing-bolt": iconArcingBolt,
  "bolt-spell-cast": iconBoltSpellCast,
  caduceus: iconCaduceus,
  charm: iconCharm,
  "cursed-star": iconCursedStar,
  "death-juice": iconDeathJuice,
  "drama-masks": iconDramaMasks,
  enrage: iconEnrage,
  "eye-of-horus": iconEyeOfHorus,
  "feathered-wing": iconFeatheredWing,
  "fire-spell-cast": iconFireSpellCast,
  "frog-prince": iconFrogPrince,
  "frozen-orb": iconFrozenOrb,
  ghost: iconGhost,
  "grim-reaper": iconGrimReaper,
  healing: iconHealing,
  "healing-shield": iconHealingShield,
  "ice-spell-cast": iconIceSpellCast,
  imprisoned: iconImprisoned,
  "love-mystery": iconLoveMystery,
  "morph-ball": iconMorphBall,
  "night-sleep": iconNightSleep,
  "plasma-bolt": iconPlasmaBolt,
  "poison-cloud": iconPoisonCloud,
  prayer: iconPrayer,
  spectre: iconSpectre,
  sunbeams: iconSunbeams,
  "theater-curtains": iconTheaterCurtains,
  "thunder-struck": iconThunderStruck,
  transform: iconTransform,
  wingfoot: iconWingfoot,
```

- [ ] **Step 4: Run curated tests + render tests**

Run: `npm test -- --run src/cards/curatedIcons.test.ts src/cards/resolveIcon.test.tsx`

Expected: PASS.

- [ ] **Step 5: Sanity-check the build**

Run: `npm run build`

Expected: clean build, no missing-import errors.

- [ ] **Step 6: Commit**

```bash
git add src/cards/curatedIcons.ts src/cards/resolveIcon.tsx
git commit -m "feat(icons): expand curated set with spell-flavored icons"
```

---

## Task 3: Rename `ICON_RULES` → `ITEM_RULES`

Pure rename. Updates the constant name in the module that declares it and in every consumer. No behavior change. This sets the table for adding `SPELL_NAME_RULES` next to it.

**Files:**
- Modify: `src/cards/iconRules.ts`
- Modify: `src/cards/iconRules.test.ts`
- Modify: `src/views/IconDebugView.tsx`
- Modify: `src/views/IconDebugView.test.tsx`

- [ ] **Step 1: Rename the constant in `iconRules.ts`**

Change:

```ts
export const ICON_RULES: readonly IconRule[] = [...];
```

to:

```ts
export const ITEM_RULES: readonly IconRule[] = [...];
```

And inside `pickIconKey`, replace `ICON_RULES` with `ITEM_RULES`.

- [ ] **Step 2: Update consumers**

In `src/cards/iconRules.test.ts`:

```ts
import { FALLBACK_ICON_KEY, pickIconKey } from "./iconRules";
```

stays the same (no `ICON_RULES` import). No further change here.

In `src/views/IconDebugView.tsx`, replace the import and all references:

```ts
import { FALLBACK_ICON_KEY, ITEM_RULES } from "../cards/iconRules";
```

and inside `pickRule` and the JSX, replace every `ICON_RULES` with `ITEM_RULES`.

In `src/views/IconDebugView.test.tsx`, replace:

```ts
import { ICON_RULES } from "../cards/iconRules";
```

with:

```ts
import { ITEM_RULES } from "../cards/iconRules";
```

and update the assertion `expect(rows.length).toBe(1 + ICON_RULES.length + 1);` to use `ITEM_RULES.length`.

- [ ] **Step 3: Run the affected suites**

Run: `npm test -- --run src/cards/iconRules src/views/IconDebugView`

Expected: PASS — every test still green.

- [ ] **Step 4: Run a full type/build sanity check**

Run: `npm run build`

Expected: clean build, no `ICON_RULES` references left anywhere.

- [ ] **Step 5: Commit**

```bash
git add src/cards/iconRules.ts src/views/IconDebugView.tsx src/views/IconDebugView.test.tsx
git commit -m "refactor(icons): rename ICON_RULES to ITEM_RULES"
```

---

## Task 4: Add `SCHOOL_ICONS` and a school-only `pickSpellIconKey`

Introduces school detection in isolation. `pickIconKey` is *not* yet wired to dispatch — that comes in Task 6. Tests target `pickSpellIconKey` directly.

**Files:**
- Modify: `src/cards/iconRules.ts`
- Modify: `src/cards/iconRules.test.ts`

- [ ] **Step 1: Write failing tests for `pickSpellIconKey` (school-only)**

In `src/cards/iconRules.test.ts`, add at the bottom (after the existing `describe("pickIconKey", ...)` block):

```ts
import { pickSpellIconKey, SCHOOL_ICONS } from "./iconRules";
import { spellCardFactory } from "./factories";

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
      headerTags: [`3rd-level ${school}`, "1 action", "60 feet", "Instantaneous"],
    });
    expect(pickSpellIconKey(card)).toBe(expected);
  });

  test("cantrip form '<School> cantrip' is detected (case-insensitive)", () => {
    const card = spellCardFactory.build({
      headerTags: ["Divination cantrip", "1 action", "Touch", "Instantaneous"],
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
```

- [ ] **Step 2: Run the tests, confirm failure**

Run: `npm test -- --run src/cards/iconRules.test.ts -t "pickSpellIconKey"`

Expected: FAIL — `pickSpellIconKey` and `SCHOOL_ICONS` not exported.

- [ ] **Step 3: Implement `SCHOOL_ICONS` and `pickSpellIconKey`**

In `src/cards/iconRules.ts`, add:

```ts
export const SCHOOL_ICONS = {
  abjuration: "magic-shield",
  conjuration: "magic-portal",
  divination: "crystal-ball",
  enchantment: "charm",
  evocation: "magic-swirl",
  illusion: "drama-masks",
  necromancy: "skull-crossed-bones",
  transmutation: "transform",
} as const satisfies Record<string, string>;

const SCHOOL_NAMES = Object.keys(SCHOOL_ICONS) as (keyof typeof SCHOOL_ICONS)[];

export function pickSpellIconKey(card: RenderableCard): string {
  for (const tag of card.headerTags) {
    const lower = tag.toLowerCase();
    for (const school of SCHOOL_NAMES) {
      if (new RegExp(`\\b${school}\\b`).test(lower)) {
        return SCHOOL_ICONS[school];
      }
    }
  }
  return FALLBACK_ICON_KEY;
}
```

- [ ] **Step 4: Run the tests, confirm pass**

Run: `npm test -- --run src/cards/iconRules.test.ts`

Expected: PASS — both new spell tests and existing item tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cards/iconRules.ts src/cards/iconRules.test.ts
git commit -m "feat(icons): add SCHOOL_ICONS and pickSpellIconKey (school detection)"
```

---

## Task 5: Add `SPELL_NAME_RULES` (name keywords run before school)

Adds the 17 conceptual name rules from the spec. Implemented as 12 distinct regexes (some merge across spec rows where they share an icon — e.g. summon and teleport both use `magic-portal`). Order matters: `lightning` must match before `light`.

**Files:**
- Modify: `src/cards/iconRules.ts`
- Modify: `src/cards/iconRules.test.ts`

- [ ] **Step 1: Write failing tests for spell name rules**

In `src/cards/iconRules.test.ts`, add a new `describe` block:

```ts
describe("pickSpellIconKey — name keyword rules (run before school)", () => {
  test("Fireball → fire-flower (overrides Evocation school)", () => {
    const card = spellCardFactory.build({
      name: "Fireball",
      headerTags: ["3rd-level evocation", "1 action", "150 feet", "Instantaneous"],
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

  test("school-only fallback still works (Mage Hand → conjuration → magic-portal)", () => {
    const card = spellCardFactory.build({
      name: "Mage Hand",
      headerTags: ["Conjuration cantrip"],
    });
    expect(pickSpellIconKey(card)).toBe("magic-portal");
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run src/cards/iconRules.test.ts -t "name keyword rules"`

Expected: FAIL — every test fails because no name rules exist; school detection alone returns school icons (e.g. Fireball returns `magic-swirl`, not `fire-flower`).

- [ ] **Step 3: Add `SPELL_NAME_RULES` and update `pickSpellIconKey`**

In `src/cards/iconRules.ts`, add the rules table. **Order matters** — listed top-to-bottom from spec; `lightning` (rule 2) intentionally precedes `light` (rule 11) so "Lightning Bolt" doesn't get the sun icon:

```ts
export const SPELL_NAME_RULES: readonly IconRule[] = [
  {
    pattern: /\b(?:fireball|fire|flame|flaming|burning|incendiary|combust|scorching)\b/i,
    iconKey: "fire-flower",
    description: "fire / flame / burning",
  },
  {
    pattern: /\b(?:lightning|thunderwave|thunder|shock|shocking)\b/i,
    iconKey: "lightning-arc",
    description: "lightning / thunder / shock",
  },
  {
    pattern: /\b(?:ice|cold|frost|freezing|snow)\b/i,
    iconKey: "ice-cube",
    description: "cold / ice / frost",
  },
  {
    pattern: /\b(?:poison|venom|cloudkill|stinking|acid)\b/i,
    iconKey: "poison-cloud",
    description: "poison / venom / acid / cloudkill",
  },
  {
    pattern: /\b(?:cure|heal|healing|mending|revivify|regenerate|resurrect|resurrection)\b/i,
    iconKey: "caduceus",
    description: "healing / cure / restore",
  },
  {
    pattern: /\b(?:bless|prayer|sacred|divine|guidance|sanctuary)\b/i,
    iconKey: "holy-symbol",
    description: "bless / divine / prayer",
  },
  {
    pattern: /\b(?:shield|ward|warding|protection|aid)\b/i,
    iconKey: "magic-shield",
    description: "shield / ward / protection",
  },
  {
    pattern: /\b(?:fly|levitate|jump|leap)\b/i,
    iconKey: "feathered-wing",
    description: "fly / levitate / jump",
  },
  {
    pattern: /\b(?:sleep|dream)\b/i,
    iconKey: "night-sleep",
    description: "sleep / dream",
  },
  {
    pattern: /\b(?:charm|friends|suggestion|command|compulsion|dominate|hold)\b/i,
    iconKey: "charm",
    description: "charm / hold / dominate / command",
  },
  {
    pattern: /\b(?:fear|frighten|frightened|terror)\b/i,
    iconKey: "evil-eyes",
    description: "fear / frighten",
  },
  {
    pattern: /\b(?:curse|cursed|bane|hex)\b/i,
    iconKey: "cursed-star",
    description: "curse / hex / bane",
  },
  {
    pattern: /\b(?:summon|conjure|conjuration|familiar|gate|planar|teleport|teleportation|misty|dimension)\b/i,
    iconKey: "magic-portal",
    description: "summon / conjure / teleport",
  },
  {
    pattern: /\b(?:light|lights|daylight|sunbeam|sunburst)\b/i,
    iconKey: "sun",
    description: "light / daylight / sun",
  },
  {
    pattern: /\b(?:moon|moonbeam)\b/i,
    iconKey: "moon",
    description: "moon",
  },
  {
    pattern: /\b(?:detect|scrying|clairvoyance|seeing|invisibility|locate)\b/i,
    iconKey: "evil-eyes",
    description: "detect / scry / see",
  },
];
```

Then update `pickSpellIconKey` to try name rules first:

```ts
export function pickSpellIconKey(card: RenderableCard): string {
  const haystack = `${card.name} ${card.headerTags.join(" ")}`;
  for (const rule of SPELL_NAME_RULES) {
    if (rule.pattern.test(haystack)) return rule.iconKey;
  }
  for (const tag of card.headerTags) {
    const lower = tag.toLowerCase();
    for (const school of SCHOOL_NAMES) {
      if (new RegExp(`\\b${school}\\b`).test(lower)) {
        return SCHOOL_ICONS[school];
      }
    }
  }
  return FALLBACK_ICON_KEY;
}
```

- [ ] **Step 4: Run all spell tests, confirm pass**

Run: `npm test -- --run src/cards/iconRules.test.ts`

Expected: PASS — every spell test green; all existing item tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/cards/iconRules.ts src/cards/iconRules.test.ts
git commit -m "feat(icons): add SPELL_NAME_RULES with 16 keyword groups"
```

---

## Task 6: Wire `pickIconKey` to dispatch on `card.kind`

Until now `pickIconKey` only considered item rules. This task makes it dispatch — `kind: "spell"` → `pickSpellIconKey`, `kind: "item"` → existing item logic. After this, `Card.tsx`'s existing fallback line picks the right icon for spells whose `iconKey` is `undefined`.

**Files:**
- Modify: `src/cards/iconRules.ts`
- Modify: `src/cards/iconRules.test.ts`

- [ ] **Step 1: Write a failing test for the dispatch**

In `src/cards/iconRules.test.ts`, add a new `describe` block (under the existing ones):

```ts
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run src/cards/iconRules.test.ts -t "kind dispatch"`

Expected: FAIL — `pickIconKey` currently runs item rules on every card; the Fireball spell would match the existing rules table to either fallback or the wrong icon.

- [ ] **Step 3: Refactor `pickIconKey` to dispatch**

In `src/cards/iconRules.ts`, replace the existing `pickIconKey` implementation:

```ts
function pickItemIconKey(card: RenderableCard): string {
  const haystack = `${card.name} ${card.headerTags.join(" ")}`;
  for (const rule of ITEM_RULES) {
    if (rule.pattern.test(haystack)) return rule.iconKey;
  }
  return FALLBACK_ICON_KEY;
}

export function pickIconKey(card: RenderableCard): string {
  if (card.kind === "spell") return pickSpellIconKey(card);
  return pickItemIconKey(card);
}
```

`pickItemIconKey` is private (no `export`). `pickSpellIconKey` stays exported because the IconDebugView (Task 9) needs it.

- [ ] **Step 4: Run the full iconRules suite, confirm pass**

Run: `npm test -- --run src/cards/iconRules.test.ts`

Expected: PASS — dispatch tests green, all earlier item and spell tests green.

- [ ] **Step 5: Run the full test suite to be sure nothing else broke**

Run: `npm test`

Expected: PASS across the whole project. (One test in `src/api/mappers/spells.test.ts` still asserts `iconKey === "magic-swirl"`, which still passes because the mapper still hardcodes it. That assertion gets updated in Task 7.)

- [ ] **Step 6: Commit**

```bash
git add src/cards/iconRules.ts src/cards/iconRules.test.ts
git commit -m "feat(icons): dispatch pickIconKey on card.kind"
```

---

## Task 7: Stop hardcoding `iconKey` in the spell mapper

Removes the `iconKey: "magic-swirl"` line from `spellDetailToCard`. Imported spells now have `iconKey: undefined`, and `Card.tsx`'s `card.iconKey ?? pickIconKey(card)` line resolves them via the new heuristic.

**Files:**
- Modify: `src/api/mappers/spells.ts`
- Modify: `src/api/mappers/spells.test.ts`

- [ ] **Step 1: Update the assertion in the failing direction**

In `src/api/mappers/spells.test.ts`, change the existing test:

```ts
test("source is 'api', kind is 'spell', iconKey is 'magic-swirl'", () => {
  const detail = spellDetailFactory.build();
  const card = spellDetailToCard(detail);
  expect(card.kind).toBe("spell");
  expect(card.source).toBe("api");
  expect(card.iconKey).toBe("magic-swirl");
});
```

to:

```ts
test("source is 'api', kind is 'spell', iconKey is left to the heuristic", () => {
  const detail = spellDetailFactory.build();
  const card = spellDetailToCard(detail);
  expect(card.kind).toBe("spell");
  expect(card.source).toBe("api");
  expect(card.iconKey).toBeUndefined();
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run src/api/mappers/spells.test.ts -t "iconKey"`

Expected: FAIL — mapper still sets `iconKey: "magic-swirl"`.

- [ ] **Step 3: Remove the hardcode in the mapper**

In `src/api/mappers/spells.ts`, in `spellDetailToCard`, delete the line:

```ts
    iconKey: "magic-swirl",
```

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- --run src/api/mappers/spells.test.ts`

Expected: PASS — every spell mapper test green.

- [ ] **Step 5: Sanity-check end-to-end via the full suite**

Run: `npm test`

Expected: PASS across the project.

- [ ] **Step 6: Manual smoke check — Fireball renders the fire icon**

Ask before running: `npm run dev`. Then in the browser, import the SRD spell **Fireball**. Confirm the card preview shows the `fire-flower` icon (a stylized flame), not the `magic-swirl` hand. Also import **Cure Wounds** and confirm it shows `caduceus`. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/api/mappers/spells.ts src/api/mappers/spells.test.ts
git commit -m "feat(spells): drop magic-swirl hardcode; rely on heuristic"
```

---

## Task 8: Add a curated-set invariant test

Pins the contract: every icon referenced by `ITEM_RULES`, `SPELL_NAME_RULES`, `SCHOOL_ICONS`, and `FALLBACK_ICON_KEY` must appear in `CURATED_ICONS`. Catches future additions that forget to add the icon to the curated record.

**Files:**
- Modify: `src/cards/curatedIcons.test.ts`

- [ ] **Step 1: Write the invariant test**

In `src/cards/curatedIcons.test.ts`, add a second test to the existing `describe`:

```ts
import {
  FALLBACK_ICON_KEY,
  ITEM_RULES,
  SCHOOL_ICONS,
  SPELL_NAME_RULES,
} from "./iconRules";
```

```ts
  test("every icon referenced by the heuristic is in CURATED_ICONS", () => {
    const referenced = new Set<string>();
    for (const rule of ITEM_RULES) referenced.add(rule.iconKey);
    for (const rule of SPELL_NAME_RULES) referenced.add(rule.iconKey);
    for (const icon of Object.values(SCHOOL_ICONS)) referenced.add(icon);
    referenced.add(FALLBACK_ICON_KEY);

    const curated = new Set(CURATED_ICONS as readonly string[]);
    const missing = [...referenced].filter((k) => !curated.has(k));
    expect(missing).toEqual([]);
  });
```

- [ ] **Step 2: Run, confirm pass**

Run: `npm test -- --run src/cards/curatedIcons.test.ts`

Expected: PASS — both tests green. (If anything fails, the curated set is missing an icon a rule references; add it to `CURATED_ICONS` and the corresponding import + entry in `resolveIcon.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/cards/curatedIcons.test.ts
git commit -m "test(icons): pin invariant — heuristic icons must be curated"
```

---

## Task 9: Add a kind toggle to `IconDebugView`

The debug view at `/debug/icons` currently only exposes item rules. Adding a kind toggle lets contributors simulate spell-card inputs and see both rule tables + the school map.

**Files:**
- Modify: `src/views/IconDebugView.tsx`
- Modify: `src/views/IconDebugView.module.css` (only if a small style is needed for the toggle; otherwise skip)
- Modify: `src/views/IconDebugView.test.tsx`

- [ ] **Step 1: Write failing tests for the new behavior**

Replace the existing test file content with:

```ts
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ITEM_RULES, SCHOOL_ICONS, SPELL_NAME_RULES } from "../cards/iconRules";
import { IconDebugView } from "./IconDebugView";

describe("<IconDebugView>", () => {
  test("default kind is item; rules table shows ITEM_RULES + fallback row", () => {
    render(<IconDebugView />);
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(1 + ITEM_RULES.length + 1);
  });

  test("simulator updates the matched-rule readout when name changes", async () => {
    render(<IconDebugView />);
    await userEvent.type(screen.getByLabelText(/name/i), "Trident");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/trident/i);
  });

  test("item simulator falls back when nothing matches", async () => {
    render(<IconDebugView />);
    await userEvent.type(screen.getByLabelText(/name/i), "Xyzzy");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/no match/i);
  });

  test("toggling to spell shows SPELL_NAME_RULES rows + a schools section", async () => {
    render(<IconDebugView />);
    const spellRadio = screen.getByRole("radio", { name: /spell/i });
    await userEvent.click(spellRadio);
    const rows = screen.getAllByRole("row");
    // header + SPELL_NAME_RULES + fallback row + (schools header + 8 school rows)
    expect(rows.length).toBe(
      1 + SPELL_NAME_RULES.length + 1 + 1 + Object.keys(SCHOOL_ICONS).length,
    );
  });

  test("spell simulator: 'Fireball' resolves to fire-flower", async () => {
    render(<IconDebugView />);
    await userEvent.click(screen.getByRole("radio", { name: /spell/i }));
    await userEvent.type(screen.getByLabelText(/name/i), "Fireball");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/fire-flower/i);
  });

  test("spell simulator: only school in headerTags resolves to the school icon", async () => {
    render(<IconDebugView />);
    await userEvent.click(screen.getByRole("radio", { name: /spell/i }));
    await userEvent.type(screen.getByLabelText(/header tags/i), "3rd-level evocation");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(SCHOOL_ICONS.evocation);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run src/views/IconDebugView.test.tsx`

Expected: FAIL — no kind toggle exists.

- [ ] **Step 3: Implement the toggle in `IconDebugView.tsx`**

Replace the current implementation with this. It uses native radio inputs (the existing file uses no `react-aria-components` for this view, so this is consistent with what's there):

```tsx
import { useId, useState } from "react";
import {
  FALLBACK_ICON_KEY,
  ITEM_RULES,
  SCHOOL_ICONS,
  SPELL_NAME_RULES,
} from "../cards/iconRules";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import styles from "./IconDebugView.module.css";

type Kind = "item" | "spell";

const SCHOOL_NAMES = Object.keys(SCHOOL_ICONS) as (keyof typeof SCHOOL_ICONS)[];

function pickRule(rules: typeof ITEM_RULES, name: string, headerTagsText: string) {
  const haystack = `${name} ${headerTagsText}`;
  let index = 0;
  for (const rule of rules) {
    if (rule.pattern.test(haystack)) return { rule, index };
    index++;
  }
  return null;
}

function pickSchool(headerTagsText: string) {
  const lower = headerTagsText.toLowerCase();
  for (const school of SCHOOL_NAMES) {
    if (new RegExp(`\\b${school}\\b`).test(lower)) {
      return { school, iconKey: SCHOOL_ICONS[school] };
    }
  }
  return null;
}

export function IconDebugView() {
  const [kind, setKind] = useState<Kind>("item");
  const [name, setName] = useState("");
  const [headerTagsText, setHeaderTagsText] = useState("");
  const idBase = useId();
  const ids = {
    name: `${idBase}-name`,
    headerTags: `${idBase}-headerTags`,
    kind: `${idBase}-kind`,
  };

  const rules = kind === "item" ? ITEM_RULES : SPELL_NAME_RULES;
  const matched = pickRule(rules, name, headerTagsText);
  const schoolMatch = kind === "spell" && !matched ? pickSchool(headerTagsText) : null;
  const fallbackToFallback = !matched && !schoolMatch;

  return (
    <div className={styles.page}>
      <h1>Icon picker — debug</h1>

      <section className={styles.simulator}>
        <h2>Simulator</h2>
        <fieldset className={styles.row}>
          <legend>Kind</legend>
          <label>
            <input
              type="radio"
              name={ids.kind}
              value="item"
              checked={kind === "item"}
              onChange={() => setKind("item")}
            />
            Item
          </label>
          <label>
            <input
              type="radio"
              name={ids.kind}
              value="spell"
              checked={kind === "spell"}
              onChange={() => setKind("spell")}
            />
            Spell
          </label>
        </fieldset>
        <label className={styles.row} htmlFor={ids.name}>
          <span>Name</span>
          <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.row} htmlFor={ids.headerTags}>
          <span>Header tags</span>
          <Input
            id={ids.headerTags}
            value={headerTagsText}
            onChange={(e) => setHeaderTagsText(e.target.value)}
          />
        </label>
        <div className={styles.result} data-testid="simulator-result">
          {matched ? (
            <>
              <IconPreview iconKey={matched.rule.iconKey} label={matched.rule.iconKey} size="md" />
              <div>
                rule #{matched.index}: <code>{matched.rule.pattern.source}</code> —{" "}
                {matched.rule.description} → <strong>{matched.rule.iconKey}</strong>
              </div>
            </>
          ) : schoolMatch ? (
            <>
              <IconPreview iconKey={schoolMatch.iconKey} label={schoolMatch.iconKey} size="md" />
              <div>
                school: <strong>{schoolMatch.school}</strong> → <strong>{schoolMatch.iconKey}</strong>
              </div>
            </>
          ) : (
            <>
              <IconPreview iconKey={FALLBACK_ICON_KEY} label={FALLBACK_ICON_KEY} size="md" />
              <div>
                No match → fallback (<strong>{FALLBACK_ICON_KEY}</strong>)
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <h2>{kind === "item" ? "Item rules" : "Spell name rules"}</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Pattern</th>
              <th>Description</th>
              <th>Icon</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, i) => (
              <tr key={`${rule.iconKey}-${i}`}>
                <td>{i}</td>
                <td className={styles.regex}>{rule.pattern.source}</td>
                <td>{rule.description}</td>
                <td>
                  <IconPreview iconKey={rule.iconKey} label={rule.iconKey} size="md" />
                </td>
              </tr>
            ))}
            <tr>
              <td>(fallback)</td>
              <td className={styles.regex}>—</td>
              <td>no match → fallback</td>
              <td>
                <IconPreview iconKey={FALLBACK_ICON_KEY} label={FALLBACK_ICON_KEY} size="md" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {kind === "spell" && (
        <section>
          <h2>Schools</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>School</th>
                <th>Icon</th>
              </tr>
            </thead>
            <tbody>
              {SCHOOL_NAMES.map((school) => (
                <tr key={school}>
                  <td>{school}</td>
                  <td>
                    <IconPreview
                      iconKey={SCHOOL_ICONS[school]}
                      label={SCHOOL_ICONS[school]}
                      size="md"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
```

Note: `(rule.iconKey)` is no longer unique as a `key` because the same icon key can appear in multiple spell rules (e.g. `evil-eyes` for both fear and detect). So the row keys use `${rule.iconKey}-${i}` instead.

If the radio buttons need any styling, add a small block to `src/views/IconDebugView.module.css`. If the existing `.row` class works, leave the CSS alone.

- [ ] **Step 4: Run the test, confirm pass**

Run: `npm test -- --run src/views/IconDebugView.test.tsx`

Expected: PASS — every test green.

- [ ] **Step 5: Smoke-check the page**

Ask before running: `npm run dev`. Visit `/debug/icons`. Confirm:
- Item radio is selected by default; the Item-rules table renders with all entries.
- Switching to Spell shows the Spell-name-rules table and a Schools table below it.
- Typing "Fireball" with the Spell radio selected shows `fire-flower`.
- Typing "3rd-level evocation" in header tags (name empty, Spell selected) shows `magic-swirl` (Evocation school fallback).
- Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/views/IconDebugView.tsx src/views/IconDebugView.test.tsx
git commit -m "feat(debug): add kind toggle + schools table to icon debug view"
```

(Include `src/views/IconDebugView.module.css` in `git add` only if you actually modified it.)

---

## Task 10: Final integration check

A short defense-in-depth pass: every test green, the build clean, and the picker visually plausible for spells.

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS across the project.

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: clean.

- [ ] **Step 3: Picker smoke check**

Ask before running: `npm run dev`. Open the editor for any spell card and click the icon picker. Confirm the Magical-effects, Spell-schools, and Healing/divine sections show the new icons coherently — no broken renders, sensible visual weight. Stop the dev server.

- [ ] **Step 4: Confirm the spell-icons branch state**

```bash
git log --oneline main..HEAD
```

Expected: a clean sequence of commits — spec, factory, curated-set expansion, rename, school detection, name rules, dispatch, mapper hardcode removal, invariant test, debug view kind toggle. No "TODO" or "WIP" commits.

If everything checks out, the work is ready for the user to push and open a PR (per `CLAUDE.md`, the executor does not push or create PRs without explicit instruction).
