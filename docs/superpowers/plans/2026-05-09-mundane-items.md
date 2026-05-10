# Mundane Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Mundane Items browse content type sourced from Open5e v2 `/items/`, surfaced as a third tab alongside Magic Items and Spells.

**Architecture:** New `mundaneItemsContentType` registers itself in the existing `CONTENT_TYPES` array. A new endpoint module loads a build-time-bundled JSON file; a new mapper transforms detail entries to `ItemCard` (same `kind: "item"` as magic items). The existing magic-items content-type module is renamed (file + exported symbol + id) for clarity, but its endpoint, mapper, hook, and bundled-JSON file names are unchanged.

**Tech Stack:** React 18 + TypeScript + Vite + TanStack Query, Zod schemas, Vitest + RTL + MSW + fishery + faker.

**Spec:** [`docs/superpowers/specs/2026-05-09-mundane-items-design.md`](../specs/2026-05-09-mundane-items-design.md)

---

## Task 0: Verify baseline

**Files:** none (sanity check only)

- [ ] **Step 1: Install dependencies**

```bash
npm install
```

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean exit, no errors.

If either fails, stop and investigate before proceeding — the plan assumes a green baseline.

---

## Task 1: Rename magic-items content-type module

Mechanical rename to disambiguate the content-type module from the new mundane one. No user-visible change.

**Files:**
- Move: `src/api/content-types/items.ts` → `src/api/content-types/magic-items.ts`
- Modify: `src/api/content-types/index.ts`

- [ ] **Step 1: Move the file and rename the export + id**

```bash
git mv src/api/content-types/items.ts src/api/content-types/magic-items.ts
```

Then edit `src/api/content-types/magic-items.ts` to rename the export and change the id literal:

```ts
import { useMemo } from "react";
import { useMagicItemIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import type { ContentType } from "./types";

export const magicItemsContentType: ContentType = {
  id: "magic-items",
  label: "Magic Items",
  searchPlaceholder: "Search magic items…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useMagicItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: entry.rarity.name,
          toCard: () => magicItemDetailToCard({ ...entry, ruleset: source }),
        }));
    }, [idx.data, query, source]);
    return {
      isLoading: idx.isLoading,
      isError: idx.isError,
      refetch: idx.refetch,
      rows,
    };
  },
};
```

- [ ] **Step 2: Update the registry import**

Edit `src/api/content-types/index.ts`:

```ts
import { magicItemsContentType } from "./magic-items";
import { spellsContentType } from "./spells";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly [ContentType, ...ContentType[]] = [
  magicItemsContentType,
  spellsContentType,
];

export type { ContentRow, ContentType, ContentTypeResults } from "./types";
```

- [ ] **Step 3: Search for any stragglers and verify no other reference uses `itemsContentType` or the literal `"items"` content-type id**

```bash
grep -rn '"items"' src --include='*.ts' --include='*.tsx' | grep -v node_modules
grep -rn 'itemsContentType' src --include='*.ts' --include='*.tsx'
```

Expected output: no matches (all hits would be unrelated, e.g., `<Tab id={t.id}>`). `BrowseApiModal.test.tsx` already uses the queryKey literal `"magic-items"` so that file is unchanged for this task.

- [ ] **Step 4: Verify tests still pass**

```bash
npm test
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/api/content-types/
git commit -m "refactor(content-types): rename items.ts to magic-items.ts"
```

---

## Task 2: Add `mundaneItemSchema` to `srd-schema.ts`

Define the Zod schema that validates entries fetched from Open5e `/v2/items/`. Includes only fields consumed by the mapper.

**Files:**
- Modify: `src/data/srd-schema.ts`

- [ ] **Step 1: Add the schema**

Append to `src/data/srd-schema.ts` (immediately after `magicItemListSchema`, before `CASTING_TIME_VALUES`):

