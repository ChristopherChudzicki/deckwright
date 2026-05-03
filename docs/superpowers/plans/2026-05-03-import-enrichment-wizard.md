# Card Metadata + Import Enrichment Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt a canonical tag order on item cards (header = `[type, damage/AC, attunement]`; footer = `[rarity, cost, weight]`), and turn the magic-item importer into a two-step wizard whose optional second step pulls structured damage/AC/weight from the corresponding mundane equipment record.

**Architecture:** The dnd5eapi splits "magic items" and "equipment" across two endpoints. Magic items expose `equipment_category`, `rarity`, `attunement` (2024 only — 2014 is parsed from prose), and `desc`, but no structured damage/AC/cost/weight. Equipment exposes `damage`, `armor_class`, `weight`, `cost`. We layer a second import step on top of the existing magic-items pick: classify the magic item by `equipment_category` and the parenthetical in `desc[0]`, then either skip (wands, wondrous items, …), pre-filter the equipment picker (templates like Flame Tongue's "any sword"), or auto-select the obvious base (specific items like Sun Blade's "longsword"). User can override or skip in any case. Cost is **never** auto-filled — a mundane longsword's 15 gp is misleading for Sun Blade. Weight, damage, and AC are filled because they genuinely transfer.

**Tech Stack:** React 19 + TypeScript, react-aria-components, TanStack Query, Vitest + RTL + user-event, MSW, Fishery + faker.

**Reference background:** Spec discussion in conversation on 2026-05-03 (no separate spec doc). Confirmed against the live API for Flame Tongue (template), Sun Blade / Holy Avenger / Dwarven Thrower (specific weapons), Dwarven Plate (specific armor), and the corresponding `/equipment` records (longsword, plate-armor, trident).

**Out of scope (explicit):**

- Spell import (separate plan; wizard shell should remain extensible but we won't add the kind selector here).
- Mundane-item primary import (likewise).
- Auto-fill of cost.
- Free-text damage parsing for magic riders (e.g. Flame Tongue's "+2d6 fire", Sun Blade's "+1d8 vs undead"). User edits if they want them.

---

## Tag layout & canonical order

After this plan, a freshly imported magic item produces tags in this order:

| Slot | Source | Example (Sun Blade with longsword enrichment) |
|---|---|---|
| header[0] | `equipment_category.name` | `Weapon` |
| header[1] | enrichment damage (if weapon) | `1d8 slashing` |
| header[1] | enrichment AC (if armor) | `AC 18` |
| header[2] | attunement | `requires attunement` |
| footer[0] | `rarity.name` (lowercased) | `rare` |
| footer[1] | enrichment weight | `3 lb` |

Note: rarity **moves from header → footer** (current code puts it in header). The display separator (`·`) and rendering already exist in `Card.tsx`.

For non-enrichable magic items (wand, wondrous item, potion, ring, …): header = `[type, attunement?]`; footer = `[rarity]`. No equipment lookup.

For "any X" templates (`Weapon (any sword)`, `Weapon (Any Melee Weapon)`): the picker opens with the equipment list pre-filtered to the hint, no auto-pick, user chooses or skips.

For specific items (`Weapon (longsword)`, `Armor (plate)`): the picker opens with a single equipment item auto-selected (when exactly one match), still user-overridable; pressing Skip lands the card without enrichment.

---

## File map

**Create:**

- `src/api/endpoints/equipment.ts` — `fetchEquipmentIndex(ruleset)`, `fetchEquipmentDetail(ruleset, slug)`, ruleset-tagged types
- `src/api/endpoints/equipment.test.ts` — endpoint tests via MSW
- `src/api/mappers/equipment.ts` — pure helpers: `equipmentToHeaderInsert`, `equipmentToFooterInsert`
- `src/api/mappers/equipment.test.ts`
- `src/api/mappers/baseHint.ts` — `parseBaseHint(desc0)` → `{ kind: "specific" | "any" | "none", hint: string }`
- `src/api/mappers/baseHint.test.ts`
- `src/views/EnrichmentStep.tsx` — step-2 equipment picker (filtered list, auto-selection, Skip / Confirm)
- `src/views/EnrichmentStep.module.css`
- `src/views/EnrichmentStep.test.tsx`

**Modify:**

- `src/api/mappers/magicItems.ts` — rarity moves from header to footer; export `magicItemDetailToCard(detail, enrichment?)`; `enrichment` splices damage/AC into header position 1 and weight into footer position 1
- `src/api/mappers/magicItems.test.ts` — assertions updated for new layout; add enrichment cases (with weapon, with armor, no enrichment)
- `src/api/hooks.ts` — add `useEquipmentIndex(ruleset)`
- `src/views/BrowseApiModal.tsx` — refactored into a two-step state machine; step 1 unchanged in behavior except that picking now branches into "save & close" vs "advance to enrichment"
- `src/views/BrowseApiModal.test.tsx` — add wizard flow tests (template path, specific path, skip path, non-enrichable path)
- `src/cards/ItemEditor.tsx` — add help text under each TagInput field
- `src/cards/ItemEditor.test.tsx` — assert help text is present
- `src/test/msw.ts` — add `/api/{ruleset}/equipment` index + detail handlers (+ a couple of fixture entries: `longsword`, `plate-armor`)
- `src/api/factories.ts` — add `equipmentDetailFactory` (or similar) for tests if the existing factory style benefits

**No change required:**

- `src/cards/Card.tsx`, `src/cards/types.ts` — `headerTags`/`footerTags` already render correctly; the canonical order is enforced by the import path, not the type.

---

## Order of work

Each task lands as its own commit. The repo compiles and tests pass green at every task boundary.

1. **Tag layout shift + form help text** — move rarity from header to footer in the magic-item mapper; update existing tests; add help text in ItemEditor. Small, no new files.
2. **`baseHint` parser** — pure function, fully tested, no UI consumers yet.
3. **Equipment endpoint** — fetch + types + MSW handlers + endpoint tests.
4. **Equipment tag mappers** — pure helpers for header (damage / AC) and footer (weight) insertions.
5. **`magicItemDetailToCard` accepts enrichment** — extend signature, splice tags at canonical positions.
6. **`useEquipmentIndex` hook** — TanStack Query wrapper.
7. **`EnrichmentStep` component** — equipment picker with auto-select, search, Skip / Confirm.
8. **`BrowseApiModal` step machine** — refactor to two-step flow; integrate `EnrichmentStep`.
9. **Verification** — type-check, full test run, manual exercise of each branch.

Tasks 2, 3, 4 are independent; they could be done in parallel by separate workers. Task 5 depends on 4. Task 7 depends on 2, 3, 6. Task 8 depends on 5 and 7.

---

## Conventions reminder

Repo CLAUDE.md and user CLAUDE.md set norms that apply throughout:

- Tests: prefer `getByRole`. Factories pass no values they don't assert on.
- Code: default no comments; only when WHY is non-obvious.
- React Aria primitives expose accurate roles — don't add `data-testid` when a role is available.
- Don't push or open PRs without explicit instruction.
- `npm test`, `npm run dev`, `npm run build`, `npm run typecheck` are pre-approved.

---

## Task 1: Move rarity to footer + add ItemEditor help text

**Files:**

- Modify: `src/api/mappers/magicItems.ts`
- Modify: `src/api/mappers/magicItems.test.ts`
- Modify: `src/cards/ItemEditor.tsx`
- Modify: `src/cards/ItemEditor.test.tsx`

- [ ] **Step 1: Update mapper tests for the new layout**

In `src/api/mappers/magicItems.test.ts`, change assertions so that rarity is in `footerTags`, not `headerTags`.

```ts
// 2014 magic item without attunement
expect(card.headerTags).toEqual(["Weapon"]);
expect(card.footerTags).toEqual(["rare"]);

// 2014 magic item with attunement (parsed from desc[0])
expect(card.headerTags).toEqual(["Weapon", "requires attunement"]);
expect(card.footerTags).toEqual(["rare"]);

// 2024 magic item with attunement boolean
expect(card.headerTags).toEqual(["Weapon", "requires attunement"]);
expect(card.footerTags).toEqual(["rare"]);
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- src/api/mappers/magicItems.test.ts
```

Expected: failures showing rarity still in `headerTags`.

- [ ] **Step 3: Update mapper to put rarity in footer**

In `src/api/mappers/magicItems.ts`, replace the existing `composeHeaderTags` with two helpers:

```ts
const composeHeaderTags = (category: string, attunement: boolean): string[] => {
  const tags = [category];
  if (attunement) tags.push("requires attunement");
  return tags;
};

const composeFooterTags = (rarity: string): string[] => [rarity.toLowerCase()];
```

Update both `if (detail.ruleset === "2024")` and the 2014 fallback:

```ts
return {
  ...common,
  headerTags: composeHeaderTags(
    detail.equipment_category.name,
    detail.attunement,
  ),
  body: detail.desc,
  footerTags: composeFooterTags(detail.rarity.name),
};
```

```ts
return {
  ...common,
  headerTags: composeHeaderTags(
    detail.equipment_category.name,
    detectAttunement2014(detail.desc[0]),
  ),
  body: detail.desc.join("\n\n"),
  footerTags: composeFooterTags(detail.rarity.name),
};
```

- [ ] **Step 4: Run mapper tests**

```
npm test -- src/api/mappers/magicItems.test.ts
```

Expected: pass.

- [ ] **Step 5: Add a failing test for ItemEditor help text**

In `src/cards/ItemEditor.test.tsx`, add a test that the help text is rendered:

```ts
it("renders header tag help text", () => {
  const card = makeItemCard();
  render(<ItemEditor card={card} onChange={vi.fn()} />);
  expect(
    screen.getByText(/type first, then damage\/AC, then attunement/i),
  ).toBeInTheDocument();
});

it("renders footer tag help text", () => {
  const card = makeItemCard();
  render(<ItemEditor card={card} onChange={vi.fn()} />);
  expect(
    screen.getByText(/rarity first, then cost, then weight/i),
  ).toBeInTheDocument();
});
```

(Use whatever item-card factory already exists — search `src/cards/factories.ts`. If the factory is named differently, swap.)

- [ ] **Step 6: Run new tests; confirm they fail**

```
npm test -- src/cards/ItemEditor.test.tsx
```

Expected: failures — text not found.

- [ ] **Step 7: Add help text to ItemEditor**

In `src/cards/ItemEditor.tsx`, add a `<span className={styles.help}>` under each TagInput:

```tsx
<div className={styles.field}>
  <span className={styles.label} id={ids.headerTagsLabel}>
    Header tags
  </span>
  <TagInput
    id={ids.headerTags}
    aria-labelledby={ids.headerTagsLabel}
    value={card.headerTags}
    onChange={handleHeaderTagsChange}
    placeholder="Type and press Enter — e.g. Weapon, 1d6 piercing, requires attunement"
  />
  <span className={styles.help}>
    Type first, then damage/AC, then attunement.
  </span>
</div>
```

```tsx
<div className={styles.field}>
  <span className={styles.label} id={ids.footerTagsLabel}>
    Footer tags
  </span>
  <TagInput
    id={ids.footerTags}
    aria-labelledby={ids.footerTagsLabel}
    value={card.footerTags}
    onChange={handleFooterTagsChange}
    placeholder="Type and press Enter — e.g. rare, 100 gp, 10 lb"
  />
  <span className={styles.help}>
    Rarity first, then cost, then weight.
  </span>
</div>
```

Update placeholders as shown above (the old "rare" was technically header; new placeholders match the canonical layout).

Drop the `(type, rarity, …)` / `(cost, weight, …)` parenthetical hints in the labels since the help text now covers that more precisely.

- [ ] **Step 8: Add `.help` style**

In `src/cards/ItemEditor.module.css`, add a `.help` class. Match the existing `.iconHint` style — same intent (small, muted helper text):

```css
.help {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}
```

(Confirm the actual token names in `src/index.css` and adjust if the project uses different names.)

- [ ] **Step 9: Run tests**

```
npm test -- src/cards/ItemEditor.test.tsx
npm test -- src/api/mappers/magicItems.test.ts
```

Expected: all pass.

- [ ] **Step 10: Run full suite and typecheck**

```
npm test
npm run typecheck
```

Expected: green.

- [ ] **Step 11: Commit**

```
git add src/api/mappers/magicItems.ts src/api/mappers/magicItems.test.ts \
        src/cards/ItemEditor.tsx src/cards/ItemEditor.module.css src/cards/ItemEditor.test.tsx
git commit -m "feat: canonical tag order — rarity in footer, ItemEditor help text"
```

---

## Task 2: `baseHint` parser

**Files:**

- Create: `src/api/mappers/baseHint.ts`
- Create: `src/api/mappers/baseHint.test.ts`

**Purpose:** Given the first paragraph of a magic-item description, classify it as a "specific" base, an "any X" template, or no signal. The hint is later used to filter / auto-select an equipment record.

**Inputs observed in API:**

- `"Weapon (any sword), legendary (requires attunement by a paladin)"` → `{ kind: "any", hint: "sword" }`
- `"Weapon (longsword), rare (requires attunement)"` → `{ kind: "specific", hint: "longsword" }`
- `"Weapon (warhammer), very rare (requires attunement by a dwarf)"` → `{ kind: "specific", hint: "warhammer" }`
- `"Armor (plate), very rare"` → `{ kind: "specific", hint: "plate" }`
- `"Weapon (any sword), rare (requires attunement)"` (Flame Tongue 2014) → `{ kind: "any", hint: "sword" }`
- `"Weapon (Any Melee Weapon)"` (Flame Tongue 2024 — capitalized) → `{ kind: "any", hint: "melee weapon" }`
- `"Wondrous item, rare (requires attunement by a sorcerer, warlock, or wizard)"` → `{ kind: "none", hint: "" }`

- [ ] **Step 1: Write failing tests**

```ts
// src/api/mappers/baseHint.test.ts
import { describe, it, expect } from "vitest";
import { parseBaseHint } from "./baseHint";

describe("parseBaseHint", () => {
  it("identifies a specific weapon base", () => {
    expect(parseBaseHint("Weapon (longsword), rare (requires attunement)"))
      .toEqual({ kind: "specific", hint: "longsword" });
  });

  it("identifies an 'any X' weapon template", () => {
    expect(parseBaseHint("Weapon (any sword), legendary (requires attunement by a paladin)"))
      .toEqual({ kind: "any", hint: "sword" });
  });

  it("identifies a specific armor base", () => {
    expect(parseBaseHint("Armor (plate), very rare"))
      .toEqual({ kind: "specific", hint: "plate" });
  });

  it("normalizes mixed-case 2024-style hints", () => {
    expect(parseBaseHint("Weapon (Any Melee Weapon)"))
      .toEqual({ kind: "any", hint: "melee weapon" });
    expect(parseBaseHint("Weapon (Longsword), Rare"))
      .toEqual({ kind: "specific", hint: "longsword" });
  });

  it("returns 'none' for non-weapon/armor descriptions", () => {
    expect(parseBaseHint("Wondrous item, rare (requires attunement)"))
      .toEqual({ kind: "none", hint: "" });
    expect(parseBaseHint("Wand, very rare"))
      .toEqual({ kind: "none", hint: "" });
  });

  it("returns 'none' for empty / undefined input", () => {
    expect(parseBaseHint(undefined)).toEqual({ kind: "none", hint: "" });
    expect(parseBaseHint("")).toEqual({ kind: "none", hint: "" });
  });
});
```

- [ ] **Step 2: Run tests; confirm they fail**

```
npm test -- src/api/mappers/baseHint.test.ts
```

Expected: module-not-found / function-not-defined.

- [ ] **Step 3: Implement parser**

```ts
// src/api/mappers/baseHint.ts
export type BaseHint =
  | { kind: "specific"; hint: string }
  | { kind: "any"; hint: string }
  | { kind: "none"; hint: "" };

const RE = /^(?:Weapon|Armor)\s*\(([^)]+)\)/i;

export const parseBaseHint = (desc0: string | undefined): BaseHint => {
  if (!desc0) return { kind: "none", hint: "" };
  const match = RE.exec(desc0.trim());
  if (!match) return { kind: "none", hint: "" };
  const inner = match[1].trim().toLowerCase();
  if (inner.startsWith("any ")) {
    return { kind: "any", hint: inner.slice(4).trim() };
  }
  return { kind: "specific", hint: inner };
};
```

- [ ] **Step 4: Run tests**

```
npm test -- src/api/mappers/baseHint.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```
git add src/api/mappers/baseHint.ts src/api/mappers/baseHint.test.ts
git commit -m "feat: parseBaseHint — classify magic-item base from desc[0]"
```

---

## Task 3: Equipment endpoint + MSW

**Files:**

- Create: `src/api/endpoints/equipment.ts`
- Create: `src/api/endpoints/equipment.test.ts`
- Modify: `src/test/msw.ts`

**Note on shape:** 2014 equipment uses `equipment_category` (single object); 2024 uses `equipment_categories` (array). Our consumer only needs the fields that ARE shared: `damage`, `armor_class`, `weight`, `cost`, `name`, `index`. Type cleanly to those.

`armor_class` shape varies: 2014 returns `{ base, dex_bonus, max_bonus? }`; 2024 returns the same in practice for plate/half-plate. Type as a union if needed; for our use we only read `base`.

`damage` shape: `{ damage_dice: string, damage_type: { name: string } }`. Both rulesets.

- [ ] **Step 1: Write failing endpoint tests**

```ts
// src/api/endpoints/equipment.test.ts
import { describe, it, expect } from "vitest";
import { fetchEquipmentIndex, fetchEquipmentDetail } from "./equipment";

describe("equipment endpoints", () => {
  it("fetches index for 2014", async () => {
    const idx = await fetchEquipmentIndex("2014");
    expect(idx.results.length).toBeGreaterThan(0);
    expect(idx.results.find((e) => e.index === "longsword")).toBeDefined();
  });

  it("fetches a 2014 weapon detail", async () => {
    const detail = await fetchEquipmentDetail("2014", "longsword");
    expect(detail.name).toBe("Longsword");
    expect(detail.damage?.damage_dice).toBe("1d8");
    expect(detail.damage?.damage_type.name).toBe("Slashing");
    expect(detail.weight).toBe(3);
  });

  it("fetches a 2014 armor detail", async () => {
    const detail = await fetchEquipmentDetail("2014", "plate-armor");
    expect(detail.name).toBe("Plate Armor");
    expect(detail.armor_class?.base).toBe(18);
    expect(detail.weight).toBe(65);
  });
});
```

- [ ] **Step 2: Add MSW handlers + fixtures**

In `src/test/msw.ts`, add handlers mirroring the existing magic-item ones. Put two fixtures inline (keep tests self-contained) — `longsword`, `plate-armor` for 2014.

```ts
// inside the existing handlers array
http.get("https://www.dnd5eapi.co/api/2014/equipment", () =>
  HttpResponse.json({
    count: 2,
    results: [
      { index: "longsword", name: "Longsword", url: "/api/2014/equipment/longsword" },
      { index: "plate-armor", name: "Plate Armor", url: "/api/2014/equipment/plate-armor" },
    ],
  }),
),
http.get("https://www.dnd5eapi.co/api/2014/equipment/longsword", () =>
  HttpResponse.json({
    index: "longsword",
    name: "Longsword",
    equipment_category: { index: "weapon", name: "Weapon", url: "" },
    weapon_category: "Martial",
    weapon_range: "Melee",
    cost: { quantity: 15, unit: "gp" },
    damage: { damage_dice: "1d8", damage_type: { index: "slashing", name: "Slashing", url: "" } },
    weight: 3,
  }),
),
http.get("https://www.dnd5eapi.co/api/2014/equipment/plate-armor", () =>
  HttpResponse.json({
    index: "plate-armor",
    name: "Plate Armor",
    equipment_category: { index: "armor", name: "Armor", url: "" },
    armor_category: "Heavy",
    armor_class: { base: 18, dex_bonus: false },
    str_minimum: 15,
    stealth_disadvantage: true,
    weight: 65,
    cost: { quantity: 1500, unit: "gp" },
  }),
),
```

(If `src/test/msw.ts` exposes its handler list differently, follow the existing pattern. Look at the magic-items handlers for a template.)

- [ ] **Step 3: Run tests; confirm they fail**

```
npm test -- src/api/endpoints/equipment.test.ts
```

Expected: module-not-found.

- [ ] **Step 4: Implement endpoint module**

```ts
// src/api/endpoints/equipment.ts
import { apiGet } from "../apiClient";
import type { Ruleset } from "./magicItems";

export type EquipmentIndexEntry = {
  index: string;
  name: string;
  url: string;
};

export type EquipmentIndex = {
  count: number;
  results: EquipmentIndexEntry[];
};

export type EquipmentDamage = {
  damage_dice: string;
  damage_type: { name: string };
};

export type EquipmentArmorClass = {
  base: number;
  dex_bonus?: boolean;
  max_bonus?: number;
};

export type EquipmentDetail = {
  index: string;
  name: string;
  damage?: EquipmentDamage;
  armor_class?: EquipmentArmorClass;
  weight?: number;
  cost?: { quantity: number; unit: string };
};

export const fetchEquipmentIndex = (ruleset: Ruleset): Promise<EquipmentIndex> =>
  apiGet<EquipmentIndex>(`/api/${ruleset}/equipment`);

export const fetchEquipmentDetail = (
  ruleset: Ruleset,
  slug: string,
): Promise<EquipmentDetail> =>
  apiGet<EquipmentDetail>(`/api/${ruleset}/equipment/${slug}`);
```

- [ ] **Step 5: Run tests**

```
npm test -- src/api/endpoints/equipment.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```
git add src/api/endpoints/equipment.ts src/api/endpoints/equipment.test.ts src/test/msw.ts
git commit -m "feat: equipment endpoint (index + detail) for both rulesets"
```

---

## Task 4: Equipment tag mappers

**Files:**

- Create: `src/api/mappers/equipment.ts`
- Create: `src/api/mappers/equipment.test.ts`

**Purpose:** Pure functions producing the strings to splice into header / footer when enriching a magic item.

- [ ] **Step 1: Write failing tests**

```ts
// src/api/mappers/equipment.test.ts
import { describe, it, expect } from "vitest";
import { equipmentToHeaderInsert, equipmentToFooterInsert } from "./equipment";
import type { EquipmentDetail } from "../endpoints/equipment";

const longsword: EquipmentDetail = {
  index: "longsword",
  name: "Longsword",
  damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
  weight: 3,
};

const plateArmor: EquipmentDetail = {
  index: "plate-armor",
  name: "Plate Armor",
  armor_class: { base: 18, dex_bonus: false },
  weight: 65,
};

const noShape: EquipmentDetail = { index: "abacus", name: "Abacus" };

describe("equipmentToHeaderInsert", () => {
  it("formats weapon damage", () => {
    expect(equipmentToHeaderInsert(longsword)).toBe("1d8 slashing");
  });

  it("formats armor AC", () => {
    expect(equipmentToHeaderInsert(plateArmor)).toBe("AC 18");
  });

  it("returns null for items with neither damage nor AC", () => {
    expect(equipmentToHeaderInsert(noShape)).toBeNull();
  });
});

describe("equipmentToFooterInsert", () => {
  it("formats weight in lb", () => {
    expect(equipmentToFooterInsert(longsword)).toBe("3 lb");
    expect(equipmentToFooterInsert(plateArmor)).toBe("65 lb");
  });

  it("returns null when weight is missing or zero", () => {
    expect(equipmentToFooterInsert(noShape)).toBeNull();
    expect(equipmentToFooterInsert({ ...longsword, weight: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests; confirm they fail**

```
npm test -- src/api/mappers/equipment.test.ts
```

- [ ] **Step 3: Implement helpers**

```ts
// src/api/mappers/equipment.ts
import type { EquipmentDetail } from "../endpoints/equipment";

export const equipmentToHeaderInsert = (e: EquipmentDetail): string | null => {
  if (e.damage) {
    return `${e.damage.damage_dice} ${e.damage.damage_type.name.toLowerCase()}`;
  }
  if (e.armor_class) {
    return `AC ${e.armor_class.base}`;
  }
  return null;
};

export const equipmentToFooterInsert = (e: EquipmentDetail): string | null => {
  if (!e.weight) return null;
  return `${e.weight} lb`;
};
```

- [ ] **Step 4: Run tests**

Expected: pass.

- [ ] **Step 5: Commit**

```
git add src/api/mappers/equipment.ts src/api/mappers/equipment.test.ts
git commit -m "feat: equipment tag mappers (damage/AC header, weight footer)"
```

---

## Task 5: `magicItemDetailToCard` accepts enrichment

**Files:**

- Modify: `src/api/mappers/magicItems.ts`
- Modify: `src/api/mappers/magicItems.test.ts`

**Goal:** When called with a second argument (the resolved equipment detail), splice damage/AC into header position 1 (between type and attunement) and weight into footer position 1 (between rarity and any future cost).

- [ ] **Step 1: Add failing tests**

```ts
// in src/api/mappers/magicItems.test.ts
import type { EquipmentDetail } from "../endpoints/equipment";

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

it("splices weapon damage into header and weight into footer", () => {
  const card = magicItemDetailToCard(sunBlade2014Detail, longsword);
  expect(card.headerTags).toEqual(["Weapon", "1d8 slashing", "requires attunement"]);
  expect(card.footerTags).toEqual(["rare", "3 lb"]);
});

it("splices armor AC into header and weight into footer", () => {
  const card = magicItemDetailToCard(dwarvenPlate2014Detail, plate);
  expect(card.headerTags).toEqual(["Armor", "AC 18"]);
  expect(card.footerTags).toEqual(["very rare", "65 lb"]);
});

it("omits header insert when equipment has neither damage nor AC", () => {
  const card = magicItemDetailToCard(sunBlade2014Detail, {
    index: "x", name: "X",
  });
  expect(card.headerTags).toEqual(["Weapon", "requires attunement"]);
  expect(card.footerTags).toEqual(["rare"]);
});

it("works without enrichment (existing behavior)", () => {
  const card = magicItemDetailToCard(sunBlade2014Detail);
  expect(card.headerTags).toEqual(["Weapon", "requires attunement"]);
  expect(card.footerTags).toEqual(["rare"]);
});
```

(`sunBlade2014Detail` and `dwarvenPlate2014Detail` are local test fixtures — define them at the top of the test file. The existing test file already has fixtures for the basic cases; mirror that style.)

- [ ] **Step 2: Run tests; confirm they fail**

```
npm test -- src/api/mappers/magicItems.test.ts
```

- [ ] **Step 3: Refactor mapper to accept enrichment**

```ts
// src/api/mappers/magicItems.ts
import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { EquipmentDetail } from "../endpoints/equipment";
import {
  equipmentToFooterInsert,
  equipmentToHeaderInsert,
} from "./equipment";
import type { MagicItemDetail } from "../endpoints/magicItems";

const IMAGE_BASE = "https://www.dnd5eapi.co";

const composeHeaderTags = (
  category: string,
  attunement: boolean,
  enrichment: EquipmentDetail | undefined,
): string[] => {
  const tags = [category];
  const insert = enrichment ? equipmentToHeaderInsert(enrichment) : null;
  if (insert) tags.push(insert);
  if (attunement) tags.push("requires attunement");
  return tags;
};

const composeFooterTags = (
  rarity: string,
  enrichment: EquipmentDetail | undefined,
): string[] => {
  const tags = [rarity.toLowerCase()];
  const insert = enrichment ? equipmentToFooterInsert(enrichment) : null;
  if (insert) tags.push(insert);
  return tags;
};

const detectAttunement2014 = (firstLine: string | undefined): boolean =>
  firstLine !== undefined && /requires attunement/i.test(firstLine);

export const magicItemDetailToCard = (
  detail: MagicItemDetail,
  enrichment?: EquipmentDetail,
): ItemCard => {
  const now = nowIso();
  const common = {
    id: newId(),
    kind: "item" as const,
    name: detail.name,
    source: "api" as const,
    apiRef: {
      system: "dnd5eapi" as const,
      slug: detail.index,
      ruleset: detail.ruleset,
    },
    imageUrl: detail.image ? `${IMAGE_BASE}${detail.image}` : undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (detail.ruleset === "2024") {
    return {
      ...common,
      headerTags: composeHeaderTags(
        detail.equipment_category.name,
        detail.attunement,
        enrichment,
      ),
      body: detail.desc,
      footerTags: composeFooterTags(detail.rarity.name, enrichment),
    };
  }

  return {
    ...common,
    headerTags: composeHeaderTags(
      detail.equipment_category.name,
      detectAttunement2014(detail.desc[0]),
      enrichment,
    ),
    body: detail.desc.join("\n\n"),
    footerTags: composeFooterTags(detail.rarity.name, enrichment),
  };
};
```

- [ ] **Step 4: Run tests**

```
npm test -- src/api/mappers/magicItems.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```
git add src/api/mappers/magicItems.ts src/api/mappers/magicItems.test.ts
git commit -m "feat: magicItemDetailToCard accepts optional equipment enrichment"
```

---

## Task 6: `useEquipmentIndex` hook

**Files:**

- Modify: `src/api/hooks.ts`

- [ ] **Step 1: Add the hook**

```ts
// src/api/hooks.ts — append
import {
  fetchEquipmentDetail,
  fetchEquipmentIndex,
} from "./endpoints/equipment";

export const useEquipmentIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["equipment", ruleset, "index"],
    queryFn: () => fetchEquipmentIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

export const useEquipmentDetail = (ruleset: Ruleset, slug: string | null) =>
  useQuery({
    enabled: slug !== null,
    queryKey: ["equipment", ruleset, "detail", slug],
    queryFn: () => fetchEquipmentDetail(ruleset, slug as string),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });
```

(`useEquipmentDetail` is added speculatively for the picker but is not strictly required — the picker fetches detail imperatively via `queryClient.fetchQuery` mirroring `BrowseApiModal.handlePick`. Keep it for symmetry; small surface.)

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: green.

- [ ] **Step 3: Commit**

```
git add src/api/hooks.ts
git commit -m "feat: useEquipmentIndex / useEquipmentDetail hooks"
```

---

## Task 7: `EnrichmentStep` component

**Files:**

- Create: `src/views/EnrichmentStep.tsx`
- Create: `src/views/EnrichmentStep.module.css`
- Create: `src/views/EnrichmentStep.test.tsx`

**Behavior:**

- Receives: `ruleset`, `categoryFilter` (`"weapon" | "armor"`), `hint`: `BaseHint` (from Task 2).
- Renders the equipment index, filtered:
  - Always filtered to weapons or armor by name match against the equipment category. Easiest: scope by name — the index doesn't expose category. **Better**: keep two pre-known sub-lists per ruleset by reading `equipment_category` from each fetched detail. Since the index endpoint doesn't expose category at all, we approximate via the magic-item's category and use that to label the picker; the equipment list is filtered by `hint` (substring match, lowercased) and not by category. This is a known limitation: a user could pick `Plate Armor` while looking at a magic weapon, which would still produce sensible output (AC tag instead of damage). We'll live with it; the alternative (fetching every equipment detail upfront) is too expensive.
- Pre-filters by `hint.hint` (substring on name, lowercased) when present.
- Auto-selects exactly one item if `hint.kind === "specific"` AND there is exactly one filtered match.
- Search input lets user override the filter and pick freely.
- Footer: **Skip** (saves card without enrichment), **Confirm** (saves card with selected equipment as enrichment). Confirm is disabled when no selection.

The component does NOT save the card itself — it calls `onConfirm(detail | null)` where `null` means "skip". The parent (`BrowseApiModal`) does the save.

- [ ] **Step 1: Write failing tests**

```tsx
// src/views/EnrichmentStep.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EnrichmentStep } from "./EnrichmentStep";

const renderWithClient = (ui: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

describe("EnrichmentStep", () => {
  it("auto-selects the single match for a specific hint", async () => {
    const onConfirm = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "specific", hint: "longsword" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    // wait for index load
    await screen.findByRole("button", { name: /Longsword/ });
    expect(screen.getByRole("button", { name: /Longsword/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ index: "longsword" });
  });

  it("does not auto-select for an 'any X' template; allows skip", async () => {
    const onConfirm = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "any", hint: "sword" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: /Longsword/ });
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("lets the user override the auto-selection", async () => {
    const onConfirm = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "specific", hint: "longsword" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: /Longsword/ });
    await userEvent.click(screen.getByRole("button", { name: /Plate Armor/ }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ index: "plate-armor" });
  });
});
```

- [ ] **Step 2: Run tests; confirm they fail**

```
npm test -- src/views/EnrichmentStep.test.tsx
```

Expected: module-not-found.

- [ ] **Step 3: Implement EnrichmentStep**

```tsx
// src/views/EnrichmentStep.tsx
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import {
  fetchEquipmentDetail,
  type EquipmentDetail,
  type EquipmentIndexEntry,
} from "../api/endpoints/equipment";
import type { Ruleset } from "../api/endpoints/magicItems";
import { useEquipmentIndex } from "../api/hooks";
import type { BaseHint } from "../api/mappers/baseHint";
import { Button } from "../lib/ui/Button";
import { Input } from "../lib/ui/Input";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./EnrichmentStep.module.css";

type Props = {
  ruleset: Ruleset;
  hint: BaseHint;
  onConfirm: (enrichment: EquipmentDetail | null) => void;
  onCancel: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function EnrichmentStep({ ruleset, hint, onConfirm, onCancel }: Props) {
  const index = useEquipmentIndex(ruleset);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(hint.hint);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered: EquipmentIndexEntry[] = useMemo(() => {
    const all = index.data?.results ?? [];
    const q = query.trim().toLowerCase();
    if (q === "") return all;
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [index.data, query]);

  // Auto-select for specific hint with exactly one match
  useEffect(() => {
    if (selectedSlug !== null) return;
    if (hint.kind !== "specific") return;
    if (filtered.length !== 1) return;
    setSelectedSlug(filtered[0].index);
  }, [filtered, hint.kind, selectedSlug]);

  const handleConfirm = async () => {
    if (selectedSlug === null) return;
    setResolving(true);
    setError(null);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ["equipment", ruleset, "detail", selectedSlug],
        queryFn: () => fetchEquipmentDetail(ruleset, selectedSlug),
        staleTime: DAY_MS,
      });
      onConfirm(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this item.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <>
      <div className={styles.searchRow}>
        <TextField aria-label="Search equipment" className={styles.searchField}>
          <Input
            type="search"
            placeholder="Search equipment…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </TextField>
      </div>

      <div className={styles.results}>
        {index.isLoading && <LoadingState />}
        {index.isError && <div className={styles.state}>Couldn't load equipment.</div>}
        {index.isSuccess && filtered.length === 0 && (
          <div className={styles.state}>No equipment matches your search.</div>
        )}
        {error && <div className={styles.state} role="alert">{error}</div>}
        {index.isSuccess &&
          filtered.map((entry) => (
            <button
              key={entry.index}
              type="button"
              className={styles.row}
              aria-pressed={selectedSlug === entry.index}
              onClick={() => setSelectedSlug(entry.index)}
            >
              <span className={styles.rowName}>{entry.name}</span>
            </button>
          ))}
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onPress={onCancel}>Back</Button>
        <Button variant="secondary" onPress={() => onConfirm(null)}>Skip</Button>
        <Button onPress={handleConfirm} isDisabled={selectedSlug === null || resolving}>
          {resolving ? "Loading…" : "Confirm"}
        </Button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add CSS module**

Mirror the styles in `BrowseApiModal.module.css` so visual parity holds. Look up the existing class names and copy the relevant ones (`.searchRow`, `.searchField`, `.results`, `.row`, `.rowName`, `.state`, `.actions`). Add an `aria-pressed="true"` selector on `.row` for the selected state.

```css
/* src/views/EnrichmentStep.module.css */
.searchRow { /* same as BrowseApiModal.module.css .searchRow */ }
.searchField { /* … */ }
.results { /* … */ }
.row { /* … */ }
.row[aria-pressed="true"] {
  background: var(--color-surface-selected);
}
.rowName { /* … */ }
.state { /* … */ }
.actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  padding: var(--space-3);
}
```

(Confirm token names against `src/index.css`. The point is: don't invent new visual style — reuse the picker visuals.)

- [ ] **Step 5: Run tests**

```
npm test -- src/views/EnrichmentStep.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```
git add src/views/EnrichmentStep.tsx src/views/EnrichmentStep.module.css src/views/EnrichmentStep.test.tsx
git commit -m "feat: EnrichmentStep — equipment picker with auto-select + skip"
```

---

## Task 8: `BrowseApiModal` step machine

**Files:**

- Modify: `src/views/BrowseApiModal.tsx`
- Modify: `src/views/BrowseApiModal.test.tsx`

**Refactor outline:**

The current `BrowseApiModal` couples the picker UI with the save side-effect inside `handlePick`. We split that into:

1. **Step state machine** at the top level of `BrowseApiModal`. States: `{ step: "pick" } | { step: "enrich"; magicDetail; hint; ruleset }`.
2. **Step 1 ("pick")**: same picker UI as today, but on click it fetches detail, parses base hint, classifies enrichability, and either:
   - *Not enrichable* (category is not "weapon"/"armor", case-insensitive — covers `weapon`, `weapons`, `armor`): save card immediately (existing flow), close.
   - *Enrichable* (`weapon`/`weapons` or `armor`): advance to `enrich` step with the loaded detail and computed hint.
3. **Step 2 ("enrich")**: render `<EnrichmentStep>`. On `onConfirm(equipment | null)`, save card with optional enrichment, close. On `onCancel`, return to step 1.

The DialogHeader title swaps between "Browse magic items" (step 1) and `<magic item name>` (step 2).

The existing `magicItemDetailToCard(detail)` call becomes `magicItemDetailToCard(detail, enrichment ?? undefined)`.

**Enrichability check:**

```ts
const isEnrichable = (categoryIndex: string): boolean => {
  const k = categoryIndex.toLowerCase();
  return k === "weapon" || k === "weapons" || k === "armor";
};
```

(2024's `equipment_category.index` is `"weapons"`, plural. 2014's is `"weapon"`. Armor is `"armor"` in both.)

- [ ] **Step 1: Write failing tests for the new flows**

Add cases to `src/views/BrowseApiModal.test.tsx`:

```tsx
it("imports a non-enrichable magic item directly", async () => {
  const onSelected = vi.fn();
  renderModal({ onSelected });
  await userEvent.click(await screen.findByRole("button", { name: /Wand of Wonder/ }));
  await waitFor(() => expect(onSelected).toHaveBeenCalled());
  // We never advanced to step 2:
  expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
});

it("opens the enrichment step for a specific weapon and auto-selects the base", async () => {
  renderModal();
  await userEvent.click(await screen.findByRole("button", { name: /Sun Blade/ }));
  // Step 2 visible
  await screen.findByRole("button", { name: /Skip/ });
  // Auto-selected longsword
  expect(screen.getByRole("button", { name: /Longsword/ })).toHaveAttribute("aria-pressed", "true");
});

it("opens the enrichment step for an 'any X' template with no auto-selection", async () => {
  renderModal();
  await userEvent.click(await screen.findByRole("button", { name: /Flame Tongue/ }));
  await screen.findByRole("button", { name: /Skip/ });
  // No row is pre-selected
  const rows = screen.getAllByRole("button", { name: /Longsword|Plate Armor/ });
  for (const row of rows) {
    expect(row).toHaveAttribute("aria-pressed", "false");
  }
});

it("Skip from enrichment step lands the card without enrichment", async () => {
  const onSelected = vi.fn();
  renderModal({ onSelected });
  await userEvent.click(await screen.findByRole("button", { name: /Flame Tongue/ }));
  await userEvent.click(await screen.findByRole("button", { name: /Skip/ }));
  await waitFor(() => expect(onSelected).toHaveBeenCalled());
});
```

You'll need MSW fixtures for `Wand of Wonder` (non-enrichable), `Sun Blade` (specific), `Flame Tongue` (any sword). Add those alongside the equipment fixtures in `src/test/msw.ts`.

- [ ] **Step 2: Refactor `BrowseApiModal.tsx`**

Pseudocode of the new structure (write actual code; the existing imports + `DialogShell` + `DialogHeader` stay the same):

```tsx
type Step =
  | { step: "pick" }
  | { step: "enrich"; magicDetail: MagicItemDetail; hint: BaseHint };

const [step, setStep] = useState<Step>({ step: "pick" });

const isEnrichable = (categoryIndex: string): boolean => {
  const k = categoryIndex.toLowerCase();
  return k === "weapon" || k === "weapons" || k === "armor";
};

const handlePick = async (slug: string) => {
  if (pickingSlug !== null) return;
  setPickingSlug(slug);
  setPickError(null);
  try {
    const detail = await queryClient.fetchQuery({
      queryKey: ["magic-items", ruleset, "detail", slug],
      queryFn: () => fetchMagicItemDetail(ruleset, slug),
      staleTime: DAY_MS,
    });
    if (!isEnrichable(detail.equipment_category.index)) {
      const card = magicItemDetailToCard(detail);
      await saveCard.mutateAsync({ card, deckId, isNew: true });
      onSelected(card.id);
      return;
    }
    const desc0 = detail.ruleset === "2024" ? detail.desc : detail.desc[0];
    const hint = parseBaseHint(desc0);
    setStep({ step: "enrich", magicDetail: detail, hint });
  } catch (err) {
    setPickError(err instanceof Error ? err.message : "Couldn't load this card.");
  } finally {
    setPickingSlug(null);
  }
};

const handleEnrichmentConfirm = async (enrichment: EquipmentDetail | null) => {
  if (step.step !== "enrich") return;
  const card = magicItemDetailToCard(step.magicDetail, enrichment ?? undefined);
  await saveCard.mutateAsync({ card, deckId, isNew: true });
  onSelected(card.id);
};
```

In the JSX, branch on `step.step` to render either the existing picker or `<EnrichmentStep ruleset={ruleset} hint={step.hint} onConfirm={handleEnrichmentConfirm} onCancel={() => setStep({ step: "pick" })} />`. Update the DialogHeader title to `step.step === "enrich" ? step.magicDetail.name : "Browse magic items"`.

- [ ] **Step 3: Run BrowseApiModal tests**

```
npm test -- src/views/BrowseApiModal.test.tsx
```

Expected: pass.

- [ ] **Step 4: Run full suite + typecheck**

```
npm test
npm run typecheck
```

Expected: green.

- [ ] **Step 5: Commit**

```
git add src/views/BrowseApiModal.tsx src/views/BrowseApiModal.test.tsx src/test/msw.ts
git commit -m "feat: two-step magic-item import wizard with optional enrichment"
```

---

## Task 9: Manual verification

- [ ] **Step 1: Start dev server**

```
npm run dev
```

- [ ] **Step 2: Exercise each branch in the browser**

In the new-card editor, open the SRD import modal and verify:

1. **Non-enrichable item** (e.g., search "wand of wonder", "potion of healing", "bag of holding"): clicking imports immediately, no second step. Resulting card has type in header, rarity in footer.
2. **Specific weapon** (e.g., "Sun Blade", "Holy Avenger", "Dwarven Thrower"): clicking shows the equipment step with a base auto-selected. Confirm imports with damage + weight; Skip imports without.
3. **Specific armor** (e.g., "Dwarven Plate"): same as above; auto-selection is "Plate Armor". Confirm produces `AC 18` in header and weight in footer.
4. **"Any X" template** (e.g., "Flame Tongue"): equipment step opens with no auto-selection, picker pre-filtered to swords / melee weapons (the `hint` populates the search box). Pick something, confirm; or Skip.
5. **Back button** at step 2 returns to step 1 with state preserved (search query, ruleset toggle).
6. **Help text** is visible under both TagInput fields in the editor.
7. **Print view** still renders cards correctly (sanity-check 2-up and 4-up; verify nothing regressed visually with the new tag layout).

- [ ] **Step 3: Final lint + build**

```
npm run build
```

Expected: green.

- [ ] **Step 4: Optional cleanup commit if anything came up during manual testing**

If the manual pass surfaced anything (typo, off-by-one in the picker, etc.), fix inline and commit:

```
git add <files>
git commit -m "fix: <what>"
```

If nothing came up, no commit.

---

## Self-review notes

- **Spec coverage**: every bullet in the user's original spec has a task home — tag model (Task 5), canonical order (Tasks 1, 4, 5), help text (Task 1), API import normalization (Task 5), no programmatic enforcement on user input (Task 1: help text only).
- **Cost auto-fill**: explicitly excluded; not implemented anywhere in the plan.
- **Type consistency**: `EquipmentDetail` defined in Task 3, used in Tasks 4, 5, 7, 8 with the same shape. `BaseHint` defined in Task 2, used in Tasks 7, 8. `magicItemDetailToCard` signature change in Task 5 is the only API break and is consumed only in `BrowseApiModal` (Task 8).
- **Open question (acknowledged in plan, not blocking)**: equipment index endpoint doesn't expose category, so step 2 doesn't filter weapons-only when invoked from a magic weapon. We rely on the user not deliberately picking armor for a magic weapon. If this turns out to matter, a follow-up task could pre-fetch category metadata.