```ts
const weaponPropertyEntrySchema = z.object({
  property: z.object({
    name: z.string(),
    type: z.string().nullable(),
  }),
  detail: z.string().nullable(),
});

export const mundaneItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  desc: z.string(),
  category: namedSchema,
  weapon: z
    .object({
      damage_dice: z.string(),
      damage_type: namedSchema,
      properties: z.array(weaponPropertyEntrySchema),
      is_simple: z.boolean(),
      is_martial: z.boolean(),
    })
    .nullable(),
  armor: z
    .object({
      category: z.enum(["light", "medium", "heavy"]),
      ac_base: z.number(),
      ac_add_dexmod: z.boolean(),
      ac_cap_dexmod: z.number().nullable(),
      grants_stealth_disadvantage: z.boolean(),
      strength_score_required: z.number().nullable(),
    })
    .nullable(),
  weight: z.string(),
  weight_unit: z.string(),
  cost: z.string(),
});

export type MundaneItem = z.infer<typeof mundaneItemSchema>;

export const mundaneItemListSchema = z.array(mundaneItemSchema);
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean. (No tests yet; the endpoint test in Task 4 will exercise the schema against real bundled JSON.)

- [ ] **Step 3: Commit**

```bash
git add src/data/srd-schema.ts
git commit -m "feat(srd-schema): add mundaneItemSchema"
```

---

## Task 3: Add `mundane-items` resource to fetch-srd, run it, commit bundled JSON

The fetch script bundles JSON at build time; the runtime endpoint reads bundled JSON only.

**Files:**
- Modify: `scripts/fetch-srd.ts`
- Create: `src/data/srd-2014-mundane-items.json` (slim, schema-validated, used at runtime)
- Create: `src/data/srd-2024-mundane-items.json`
- Create: `data/srd-2014-mundane-items.raw.json` (raw API response; tracked in git per existing convention)
- Create: `data/srd-2024-mundane-items.raw.json`

- [ ] **Step 1: Add the resource entry**

Edit `scripts/fetch-srd.ts`. Add `mundaneItemListSchema` to the import on line 5:

```ts
import { magicItemListSchema, mundaneItemListSchema, spellListSchema } from "../src/data/srd-schema";
```

Append a third entry to `RESOURCES` (after the spells entry, around line 38):

```ts
const RESOURCES: ResourceConfig[] = [
  {
    name: "magicitems",
    url: (r) =>
      `https://api.open5e.com/v2/magicitems/?document=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: magicItemListSchema,
  },
  {
    name: "spells",
    url: (r) =>
      `https://api.open5e.com/v2/spells/?document__key=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: spellListSchema,
  },
  {
    name: "mundane-items",
    url: (r) =>
      `https://api.open5e.com/v2/items/?document=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: mundaneItemListSchema,
  },
];
```

The bundled-file path (`src/data/srd-{ruleset}-${resource.name}.json`) automatically picks up `mundane-items` and produces `src/data/srd-{2014|2024}-mundane-items.json`.

- [ ] **Step 2: Run the fetch script**

```bash
npm run fetch:srd
```

Expected output (counts will be approximately):
```
Wrote .../srd-2024-magicitems.raw.json
Wrote .../src/data/srd-2024-magicitems.json
  magicitems 2024: 757 rows
…
Wrote .../srd-2024-mundane-items.raw.json
Wrote .../src/data/srd-2024-mundane-items.json
  mundane-items 2024: 203 rows
Wrote .../srd-2014-mundane-items.raw.json
Wrote .../src/data/srd-2014-mundane-items.json
  mundane-items 2014: 237 rows
```

If the script throws on schema validation, the schema in Task 2 doesn't match the API. Read the validation error, adjust the schema, re-run.

- [ ] **Step 3: Verify the bundled files**

```bash
ls -la src/data/srd-*-mundane-items.json
node -e "console.log(JSON.parse(require('fs').readFileSync('src/data/srd-2024-mundane-items.json', 'utf8')).length)"
node -e "console.log(JSON.parse(require('fs').readFileSync('src/data/srd-2014-mundane-items.json', 'utf8')).length)"
```

Expected: both files exist; counts ≥ 200 (srd-2024) and ≥ 230 (srd-2014).

- [ ] **Step 4: Confirm raw files appear in `data/` (tracked, per existing convention)**

```bash
ls -la data/srd-*-mundane-items.raw.json
git ls-files data/ | grep magicitems
```

Expected: the new raw mundane files exist; the existing magic-items raw files are already tracked. Both raw and slim files get committed (`data/` is **not** gitignored — the existing `data/srd-2014-magicitems.raw.json` etc. are checked in).

- [ ] **Step 5: Commit the script change, raw JSON, and slim JSON**

```bash
git add scripts/fetch-srd.ts \
        src/data/srd-2014-mundane-items.json src/data/srd-2024-mundane-items.json \
        data/srd-2014-mundane-items.raw.json data/srd-2024-mundane-items.raw.json
git commit -m "feat(srd): bundle mundane-items index for both rulesets"
```

---

## Task 4: Add `mundaneItems` endpoint module + test (TDD)

Loads bundled JSON, exposes `fetchMundaneItemIndex` and the `MundaneItemDetail` type.

**Files:**
- Create: `src/api/endpoints/mundaneItems.ts`
- Create: `src/api/endpoints/mundaneItems.test.ts`

- [ ] **Step 1: Write the failing endpoint test**

Create `src/api/endpoints/mundaneItems.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { mundaneItemSchema } from "../../data/srd-schema";
import { fetchMundaneItemIndex } from "./mundaneItems";

describe("fetchMundaneItemIndex", () => {
  test("returns the bundled 2024 SRD mundane index", async () => {
    const result = await fetchMundaneItemIndex("2024");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThanOrEqual(150);
    expect(() => mundaneItemSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns the bundled 2014 SRD mundane index", async () => {
    const result = await fetchMundaneItemIndex("2014");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThanOrEqual(150);
    expect(() => mundaneItemSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns different data for 2014 vs 2024", async () => {
    const v2014 = await fetchMundaneItemIndex("2014");
    const v2024 = await fetchMundaneItemIndex("2024");

    const keys2014 = new Set(v2014.results.map((e) => e.key));
    const keys2024 = new Set(v2024.results.map((e) => e.key));
    const overlap = [...keys2024].filter((k) => keys2014.has(k));
    expect(overlap.length).toBeLessThan(v2024.count);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
npm test -- src/api/endpoints/mundaneItems.test.ts
```

Expected: import error or "fetchMundaneItemIndex is not a function".

- [ ] **Step 3: Implement the endpoint module**

Create `src/api/endpoints/mundaneItems.ts`:

```ts
import type { MundaneItem } from "../../data/srd-schema";
import type { Ruleset } from "./magicItems";

export type MundaneItemDetail = MundaneItem & { ruleset: Ruleset };

export type MundaneItemIndex = {
  count: number;
  results: MundaneItem[];
};

// JSON shape is validated at write time by scripts/fetch-srd.ts; the cast is
// the trust boundary into the bundled file.
const loadData = async (ruleset: Ruleset): Promise<MundaneItem[]> => {
  const m =
    ruleset === "2024"
      ? await import("../../data/srd-2024-mundane-items.json")
      : await import("../../data/srd-2014-mundane-items.json");
  return m.default as MundaneItem[];
};

export const fetchMundaneItemIndex = async (ruleset: Ruleset): Promise<MundaneItemIndex> => {
  const results = await loadData(ruleset);
  return { count: results.length, results };
};
```

- [ ] **Step 4: Run the test, expect green**

```bash
npm test -- src/api/endpoints/mundaneItems.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/endpoints/mundaneItems.ts src/api/endpoints/mundaneItems.test.ts
git commit -m "feat(api): add fetchMundaneItemIndex endpoint"
```

---

## Task 5: Add factories for mundane items

Test fixtures used by the mapper test and (later) the BrowseApiModal test.

**Files:**
- Modify: `src/api/factories.ts`

- [ ] **Step 1: Add the three factories**

Edit `src/api/factories.ts`. Update the imports at the top:

```ts
import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { MagicItem, MundaneItem, Spell } from "../data/srd-schema";
import type { MagicItemDetail, MagicItemIndex } from "./endpoints/magicItems";
import type { MundaneItemDetail, MundaneItemIndex } from "./endpoints/mundaneItems";
import type { SpellDetail, SpellIndex } from "./endpoints/spells";
```

Append the new factories at the end of the file (after `spellDetailFactory`):

```ts
const mundaneCategories = [
  "Adventuring Gear",
  "Weapon",
  "Armor",
  "Shield",
  "Tools",
  "Mount",
  "Equipment Pack",
];

export const mundaneItemIndexEntryFactory = Factory.define<MundaneItem>(() => {
  const slug = faker.helpers
    .slugify(`${faker.commerce.productName()}-${faker.string.alphanumeric(5)}`)
    .toLowerCase();
  return {
    key: open5eKey(slug),
    name: faker.commerce.productName(),
    desc: faker.lorem.paragraph(),
    category: { name: faker.helpers.arrayElement(mundaneCategories) },
    weapon: null,
    armor: null,
    weight: "0.000",
    weight_unit: "lb",
    cost: "0.00",
  };
});

type MundaneItemIndexTransient = { size: number };

export const mundaneItemIndexFactory = Factory.define<MundaneItemIndex, MundaneItemIndexTransient>(
  ({ transientParams }) => {
    const size = transientParams.size ?? 3;
    const results = mundaneItemIndexEntryFactory.buildList(size);
    return { count: results.length, results };
  },
);

export const mundaneItemDetailFactory = Factory.define<MundaneItemDetail>(() => ({
  ...mundaneItemIndexEntryFactory.build(),
  ruleset: "2024",
}));
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/api/factories.ts
git commit -m "test(factories): add mundane item factories"
```

---

## Task 6: Add the mundane-items mapper + tests (TDD)

Detail → `ItemCard` transform. This is the rule-heavy part of the spec.

**Files:**
- Create: `src/api/mappers/mundaneItems.ts`
- Create: `src/api/mappers/mundaneItems.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/api/mappers/mundaneItems.test.ts`:

```ts
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
      weight: "0.000",
      cost: "0.00",
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

  test("apiRef carries open5e system, the detail key as slug, and the ruleset", () => {
    const detail = mundaneItemDetailFactory.build({ key: "srd-2024_battleaxe" });
    const card = mundaneItemDetailToCard(detail);
    expect(card.apiRef).toEqual({
      system: "open5e",
      slug: "srd-2024_battleaxe",
      ruleset: "2024",
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
    expect(card.headerTags).toContain("Ammunition (Range 150/600; Arrow)");
    expect(card.headerTags).toContain("Heavy");
    expect(card.headerTags).toContain("Two-Handed");
  });

  test("'improvised'/consumable weapon (weapon: null) → only category tag", () => {
    const detail = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: null,
      desc: "When you take the Attack action, you can replace one of your attacks with throwing a vial of Acid…",
    });
    const card = mundaneItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Weapon"]);
    expect(card.body).toContain("Acid");
  });

  test("light armor with capped dex bonus", () => {
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
    expect(card.headerTags).toEqual([
      "Armor",
      "Heavy",
      "AC 16",
      "Stealth disadvantage",
      "Str 13",
    ]);
  });

  test("cost: 10.00 → '10 gp', '0.50' → '5 sp', '0.05' → '5 cp', '0.00' omitted", () => {
    const cases: [string, string | null][] = [
      ["10.00", "10 gp"],
      ["1.00", "1 gp"],
      ["400.00", "400 gp"],
      ["0.50", "5 sp"],
      ["0.10", "1 sp"],
      ["0.05", "5 cp"],
      ["0.02", "2 cp"],
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
      category: { name: "Weapon" },
      weapon: null,
      cost: "10.00",
      weight: "4.000",
      weight_unit: "lb",
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
```

- [ ] **Step 2: Run the tests, expect failure**

```bash
npm test -- src/api/mappers/mundaneItems.test.ts
```

Expected: import error or "mundaneItemDetailToCard is not a function".

- [ ] **Step 3: Implement the mapper**

Create `src/api/mappers/mundaneItems.ts`:

```ts
import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MundaneItemDetail } from "../endpoints/mundaneItems";

const formatCost = (cost: string): string | null => {
  const gp = parseFloat(cost);
  if (gp <= 0) return null;
  if (gp >= 1) return `${gp} gp`;
  if (gp >= 0.1) return `${Math.round(gp * 10)} sp`;
  return `${Math.round(gp * 100)} cp`;
};

type WeaponPropertyEntry = {
  property: { name: string; type: string | null };
  detail: string | null;
};

const propertyTag = ({ property, detail }: WeaponPropertyEntry): string => {
  if (property.type === "Mastery") return `${property.name} (Mastery)`;
  if (detail !== null) return `${property.name} (${detail})`;
  return property.name;
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const mundaneItemDetailToCard = (detail: MundaneItemDetail): ItemCard => {
  const now = nowIso();
  const headerTags: string[] = [detail.category.name];

  if (detail.weapon) {
    if (detail.weapon.is_simple) headerTags.push("Simple");
    else if (detail.weapon.is_martial) headerTags.push("Martial");
    headerTags.push(`${detail.weapon.damage_dice} ${detail.weapon.damage_type.name.toLowerCase()}`);
    for (const p of detail.weapon.properties) headerTags.push(propertyTag(p));
  }

  if (detail.armor) {
    headerTags.push(capitalize(detail.armor.category));
    const { ac_base, ac_add_dexmod, ac_cap_dexmod } = detail.armor;
    let ac = `AC ${ac_base}`;
    if (ac_add_dexmod) {
      ac += ac_cap_dexmod !== null ? ` + dex mod (max ${ac_cap_dexmod})` : " + dex mod";
    }
    headerTags.push(ac);
    if (detail.armor.grants_stealth_disadvantage) headerTags.push("Stealth disadvantage");
    if (detail.armor.strength_score_required !== null) {
      headerTags.push(`Str ${detail.armor.strength_score_required}`);
    }
  }

  const footerTags: string[] = [];
  const cost = formatCost(detail.cost);
  if (cost !== null) footerTags.push(cost);
  const weight = parseFloat(detail.weight);
  if (weight > 0) footerTags.push(`${weight} ${detail.weight_unit}`);

  return {
    id: newId(),
    kind: "item",
    name: detail.name,
    headerTags,
    body: detail.desc,
    footerTags,
    source: "api",
    apiRef: { system: "open5e", slug: detail.key, ruleset: detail.ruleset },
    createdAt: now,
    updatedAt: now,
  };
};
```

- [ ] **Step 4: Run the tests, expect green**

```bash
npm test -- src/api/mappers/mundaneItems.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite to verify no regression**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/api/mappers/mundaneItems.ts src/api/mappers/mundaneItems.test.ts
git commit -m "feat(api): add mundaneItemDetailToCard mapper"
```

---

## Task 7: Add `useMundaneItemIndex` hook

**Files:**
- Modify: `src/api/hooks.ts`

- [ ] **Step 1: Add the hook**

Edit `src/api/hooks.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchMagicItemIndex, type Ruleset } from "./endpoints/magicItems";
import { fetchMundaneItemIndex } from "./endpoints/mundaneItems";
import { fetchSpellIndex } from "./endpoints/spells";
import { DAY_MS } from "./timing";

export const useMagicItemIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["magic-items", ruleset, "index"],
    queryFn: () => fetchMagicItemIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

export const useMundaneItemIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["mundane-items", ruleset, "index"],
    queryFn: () => fetchMundaneItemIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

export const useSpellIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["spells", ruleset, "index"],
    queryFn: () => fetchSpellIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });
```

- [ ] **Step 2: Typecheck and run tests**

```bash
npm run typecheck && npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/api/hooks.ts
git commit -m "feat(api): add useMundaneItemIndex hook"
```

---

## Task 8: Add `mundaneItemsContentType` module

**Files:**
- Create: `src/api/content-types/mundane-items.ts`

- [ ] **Step 1: Create the module**

Create `src/api/content-types/mundane-items.ts`:

```ts
import { useMemo } from "react";
import { useMundaneItemIndex } from "../hooks";
import { mundaneItemDetailToCard } from "../mappers/mundaneItems";
import type { ContentType } from "./types";

export const mundaneItemsContentType: ContentType = {
  id: "mundane-items",
  label: "Mundane Items",
  searchPlaceholder: "Search mundane items…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useMundaneItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: entry.category.name,
          toCard: () => mundaneItemDetailToCard({ ...entry, ruleset: source }),
        }));
    }, [idx.data, query, source]);
    return {
      isLoading: idx.isLoading,
      isError: idx.isError,
      refetch: idx.refetch,
      rows,
    };
  },
};
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit (registry update happens in next task)**

```bash
git add src/api/content-types/mundane-items.ts
git commit -m "feat(content-types): add mundane-items content type"
```

---

## Task 9: Register `mundaneItemsContentType` in CONTENT_TYPES

**Files:**
- Modify: `src/api/content-types/index.ts`

- [ ] **Step 1: Update the registry**

Edit `src/api/content-types/index.ts`:

```ts
import { magicItemsContentType } from "./magic-items";
import { mundaneItemsContentType } from "./mundane-items";
import { spellsContentType } from "./spells";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly [ContentType, ...ContentType[]] = [
  magicItemsContentType,
  mundaneItemsContentType,
  spellsContentType,
];

export type { ContentRow, ContentType, ContentTypeResults } from "./types";
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: many `BrowseApiModal` tests now FAIL because the existing tab-list assertion checks `["Magic Items", "Spells"]` but the registry now produces three tabs. This is fine — Task 10 fixes those tests.

If unrelated tests fail, investigate.

- [ ] **Step 3: Commit (the registry change is a behavioral change; tests get fixed in next task)**

```bash
git add src/api/content-types/index.ts
git commit -m "feat(content-types): register mundane-items in registry"
```

---

## Task 10: Update `BrowseApiModal.test.tsx` for the new tab

Existing tab-presence assertion grows from 2 → 3, plus a new end-to-end test for the Mundane Items tab path (seed query data, click row, assert POST).

**Files:**
- Modify: `src/views/BrowseApiModal.test.tsx`

- [ ] **Step 1: Add helpers and update Seeds type**

Edit `src/views/BrowseApiModal.test.tsx`. Replace the imports and the helpers block (lines 1–32) with:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";
import * as magicItemsEndpoint from "../api/endpoints/magicItems";
import type { MundaneItemIndex } from "../api/endpoints/mundaneItems";
import type { SpellIndex } from "../api/endpoints/spells";
import {
  magicItemIndexEntryFactory,
  mundaneItemIndexEntryFactory,
  spellIndexEntryFactory,
} from "../api/factories";
import { makeCardRow } from "../test/factories";
import { SB_URL, server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
import { BrowseApiModal } from "./BrowseApiModal";

const itemKey = (ruleset: Ruleset) => ["magic-items", ruleset, "index"];
const mundaneKey = (ruleset: Ruleset) => ["mundane-items", ruleset, "index"];
const spellKey = (ruleset: Ruleset) => ["spells", ruleset, "index"];

type Seeds = {
  items?: Partial<Record<Ruleset, MagicItemIndex>>;
  mundane?: Partial<Record<Ruleset, MundaneItemIndex>>;
  spells?: Partial<Record<Ruleset, SpellIndex>>;
};

const makeClient = (seeds: Seeds = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [ruleset, body] of Object.entries(seeds.items ?? {}) as [Ruleset, MagicItemIndex][]) {
    client.setQueryData(itemKey(ruleset), body);
  }
  for (const [ruleset, body] of Object.entries(seeds.mundane ?? {}) as [
    Ruleset,
    MundaneItemIndex,
  ][]) {
    client.setQueryData(mundaneKey(ruleset), body);
  }
  for (const [ruleset, body] of Object.entries(seeds.spells ?? {}) as [Ruleset, SpellIndex][]) {
    client.setQueryData(spellKey(ruleset), body);
  }
  return client;
};
```

- [ ] **Step 2: Update the tab-list assertion**

Find the test on line 42-48 (`renders the registered types as a vertical tablist in registry order`). Replace the assertion at line 47:

```ts
    expect(tabs.map((t) => t.textContent)).toEqual(["Magic Items", "Mundane Items", "Spells"]);
```

- [ ] **Step 3: Add a new test for the Mundane Items tab**

Insert the following test after `"clicking a spell POSTs a card with kind:spell"` (around line 175):

```ts
  test("clicking a mundane item POSTs a card with kind:item", async () => {
    const entry = mundaneItemIndexEntryFactory.build({
      name: "Battleaxe",
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d8",
        damage_type: { name: "Slashing" },
        properties: [],
        is_simple: false,
        is_martial: true,
      },
      cost: "10.00",
      weight: "4.000",
      weight_unit: "lb",
    });
    const client = makeClient({
      items: { "2024": { count: 0, results: [] } },
      mundane: { "2024": { count: 1, results: [entry] } },
    });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(screen.getByRole("tab", { name: "Mundane Items" }));
    await userEvent.click(await screen.findByRole("button", { name: /Battleaxe/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    const payload = onPost.mock.calls[0]?.[0]?.payload;
    expect(payload?.kind).toBe("item");
    expect(payload?.headerTags).toEqual([
      "Weapon",
      "Martial",
      "1d8 slashing",
    ]);
    expect(payload?.footerTags).toEqual(["10 gp", "4 lb"]);
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("shows category in each mundane item row", async () => {
    const entry = mundaneItemIndexEntryFactory.build({
      name: "Rope",
      category: { name: "Adventuring Gear" },
    });
    const client = makeClient({
      items: { "2024": { count: 0, results: [] } },
      mundane: { "2024": { count: 1, results: [entry] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await userEvent.click(screen.getByRole("tab", { name: "Mundane Items" }));
    const row = await screen.findByRole("button", { name: /Rope/ });
    expect(row).toHaveTextContent("Adventuring Gear");
  });
```

- [ ] **Step 4: Run the test file, expect all passing**

```bash
npm test -- src/views/BrowseApiModal.test.tsx
```

Expected: all tests pass, including the new ones.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/views/BrowseApiModal.test.tsx
git commit -m "test(browse): cover mundane items tab in modal tests"
```

---

## Task 11: Final integration check

**Files:** none (verification only)

- [ ] **Step 1: Full type and test pass**

```bash
npm run typecheck
npm test
npm run lint
```

Expected: all green.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke test in dev**

```bash
npm run dev
```

Open the app, navigate to a deck, open the browse dialog. Verify:
- Sidebar shows three tabs in order: Magic Items, Mundane Items, Spells.
- Mundane Items tab loads, search filters work.
- Source dropdown still works on the Mundane Items tab.
- Clicking an item (e.g., Battleaxe) saves a card; the card carries the expected header / body / footer tags as specified.
- Switching tabs clears the search.

Stop the dev server.

- [ ] **Step 4: If any cleanup commits emerged from manual testing, commit them. Otherwise, plan complete.**

---

## Self-review notes

**Spec coverage:**
- New tab "Mundane Items" registered in sidebar — Tasks 8, 9.
- Source: `/v2/items/?document=…` — Task 3 (resource entry), Task 4 (endpoint).
- Card composition (header tags, body, footer tags) — Task 6.
- Cost on mundane only — Task 6 (mapper); magic items mapper untouched.
- `kind: "item"` reuse — Task 6 (mapper output) and `itemCardSchema.parse` test.
- Internal magic-items module rename — Task 1.
- Sanity floor ≥ 150 — Task 4 (endpoint test).
- 3-tab order assertion update — Task 10.
- Factories at `src/api/factories.ts` (3 of them) — Task 5.
- Hook naming `useMundaneItemIndex` (singular) — Task 7.

**Files-left-alone preserved:** `Card.tsx`, `renderBody`, `resolveIcon`, print pipeline, router, decks code, Supabase migrations, RLS policies — none touched.
