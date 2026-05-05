# Spell Card Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SRD spell import alongside the existing magic-item import, sharing the bundled-JSON pipeline and the editor/render code path.

**Architecture:** Hoist `headerTags`/`footerTags` into the base card so spells can carry the same metadata. Widen the render pipeline (`Card`, `expandCard`, `measurer`, `useExpandedCards`, `iconRules.pickIconKey`, `EditorView`, `PrintView`) and the editor (`ItemEditor` → `CardEditor`) to accept items or spells. Bundle Open5e v2 spells through the existing `fetch-srd` script (generalized to multiple resource types). Ship a kind picker + SRD notice in `BrowseApiModal`.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, Vitest + RTL + MSW, Fishery + faker, Zod, Supabase migrations with `pg_jsonschema`, Biome.

**Read first:** `docs/superpowers/handoff/2026-05-04-spell-import.md` — full design context, including the canonical tag order and the four Open5e quirks. This plan implements that handoff.

---

## File map

| File | Change |
|---|---|
| `src/decks/schema.ts` | Hoist `headerTags`/`footerTags` into `baseCardSchema` |
| `src/cards/types.ts` | Hoist `headerTags`/`footerTags` into `BaseCard` |
| `src/cards/factories.ts` | (no change — already only builds items) |
| `src/test/factories.ts` | Add `headerTags`/`footerTags: []` to spell + ability payload factories |
| `supabase/schemas/card-payload.json` | Regenerate via `npm run gen:schema` |
| `supabase/migrations/20260504HHMMSS_hoist_tags_to_base.sql` | New migration: drop + re-add `cards_payload_valid` with regenerated schema |
| `src/cards/iconRules.ts` | Widen `pickIconKey` to `ItemCard \| SpellCard` |
| `src/cards/Card.tsx` | Widen `Props.card` |
| `src/cards/expandCard.ts` | Widen `card` parameter and `PhysicalCard.card` |
| `src/cards/measurer.ts` | Widen measurer card type |
| `src/cards/useExpandedCards.ts` | Widen `items` |
| `src/cards/ItemEditor.tsx` → `src/cards/CardEditor.tsx` | Rename file; widen prop type |
| `src/cards/ItemEditor.module.css` → `src/cards/CardEditor.module.css` | Rename |
| `src/cards/ItemEditor.test.tsx` → `src/cards/CardEditor.test.tsx` | Rename + add a spell-card test for parity |
| `src/views/EditorView.tsx` | Drop "only items" rejection; widen draft type; update import-hint copy |
| `src/views/EditorView.test.tsx` | Update assertions for new dialog title and button label |
| `src/views/PrintView.tsx` | Filter `kind ∈ {item, spell}`; update empty-state copy |
| `src/views/PrintView.test.tsx` | Adjust if it asserts the empty-state copy |
| `src/lib/ui/README.md` | Update `ItemEditor.tsx` reference to `CardEditor.tsx` |
| `src/data/srd-schema.ts` | Add `spellSchema`, `spellListSchema`, type exports |
| `scripts/fetch-srd.ts` | Generalize to a `RESOURCES` config; add spells entry |
| `data/srd-2014-spells.raw.json` | Generated via `npm run fetch:srd` |
| `data/srd-2024-spells.raw.json` | Generated |
| `src/data/srd-2014-spells.json` | Generated (bundled slim) |
| `src/data/srd-2024-spells.json` | Generated |
| `src/api/endpoints/spells.ts` | New: `fetchSpellIndex`, `Spell`, `SpellDetail`, `SpellIndex` |
| `src/api/endpoints/spells.test.ts` | New: bundled-JSON shape tests |
| `src/api/hooks.ts` | Add `useSpellIndex` |
| `src/api/factories.ts` | Add `spellIndexEntryFactory`, `spellDetailFactory`, `spellIndexFactory` |
| `src/api/mappers/spells.ts` | New: `spellDetailToCard` |
| `src/api/mappers/spells.test.ts` | New: tag-order edge cases |
| `src/views/BrowseApiModal.tsx` | Kind toggle, SRD notice, spell branch, retitle |
| `src/views/BrowseApiModal.module.css` | Notice + toolbar styles |
| `src/views/BrowseApiModal.test.tsx` | Adjust assertions; add spell-side tests |

Two non-obvious decisions baked in:

1. **Hoist tags into base, not extend each kind.** Cleaner unions, single source of truth, simpler render pipeline widening. AbilityCard inherits the fields too — fine, it's defaulting to `[]` and not yet renderable.
2. **`RenderableCard = ItemCard | SpellCard`** — exported from `src/cards/types.ts` to anchor every render-path widening. Avoids `ItemCard | SpellCard` repeated 8 times.

---

## Task 1: Hoist `headerTags`/`footerTags` into base type and schema

**Files:**
- Modify: `src/cards/types.ts`
- Modify: `src/decks/schema.ts`
- Modify: `src/test/factories.ts`

- [ ] **Step 1: Update `src/cards/types.ts`**

Replace the file with:

```ts
export type CardId = string;

export type BaseCard = {
  id: CardId;
  name: string;
  body: string;
  imageUrl?: string;
  source: "custom" | "api";
  apiRef?: { system: "open5e"; slug: string; ruleset: "2014" | "2024" };
  createdAt: string;
  updatedAt: string;
  iconKey?: string;
  headerTags: string[];
  footerTags: string[];
};

export type ItemCard = BaseCard & { kind: "item" };
export type SpellCard = BaseCard & { kind: "spell" };
export type AbilityCard = BaseCard & { kind: "ability" };

export type Card = ItemCard | SpellCard | AbilityCard;

export type RenderableCard = ItemCard | SpellCard;

export type Deck = {
  version: 1;
  cards: Card[];
};
```

- [ ] **Step 2: Update `src/decks/schema.ts`**

Move the `headerTags`/`footerTags` fields into `baseCardSchema`:

```ts
import { z } from "zod";

const apiRefSchema = z.object({
  system: z.literal("open5e"),
  slug: z.string(),
  ruleset: z.enum(["2014", "2024"]),
});

const baseCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string(),
  imageUrl: z.string().optional(),
  source: z.enum(["custom", "api"]),
  apiRef: apiRefSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  iconKey: z.string().optional(),
  headerTags: z.array(z.string()).default([]),
  footerTags: z.array(z.string()).default([]),
});

export const itemCardSchema = baseCardSchema.extend({ kind: z.literal("item") });
export const spellCardSchema = baseCardSchema.extend({ kind: z.literal("spell") });
export const abilityCardSchema = baseCardSchema.extend({ kind: z.literal("ability") });

export const cardSchema = z.discriminatedUnion("kind", [
  itemCardSchema,
  spellCardSchema,
  abilityCardSchema,
]);

const itemPayloadSchema = itemCardSchema.omit({ id: true });
const spellPayloadSchema = spellCardSchema.omit({ id: true });
const abilityPayloadSchema = abilityCardSchema.omit({ id: true });

export const cardPayloadSchema = z.discriminatedUnion("kind", [
  itemPayloadSchema,
  spellPayloadSchema,
  abilityPayloadSchema,
]);

export const deckSchema = z.object({
  version: z.literal(1),
  cards: z.array(cardSchema),
});
```

- [ ] **Step 3: Update `src/test/factories.ts`**

Add `headerTags: []` and `footerTags: []` to `makeSpellPayload` and `makeAbilityPayload`. Replace the two factories with:

```ts
export const makeSpellPayload = Factory.define<Omit<SpellCard, "id">>(() => {
  const now = faker.date.recent().toISOString();
  return {
    kind: "spell",
    name: faker.lorem.words(2),
    headerTags: [],
    body: faker.lorem.paragraph(),
    footerTags: [],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});

export const makeAbilityPayload = Factory.define<Omit<AbilityCard, "id">>(() => {
  const now = faker.date.recent().toISOString();
  return {
    kind: "ability",
    name: faker.lorem.words(2),
    headerTags: [],
    body: faker.lorem.paragraph(),
    footerTags: [],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — `BaseCard`'s new required fields are satisfied by every callsite that uses item factories (already passing). Spell/ability factories now match the widened `SpellCard`/`AbilityCard` shapes.

- [ ] **Step 5: Run unit tests**

Run: `npx vitest run --dir src`
Expected: PASS — all 263 tests still green; the changes are pure-additive at runtime (tags default to `[]` for kinds that previously didn't expose them).

- [ ] **Step 6: Commit**

```bash
git add src/cards/types.ts src/decks/schema.ts src/test/factories.ts
git commit -m "feat(schema): hoist headerTags/footerTags into base card

Spells will need the same tag fields as items. Putting them on the
base type keeps the render pipeline uniform without per-kind branches.
Existing rows are unaffected — the schema defaults missing arrays to []."
```

---

## Task 2: Regenerate JSON schema and write the migration

**Files:**
- Generate: `supabase/schemas/card-payload.json`
- Create: `supabase/migrations/20260504120000_hoist_tags_to_base.sql`

- [ ] **Step 1: Regenerate the JSON schema**

Run: `npm run gen:schema`
Expected: writes `supabase/schemas/card-payload.json`. Confirm `git diff` shows the spell + ability variants now include `headerTags` / `footerTags` properties (with `default: []`) and require them in their `required` arrays — same shape the item variant already has.

- [ ] **Step 2: Pick the migration timestamp**

The most recent migration is `20260504113000_swap_apiref_system_to_open5e.sql`. Use `20260504120000` (or any greater timestamp on 2026-05-04). Adjust the filename below if you pick differently.

- [ ] **Step 3: Write the migration**

Start from the prior migration as a template. Run:
```bash
cp supabase/migrations/20260504113000_swap_apiref_system_to_open5e.sql \
   supabase/migrations/20260504120000_hoist_tags_to_base.sql
```

Then edit `supabase/migrations/20260504120000_hoist_tags_to_base.sql` exactly as follows:

1. Replace the top header-comment block (everything before `create extension`) with:
   ```sql
   -- 20260504120000_hoist_tags_to_base.sql
   -- Re-add cards_payload_valid after hoisting headerTags/footerTags into the
   -- base card schema. Spell + ability variants now require those fields with a
   -- default of [] — existing rows missing those keys are accepted via the
   -- default.
   --
   -- The embedded JSON Schema below is generated from src/decks/schema.ts via
   -- `npm run gen:schema`. To update it, regenerate the JSON file and write a
   -- NEW migration that follows the same drop-then-add pattern below — never
   -- edit this file in place.
   ```

2. Delete the data-migration block (the `-- Data migration: ...` comment and the `update public.cards ... where ...;` statement). Keep `create extension`, `alter table ... drop constraint`, and `alter table ... add constraint`.

3. Replace the entire JSON Schema body between the two `$cardpayload$` markers with the contents of `supabase/schemas/card-payload.json`. Preserve the surrounding `$cardpayload$ ... $cardpayload$::json,` markers and indentation. The marker lines stay; only the JSON between them changes.

- [ ] **Step 4: Verify schema check passes**

Run: `npm run check:schema`
Expected: `No drift in supabase/schemas/card-payload.json`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schemas/card-payload.json supabase/migrations/20260504120000_hoist_tags_to_base.sql
git commit -m "feat(db): re-add cards_payload_valid with hoisted tag fields"
```

---

## Task 3: Widen `pickIconKey`

**Files:**
- Modify: `src/cards/iconRules.ts`

- [ ] **Step 1: Widen the parameter type**

In `src/cards/iconRules.ts`:
- Replace `import type { ItemCard } from "./types";` with `import type { RenderableCard } from "./types";`
- Replace `export function pickIconKey(card: ItemCard): string {` with `export function pickIconKey(card: RenderableCard): string {`

The function body works unchanged — it reads `card.name` and `card.headerTags` which both exist on `RenderableCard`.

- [ ] **Step 2: Run icon-rules tests**

Run: `npx vitest run src/cards/iconRules.test.ts`
Expected: PASS — same behavior, broader input type.

- [ ] **Step 3: Commit**

```bash
git add src/cards/iconRules.ts
git commit -m "refactor(icons): widen pickIconKey to RenderableCard"
```

---

## Task 4: Widen `Card`, `expandCard`, `measurer`, `useExpandedCards`

**Files:**
- Modify: `src/cards/Card.tsx`
- Modify: `src/cards/expandCard.ts`
- Modify: `src/cards/measurer.ts`
- Modify: `src/cards/useExpandedCards.ts`

- [ ] **Step 1: Widen `Card.tsx`**

Replace:
```ts
import type { ItemCard } from "./types";
```
with:
```ts
import type { RenderableCard } from "./types";
```

And `card: ItemCard;` → `card: RenderableCard;` in the Props type.

- [ ] **Step 2: Widen `expandCard.ts`**

Replace:
```ts
import type { ItemCard } from "./types";

export type PhysicalCard = {
  card: ItemCard;
  ...
};

export function expandCard(card: ItemCard, measurer: CardMeasurer): PhysicalCard[] {
```
with:
```ts
import type { RenderableCard } from "./types";

export type PhysicalCard = {
  card: RenderableCard;
  bodyChunk: string;
  pagination?: CardPagination;
};

export function expandCard(card: RenderableCard, measurer: CardMeasurer): PhysicalCard[] {
```

(Body unchanged.)

- [ ] **Step 3: Widen `measurer.ts`**

Replace:
```ts
import type { ItemCard } from "./types";

export type CardMeasurer = {
  measureFirst: (card: ItemCard, chunk: string) => boolean;
  measureContinuation: (card: ItemCard, chunk: string) => boolean;
};
```
with:
```ts
import type { RenderableCard } from "./types";

export type CardMeasurer = {
  measureFirst: (card: RenderableCard, chunk: string) => boolean;
  measureContinuation: (card: RenderableCard, chunk: string) => boolean;
};
```

(The implementation body uses only `card.name`, `card.headerTags`, `card.footerTags` — all on `BaseCard`, so no body changes.)

- [ ] **Step 4: Widen `useExpandedCards.ts`**

Replace:
```ts
import type { ItemCard } from "./types";
...
export function useExpandedCards(
  items: ItemCard[],
  cardsPerPage: CardsPerPage,
): { physicalCards: PhysicalCard[] } {
```
with:
```ts
import type { RenderableCard } from "./types";
...
export function useExpandedCards(
  items: RenderableCard[],
  cardsPerPage: CardsPerPage,
): { physicalCards: PhysicalCard[] } {
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npx vitest run --dir src/cards`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cards/Card.tsx src/cards/expandCard.ts src/cards/measurer.ts src/cards/useExpandedCards.ts
git commit -m "refactor(cards): widen render pipeline to RenderableCard"
```

---

## Task 5: Rename `ItemEditor` → `CardEditor`, widen prop type

**Files:**
- Rename: `src/cards/ItemEditor.tsx` → `src/cards/CardEditor.tsx`
- Rename: `src/cards/ItemEditor.module.css` → `src/cards/CardEditor.module.css`
- Rename: `src/cards/ItemEditor.test.tsx` → `src/cards/CardEditor.test.tsx`
- Modify: `src/views/EditorView.tsx`
- Modify: `src/lib/ui/README.md`

- [ ] **Step 1: Rename files via git mv**

```bash
git mv src/cards/ItemEditor.tsx src/cards/CardEditor.tsx
git mv src/cards/ItemEditor.module.css src/cards/CardEditor.module.css
git mv src/cards/ItemEditor.test.tsx src/cards/CardEditor.test.tsx
```

- [ ] **Step 2: Update `CardEditor.tsx`**

In the renamed file:
- Change `import styles from "./ItemEditor.module.css";` → `import styles from "./CardEditor.module.css";`
- Change `import type { ItemCard } from "./types";` → `import type { RenderableCard } from "./types";`
- Change `card: ItemCard;` → `card: RenderableCard;`
- Change `onChange: (next: ItemCard) => void;` → `onChange: (next: RenderableCard) => void;`
- Change `export function ItemEditor(` → `export function CardEditor(`

The function body uses only base + tag fields — no per-kind branches needed.

- [ ] **Step 3: Update `CardEditor.test.tsx`**

In the renamed test file:
- Change `import { ItemEditor } from "./ItemEditor";` → `import { CardEditor } from "./CardEditor";`
- Change the `<ItemEditor ...>` render in `Harness` to `<CardEditor ...>`
- Change `describe("<ItemEditor>"...)` → `describe("<CardEditor>"...)`
- The `HarnessProps` and `seen: ItemCard[]` types stay — items still flow through this editor; we'll add a separate spell parity test in Step 4.

- [ ] **Step 4: Add a spell parity test**

Append a new `describe` block at the end of `CardEditor.test.tsx`:

```ts
describe("<CardEditor> with a spell card", () => {
  const buildSpell = (): SpellCard => ({
    id: "spell-1",
    kind: "spell",
    name: "Fireball",
    headerTags: ["3rd-level evocation", "1 action", "150 feet", "Instantaneous"],
    body: "A bright streak flashes…",
    footerTags: ["V, S, M (a tiny ball of bat guano and sulfur)", "Sorcerer, Wizard"],
    source: "api",
    createdAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
  });

  test("renders name, body, headerTags, and footerTags from a spell", () => {
    const spell = buildSpell();
    render(
      <CardEditor card={spell} onChange={() => {}} />,
    );
    expect(screen.getByLabelText(/name/i)).toHaveValue("Fireball");
    expect(screen.getByLabelText(/body/i)).toHaveValue("A bright streak flashes…");
    expect(screen.getByRole("button", { name: /remove 3rd-level evocation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove sorcerer, wizard/i })).toBeInTheDocument();
  });

  test("editing the body of a spell propagates the spell kind", async () => {
    const spell = buildSpell();
    const seen: RenderableCard[] = [];
    const Wrapper = () => {
      const [c, setC] = useState<RenderableCard>(spell);
      return (
        <CardEditor card={c} onChange={(n) => { setC(n); seen.push(n); }} />
      );
    };
    render(<Wrapper />);
    await userEvent.type(screen.getByLabelText(/body/i), "X");
    expect(seen[seen.length - 1]?.kind).toBe("spell");
  });
});
```

Add the missing imports at the top of the file:

```ts
import type { RenderableCard, SpellCard } from "./types";
```

- [ ] **Step 5: Update `EditorView.tsx` import**

In `src/views/EditorView.tsx`, change:
```ts
import { ItemEditor } from "../cards/ItemEditor";
```
to:
```ts
import { CardEditor } from "../cards/CardEditor";
```

And replace the JSX `<ItemEditor card={draft} onChange={setDraft} />` with `<CardEditor card={draft} onChange={setDraft} />`.

(Editor view still passes `ItemCard` here; spell handling lands in Task 13. This step keeps the rename atomic.)

- [ ] **Step 6: Update `src/lib/ui/README.md`**

Find the line referencing `src/cards/ItemEditor.tsx` and replace with `src/cards/CardEditor.tsx`.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/cards/CardEditor.test.tsx && npm run typecheck`
Expected: PASS — both the existing item-card tests and the two new spell parity tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A src/cards/ItemEditor.tsx src/cards/ItemEditor.module.css src/cards/ItemEditor.test.tsx src/cards/CardEditor.tsx src/cards/CardEditor.module.css src/cards/CardEditor.test.tsx src/views/EditorView.tsx src/lib/ui/README.md
git commit -m "refactor(cards): rename ItemEditor to CardEditor and widen to RenderableCard"
```

---

## Task 6: Add spell zod schema to `src/data/srd-schema.ts`

**Files:**
- Modify: `src/data/srd-schema.ts`

- [ ] **Step 1: Append spell schemas**

Append to `src/data/srd-schema.ts`:

```ts
export const CASTING_TIME_VALUES = [
  "action",
  "bonus-action",
  "reaction",
  "minute",
  "hour",
] as const;

export const spellSchema = z.object({
  key: z.string(),
  name: z.string(),
  level: z.number(),
  school: namedSchema,
  casting_time: z.enum(CASTING_TIME_VALUES),
  ritual: z.boolean(),
  range_text: z.string(),
  duration: z.string(),
  concentration: z.boolean(),
  verbal: z.boolean(),
  somatic: z.boolean(),
  material: z.boolean(),
  material_specified: z.string(),
  classes: z.array(namedSchema),
  desc: z.string(),
  higher_level: z.string(),
});

export type Spell = z.infer<typeof spellSchema>;

export const spellListSchema = z.array(spellSchema);
```

(Note: `casting_time` uses `z.enum` against the canonical 5 values — Quirk 2. Validation will fail loudly during `fetch:srd` if Open5e adds a new value, which is what we want.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/data/srd-schema.ts
git commit -m "feat(srd): add zod schema for Open5e spells"
```

---

## Task 7: Generalize `scripts/fetch-srd.ts` and add the spells resource

**Files:**
- Modify: `scripts/fetch-srd.ts`

- [ ] **Step 1: Refactor to a `RESOURCES` config**

Replace the entire body of `scripts/fetch-srd.ts` with:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { magicItemListSchema, spellListSchema } from "../src/data/srd-schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RULESETS = ["2014", "2024"] as const;
type Ruleset = (typeof RULESETS)[number];

const FETCH_LIMIT = 2000;
const CATASTROPHIC_SHRINK = 0.1;
const documentKey = (ruleset: Ruleset): string => (ruleset === "2024" ? "srd-2024" : "srd-2014");

type ResourceConfig = {
  name: string;
  url: (ruleset: Ruleset) => string;
  schema: z.ZodTypeAny;
};

const RESOURCES: ResourceConfig[] = [
  {
    name: "magicitems",
    url: (r) =>
      `https://api.open5e.com/v2/magicitems/?document=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: magicItemListSchema,
  },
  {
    name: "spells",
    // Spells use the Django-ORM-style `document__key=` lookup; the bare
    // `document=` filter on /v2/spells/ does NOT filter and returns
    // third-party content. See handoff Quirk 1.
    url: (r) =>
      `https://api.open5e.com/v2/spells/?document__key=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: spellListSchema,
  },
];

type Open5eListResponse = { count: number; results: unknown[] };

const fetchResource = async (
  resource: ResourceConfig,
  ruleset: Ruleset,
): Promise<Open5eListResponse> => {
  const res = await fetch(resource.url(ruleset));
  if (!res.ok)
    throw new Error(
      `Open5e fetch failed for ${resource.name} ${ruleset}: ${res.status} ${res.statusText}`,
    );
  const json = (await res.json()) as Open5eListResponse;
  if (json.count > json.results.length) {
    throw new Error(
      `SRD ${resource.name} ${ruleset} has ${json.count} rows, exceeding the ${FETCH_LIMIT}-row limit. Add pagination.`,
    );
  }
  return json;
};

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path}`);
};

const previousCount = (path: string): number | null => {
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return Array.isArray(json) ? json.length : null;
};

for (const resource of RESOURCES) {
  for (const ruleset of RULESETS) {
    const slimPath = resolve(__dirname, `../src/data/srd-${ruleset}-${resource.name}.json`);
    const rawPath = resolve(__dirname, `../data/srd-${ruleset}-${resource.name}.raw.json`);
    const previous = previousCount(slimPath);

    const raw = await fetchResource(resource, ruleset);
    const slim = resource.schema.parse(raw.results) as unknown[];

    if (previous !== null && slim.length < previous) {
      const lost = previous - slim.length;
      const fraction = lost / previous;
      if (fraction > CATASTROPHIC_SHRINK) {
        throw new Error(
          `SRD ${resource.name} ${ruleset} shrank from ${previous} to ${slim.length} (${(fraction * 100).toFixed(1)}% loss). Investigate before committing.`,
        );
      }
      console.warn(
        `  WARN: SRD ${resource.name} ${ruleset} shrank from ${previous} to ${slim.length} (-${lost})`,
      );
    }

    writeJson(rawPath, raw);
    writeJson(slimPath, slim);

    console.log(`  ${resource.name} ${ruleset}: ${slim.length} rows`);
  }
}
```

- [ ] **Step 2: Sanity-run on the existing magicitems pipeline**

Run: `npm run fetch:srd`
Expected: succeeds, writes both magicitems (no count change) and spells (~319 for 2014, ~339 for 2024). Confirm 4 raw files in `data/` and 4 slim files in `src/data/`.

- [ ] **Step 3: Commit fetch-srd refactor + bundled JSON**

```bash
git add scripts/fetch-srd.ts data/srd-2014-spells.raw.json data/srd-2024-spells.raw.json src/data/srd-2014-spells.json src/data/srd-2024-spells.json
git commit -m "feat(srd): bundle Open5e SRD spells; generalize fetch-srd to multiple resources"
```

(The magicitems raw/slim should be byte-identical to the prior run; if not, include those in the same commit.)

---

## Task 8: Add spell endpoint + hook

**Files:**
- Create: `src/api/endpoints/spells.ts`
- Create: `src/api/endpoints/spells.test.ts`
- Modify: `src/api/hooks.ts`

- [ ] **Step 1: Write the endpoint module**

Create `src/api/endpoints/spells.ts`:

```ts
import type { Spell } from "../../data/srd-schema";
import type { Ruleset } from "./magicItems";

export type { Ruleset };
export type SpellDetail = Spell & { ruleset: Ruleset };

export type SpellIndex = {
  count: number;
  results: Spell[];
};

const loadData = async (ruleset: Ruleset): Promise<Spell[]> => {
  const m =
    ruleset === "2024"
      ? await import("../../data/srd-2024-spells.json")
      : await import("../../data/srd-2014-spells.json");
  return m.default as Spell[];
};

export const fetchSpellIndex = async (ruleset: Ruleset): Promise<SpellIndex> => {
  const results = await loadData(ruleset);
  return { count: results.length, results };
};
```

- [ ] **Step 2: Write the endpoint test (mirroring magic items)**

Create `src/api/endpoints/spells.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { spellSchema } from "../../data/srd-schema";
import { fetchSpellIndex } from "./spells";

describe("fetchSpellIndex", () => {
  test("returns the bundled 2024 SRD spell index", async () => {
    const result = await fetchSpellIndex("2024");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThan(0);
    expect(() => spellSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns the bundled 2014 SRD spell index", async () => {
    const result = await fetchSpellIndex("2014");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThan(0);
    expect(() => spellSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns different data for 2014 vs 2024", async () => {
    const v2014 = await fetchSpellIndex("2014");
    const v2024 = await fetchSpellIndex("2024");

    const keys2014 = new Set(v2014.results.map((e) => e.key));
    const keys2024 = new Set(v2024.results.map((e) => e.key));
    const overlap = [...keys2024].filter((k) => keys2014.has(k));
    expect(overlap.length).toBeLessThan(v2024.count);
  });
});
```

Run: `npx vitest run src/api/endpoints/spells.test.ts`
Expected: PASS.

- [ ] **Step 3: Add `useSpellIndex` to `src/api/hooks.ts`**

Append:

```ts
import { fetchSpellIndex } from "./endpoints/spells";

export const useSpellIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["spells", ruleset, "index"],
    queryFn: () => fetchSpellIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/api/endpoints/spells.ts src/api/endpoints/spells.test.ts src/api/hooks.ts
git commit -m "feat(api): bundled spell index endpoint and React Query hook"
```

---

## Task 9: Add spell factories

**Files:**
- Modify: `src/api/factories.ts`

- [ ] **Step 1: Append spell factories**

First, merge the `Spell` type into the existing srd-schema import line. Change:
```ts
import type { MagicItem } from "../data/srd-schema";
```
to:
```ts
import type { MagicItem, Spell } from "../data/srd-schema";
```

Then append the new imports + factories at the bottom of the file:

```ts
import type { SpellDetail, SpellIndex } from "./endpoints/spells";

const spellSchools = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
];

const castingTimes = ["action", "bonus-action", "reaction", "minute", "hour"] as const;

const spellClasses = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];

export const spellIndexEntryFactory = Factory.define<Spell>(() => {
  const slug = faker.helpers
    .slugify(`${faker.lorem.words(2)}-${faker.string.alphanumeric(5)}`)
    .toLowerCase();
  return {
    key: open5eKey(slug),
    name: faker.lorem.words(2),
    level: faker.number.int({ min: 0, max: 9 }),
    school: { name: faker.helpers.arrayElement(spellSchools) },
    casting_time: faker.helpers.arrayElement(castingTimes),
    ritual: false,
    range_text: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    verbal: true,
    somatic: true,
    material: false,
    material_specified: "",
    classes: [{ name: faker.helpers.arrayElement(spellClasses) }],
    desc: faker.lorem.paragraph(),
    higher_level: "",
  };
});

type SpellIndexTransient = { size: number };

export const spellIndexFactory = Factory.define<SpellIndex, SpellIndexTransient>(
  ({ transientParams }) => {
    const size = transientParams.size ?? 3;
    const results = spellIndexEntryFactory.buildList(size);
    return { count: results.length, results };
  },
);

export const spellDetailFactory = Factory.define<SpellDetail>(() => ({
  ...spellIndexEntryFactory.build(),
  ruleset: "2024",
}));
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/factories.ts
git commit -m "test(api): add spell factories"
```

---

## Task 10: Spell mapper (TDD)

**Files:**
- Create: `src/api/mappers/spells.ts`
- Create: `src/api/mappers/spells.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/api/mappers/spells.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { spellCardSchema } from "../../decks/schema";
import { spellDetailFactory } from "../factories";
import { spellDetailToCard } from "./spells";

describe("spellDetailToCard", () => {
  test("output is a valid SpellCard", () => {
    const detail = spellDetailFactory.build();
    const card = spellDetailToCard(detail);
    expect(spellCardSchema.safeParse(card).success).toBe(true);
  });

  test("apiRef carries open5e system, the detail key as slug, and the ruleset", () => {
    const detail = spellDetailFactory.build({ key: "srd-2024_fireball" });
    const card = spellDetailToCard(detail);
    expect(card.apiRef).toEqual({ system: "open5e", slug: "srd-2024_fireball", ruleset: "2024" });
  });

  test("source is 'api', kind is 'spell', iconKey is 'magic-swirl'", () => {
    const detail = spellDetailFactory.build();
    const card = spellDetailToCard(detail);
    expect(card.kind).toBe("spell");
    expect(card.source).toBe("api");
    expect(card.iconKey).toBe("magic-swirl");
  });

  // --- Header tag 1: level + school ---
  test("level 0 → 'School cantrip' with capitalized school", () => {
    const detail = spellDetailFactory.build({ level: 0, school: { name: "divination" } });
    const card = spellDetailToCard(detail);
    expect(card.headerTags[0]).toBe("Divination cantrip");
  });

  test("level 1 → '1st-level school' with lowercase school", () => {
    const detail = spellDetailFactory.build({ level: 1, school: { name: "Evocation" } });
    const card = spellDetailToCard(detail);
    expect(card.headerTags[0]).toBe("1st-level evocation");
  });

  test("level 2 → '2nd-level …'", () => {
    const detail = spellDetailFactory.build({ level: 2, school: { name: "evocation" } });
    expect(spellDetailToCard(detail).headerTags[0]).toBe("2nd-level evocation");
  });

  test("level 3 → '3rd-level …'", () => {
    const detail = spellDetailFactory.build({ level: 3, school: { name: "evocation" } });
    expect(spellDetailToCard(detail).headerTags[0]).toBe("3rd-level evocation");
  });

  test("level 4..9 → 'Nth-level …'", () => {
    for (const level of [4, 5, 6, 7, 8, 9] as const) {
      const detail = spellDetailFactory.build({ level, school: { name: "evocation" } });
      expect(spellDetailToCard(detail).headerTags[0]).toBe(`${level}th-level evocation`);
    }
  });

  // --- Header tag 2: casting time ---
  // 2024 unit-only values (Open5e v2 strips the count: handoff Quirk 2)
  test.each([
    ["action", "1 action"],
    ["bonus-action", "1 bonus action"],
    ["reaction", "1 reaction"],
    ["minute", "1 minute"],
    ["hour", "1 hour"],
  ] as const)("2024 casting_time %s → %s", (input, expected) => {
    const detail = spellDetailFactory.build({ casting_time: input, ritual: false });
    expect(spellDetailToCard(detail).headerTags[1]).toBe(expected);
  });

  // 2014 concatenated values (the 2014 SRD on Open5e v2 preserves the count)
  test.each([
    ["1minute", "1 minute"],
    ["10minutes", "10 minutes"],
    ["1hour", "1 hour"],
    ["8hours", "8 hours"],
    ["12hours", "12 hours"],
    ["24hours", "24 hours"],
  ] as const)("2014 casting_time %s → %s", (input, expected) => {
    const detail = spellDetailFactory.build({ casting_time: input, ritual: false });
    expect(spellDetailToCard(detail).headerTags[1]).toBe(expected);
  });

  test("ritual: true appends ' (ritual)' to the casting time tag (2024 form)", () => {
    const detail = spellDetailFactory.build({ casting_time: "minute", ritual: true });
    expect(spellDetailToCard(detail).headerTags[1]).toBe("1 minute (ritual)");
  });

  test("ritual: true appends ' (ritual)' to the casting time tag (2014 form)", () => {
    const detail = spellDetailFactory.build({ casting_time: "10minutes", ritual: true });
    expect(spellDetailToCard(detail).headerTags[1]).toBe("10 minutes (ritual)");
  });

  // --- Header tag 3: range ---
  test("range tag is range_text verbatim", () => {
    const detail = spellDetailFactory.build({ range_text: "150 feet" });
    expect(spellDetailToCard(detail).headerTags[2]).toBe("150 feet");
  });

  // --- Header tag 4: duration ---
  test("duration 'instantaneous' is capitalized", () => {
    const detail = spellDetailFactory.build({ duration: "instantaneous", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Instantaneous");
  });

  test("duration '10 minute' pluralizes to '10 minutes'", () => {
    const detail = spellDetailFactory.build({ duration: "10 minute", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("10 minutes");
  });

  test("duration '8 hour' pluralizes to '8 hours'", () => {
    const detail = spellDetailFactory.build({ duration: "8 hour", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("8 hours");
  });

  test("singular duration '1 minute' stays singular", () => {
    const detail = spellDetailFactory.build({ duration: "1 minute", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("1 minute");
  });

  test("'until dispelled' is capitalized", () => {
    const detail = spellDetailFactory.build({ duration: "until dispelled", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Until dispelled");
  });

  test("empty duration drops the duration tag entirely (2024 has '' on some spells)", () => {
    const detail = spellDetailFactory.build({ duration: "", concentration: false });
    const card = spellDetailToCard(detail);
    // Header should have only 3 tags: level+school, casting time, range. No duration.
    expect(card.headerTags).toHaveLength(3);
  });

  test("'special' duration is capitalized", () => {
    const detail = spellDetailFactory.build({ duration: "special", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Special");
  });

  test("2014 already-pluralized '10 minutes' stays '10 minutes'", () => {
    const detail = spellDetailFactory.build({ duration: "10 minutes", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("10 minutes");
  });

  test("concentration prefixes the duration", () => {
    const detail = spellDetailFactory.build({ duration: "1 minute", concentration: true });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Concentration, up to 1 minute");
  });

  test("concentration with quantified plural duration", () => {
    const detail = spellDetailFactory.build({ duration: "10 minute", concentration: true });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Concentration, up to 10 minutes");
  });

  // --- Footer tag 1: components ---
  test("V/S/M booleans build the components tag in order, joined by ', '", () => {
    const detail = spellDetailFactory.build({
      verbal: true,
      somatic: true,
      material: true,
      material_specified: "a tiny ball of bat guano and sulfur",
    });
    expect(spellDetailToCard(detail).footerTags[0]).toBe(
      "V, S, M (a tiny ball of bat guano and sulfur)",
    );
  });

  test("only V + S → 'V, S'", () => {
    const detail = spellDetailFactory.build({
      verbal: true,
      somatic: true,
      material: false,
      material_specified: "",
    });
    expect(spellDetailToCard(detail).footerTags[0]).toBe("V, S");
  });

  test("material true with empty material_specified → 'M' without parens", () => {
    const detail = spellDetailFactory.build({
      verbal: false,
      somatic: false,
      material: true,
      material_specified: "",
    });
    expect(spellDetailToCard(detail).footerTags[0]).toBe("M");
  });

  // --- Footer tag 2: classes ---
  test("classes are joined alphabetically by name", () => {
    const detail = spellDetailFactory.build({
      classes: [{ name: "Wizard" }, { name: "Sorcerer" }],
    });
    expect(spellDetailToCard(detail).footerTags[1]).toBe("Sorcerer, Wizard");
  });

  test("single class still rendered", () => {
    const detail = spellDetailFactory.build({ classes: [{ name: "Cleric" }] });
    expect(spellDetailToCard(detail).footerTags[1]).toBe("Cleric");
  });

  // --- Body ---
  test("body is desc verbatim when higher_level is empty", () => {
    const detail = spellDetailFactory.build({ desc: "A bright streak.", higher_level: "" });
    expect(spellDetailToCard(detail).body).toBe("A bright streak.");
  });

  test("body appends an 'At Higher Levels' block when higher_level is non-empty", () => {
    const detail = spellDetailFactory.build({
      desc: "A bright streak.",
      higher_level: "When you cast this spell using a spell slot of 4th level or higher…",
    });
    expect(spellDetailToCard(detail).body).toBe(
      "A bright streak.\n\n***At Higher Levels.*** When you cast this spell using a spell slot of 4th level or higher…",
    );
  });

  // --- Full canonical Fireball-shaped example ---
  test("Fireball-shaped detail produces the canonical headerTags + footerTags", () => {
    const detail = spellDetailFactory.build({
      level: 3,
      school: { name: "evocation" },
      casting_time: "action",
      ritual: false,
      range_text: "150 feet",
      duration: "instantaneous",
      concentration: false,
      verbal: true,
      somatic: true,
      material: true,
      material_specified: "a tiny ball of bat guano and sulfur",
      classes: [{ name: "Wizard" }, { name: "Sorcerer" }],
    });
    const card = spellDetailToCard(detail);
    expect(card.headerTags).toEqual([
      "3rd-level evocation",
      "1 action",
      "150 feet",
      "Instantaneous",
    ]);
    expect(card.footerTags).toEqual([
      "V, S, M (a tiny ball of bat guano and sulfur)",
      "Sorcerer, Wizard",
    ]);
  });

  // --- Guidance-shaped (concentration cantrip) ---
  test("Guidance-shaped detail produces the canonical headerTags + footerTags", () => {
    const detail = spellDetailFactory.build({
      level: 0,
      school: { name: "divination" },
      casting_time: "action",
      ritual: false,
      range_text: "Touch",
      duration: "1 minute",
      concentration: true,
      verbal: true,
      somatic: true,
      material: false,
      material_specified: "",
      classes: [{ name: "Druid" }, { name: "Cleric" }],
    });
    const card = spellDetailToCard(detail);
    expect(card.headerTags).toEqual([
      "Divination cantrip",
      "1 action",
      "Touch",
      "Concentration, up to 1 minute",
    ]);
    expect(card.footerTags).toEqual(["V, S", "Cleric, Druid"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api/mappers/spells.test.ts`
Expected: FAIL — `spellDetailToCard` not exported / file not found.

- [ ] **Step 3: Implement the mapper**

Create `src/api/mappers/spells.ts`:

```ts
import type { SpellCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { SpellDetail } from "../endpoints/spells";

const ordinal = (n: number): string => {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
};

const levelTag = (level: number, schoolName: string): string => {
  if (level === 0) {
    const cap = schoolName.charAt(0).toUpperCase() + schoolName.slice(1).toLowerCase();
    return `${cap} cantrip`;
  }
  return `${ordinal(level)}-level ${schoolName.toLowerCase()}`;
};

// 2014 SRD packs the count into casting_time (e.g. "10minutes"); 2024 strips it
// (e.g. just "minute"). Parse out a quantity if present, otherwise default to 1.
const CONCATENATED_CASTING = /^(\d+)(minute|hour|day|round|turn)s?$/i;

const castingTimeTag = (castingTime: string, ritual: boolean): string => {
  let qty = 1;
  let unit: string;
  const m = CONCATENATED_CASTING.exec(castingTime);
  if (m) {
    qty = Number(m[1]);
    unit = m[2].toLowerCase();
  } else if (castingTime === "bonus-action") {
    unit = "bonus action";
  } else {
    unit = castingTime; // "action" | "reaction" | "minute" | "hour"
  }
  const word = qty === 1 ? unit : `${unit}s`;
  const base = `${qty} ${word}`;
  return ritual ? `${base} (ritual)` : base;
};

// 2024 returns singular units (e.g. "10 minute"); 2014 returns plural ("10 minutes").
const QUANTIFIED_DURATION = /^(\d+)\s+(minute|hour|day|round|turn)s?$/i;

const formatDuration = (duration: string): string => {
  const trimmed = duration.trim();
  if (trimmed === "") return "";
  const match = QUANTIFIED_DURATION.exec(trimmed);
  if (match) {
    const [, qty, unit] = match;
    const n = Number(qty);
    const pluralized = n === 1 ? unit.toLowerCase() : `${unit.toLowerCase()}s`;
    return `${qty} ${pluralized}`;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const durationTag = (duration: string, concentration: boolean): string => {
  const formatted = formatDuration(duration);
  if (!concentration) return formatted;
  if (formatted === "") return "Concentration";
  return `Concentration, up to ${formatted.toLowerCase()}`;
};

const componentsTag = (
  verbal: boolean,
  somatic: boolean,
  material: boolean,
  materialSpecified: string,
): string => {
  const pieces: string[] = [];
  if (verbal) pieces.push("V");
  if (somatic) pieces.push("S");
  if (material) {
    pieces.push(materialSpecified.length > 0 ? `M (${materialSpecified})` : "M");
  }
  return pieces.join(", ");
};

const classesTag = (classes: { name: string }[]): string =>
  [...classes.map((c) => c.name)].sort((a, b) => a.localeCompare(b)).join(", ");

const buildBody = (desc: string, higherLevel: string): string => {
  if (higherLevel.trim() === "") return desc;
  return `${desc}\n\n***At Higher Levels.*** ${higherLevel}`;
};

export const spellDetailToCard = (detail: SpellDetail): SpellCard => {
  const now = nowIso();
  const headerTags: string[] = [
    levelTag(detail.level, detail.school.name),
    castingTimeTag(detail.casting_time, detail.ritual),
    detail.range_text,
    durationTag(detail.duration, detail.concentration),
  ].filter((t) => t !== "");
  const footerTags: string[] = [
    componentsTag(detail.verbal, detail.somatic, detail.material, detail.material_specified),
    classesTag(detail.classes),
  ];
  return {
    id: newId(),
    kind: "spell",
    name: detail.name,
    headerTags,
    body: buildBody(detail.desc, detail.higher_level),
    footerTags,
    source: "api",
    apiRef: { system: "open5e", slug: detail.key, ruleset: detail.ruleset },
    iconKey: "magic-swirl",
    createdAt: now,
    updatedAt: now,
  };
};
```

- [ ] **Step 4: Run the tests until green**

Run: `npx vitest run src/api/mappers/spells.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/mappers/spells.ts src/api/mappers/spells.test.ts
git commit -m "feat(api): map Open5e spell detail to SpellCard"
```

---

## Task 11: BrowseApiModal — kind toggle, title, SRD notice, spell branch

**Files:**
- Modify: `src/views/BrowseApiModal.tsx`
- Modify: `src/views/BrowseApiModal.module.css`
- Modify: `src/views/BrowseApiModal.test.tsx`

- [ ] **Step 1: Update the modal to support both kinds**

Replace the contents of `src/views/BrowseApiModal.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import type { Ruleset } from "../api/endpoints/magicItems";
import { useMagicItemIndex, useSpellIndex } from "../api/hooks";
import { magicItemDetailToCard } from "../api/mappers/magicItems";
import { spellDetailToCard } from "../api/mappers/spells";
import type { MagicItem, Spell } from "../data/srd-schema";
import { useSaveCard } from "../decks/mutations";
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { Link } from "../lib/ui/Link";
import { LoadingState } from "../lib/ui/LoadingState";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import styles from "./BrowseApiModal.module.css";

type Kind = "items" | "spells";

type Props = {
  deckId: string;
  onClose: () => void;
  onSelected: (cardId: string) => void;
};

export function BrowseApiModal({ deckId, onClose, onSelected }: Props) {
  const [kind, setKind] = useState<Kind>("items");
  const [ruleset, setRuleset] = useState<Ruleset>("2024");
  const [query, setQuery] = useState("");
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const itemIndex = useMagicItemIndex(ruleset);
  const spellIndex = useSpellIndex(ruleset);
  const index = kind === "items" ? itemIndex : spellIndex;
  const saveCard = useSaveCard();

  const filtered = useMemo(() => {
    const all = index.data?.results ?? [];
    if (query.trim() === "") return all;
    const q = query.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [index.data, query]);

  const handlePick = async (entry: MagicItem | Spell) => {
    if (pickingKey !== null) return;
    setPickingKey(entry.key);
    setPickError(null);
    try {
      const card =
        kind === "items"
          ? magicItemDetailToCard({ ...(entry as MagicItem), ruleset })
          : spellDetailToCard({ ...(entry as Spell), ruleset });
      await saveCard.mutateAsync({ card, deckId, isNew: true });
      onSelected(card.id);
    } catch (err) {
      setPickError(
        err instanceof Error ? err.message : "Couldn't add this card. Please try again.",
      );
    } finally {
      setPickingKey(null);
    }
  };

  const placeholder = kind === "items" ? "Search magic items…" : "Search spells…";
  const emptyMessage = kind === "items" ? "No items match your search." : "No spells match your search.";
  const errorMessage =
    kind === "items" ? "Couldn't load the magic-items list." : "Couldn't load the spells list.";

  return (
    <DialogShell
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label="Browse SRD"
      size="md"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <>
          <DialogHeader title="Browse SRD" onClose={onClose}>
            <div className={styles.toggles}>
              <ToggleButtonGroup
                aria-label="Browse kind"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[kind]}
                onSelectionChange={(keys) => {
                  const next = Array.from(keys)[0];
                  if (next === "items" || next === "spells") setKind(next);
                }}
              >
                <ToggleButton id="items">Items</ToggleButton>
                <ToggleButton id="spells">Spells</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                aria-label="Ruleset"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[ruleset]}
                onSelectionChange={(keys) => {
                  const next = Array.from(keys)[0];
                  if (next === "2014" || next === "2024") setRuleset(next);
                }}
              >
                <ToggleButton id="2014">2014</ToggleButton>
                <ToggleButton id="2024">2024</ToggleButton>
              </ToggleButtonGroup>
            </div>
          </DialogHeader>

          <p className={styles.notice}>
            Only SRD spells and items are available here. See the{" "}
            <Link
              href="https://en.wikipedia.org/wiki/System_Reference_Document"
              target="_blank"
              rel="noopener noreferrer"
            >
              SRD
            </Link>{" "}
            for what's covered.
          </p>

          <div className={styles.searchRow}>
            <TextField aria-label={placeholder} className={styles.searchField}>
              <Input
                type="search"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </TextField>
          </div>

          <div className={styles.results}>
            {index.isLoading && <LoadingState />}
            {index.isError && (
              <div className={styles.state} role="alert">
                {errorMessage}
                <div className={styles.errorActions}>
                  <Button variant="secondary" size="sm" onPress={() => index.refetch()}>
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {index.isSuccess && filtered.length === 0 && (
              <div className={styles.state}>{emptyMessage}</div>
            )}
            {pickError && (
              <div className={styles.state} role="alert">
                {pickError}
              </div>
            )}
            {index.isSuccess &&
              filtered.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={styles.row}
                  onClick={() => handlePick(entry)}
                  disabled={pickingKey !== null}
                >
                  <span className={styles.rowName}>{entry.name}</span>
                  {pickingKey === entry.key && <span className={styles.rowMeta}>Loading…</span>}
                </button>
              ))}
          </div>
        </>
      )}
    </DialogShell>
  );
}
```

- [ ] **Step 2: Add `.toggles` and `.notice` CSS in `BrowseApiModal.module.css`**

Append:

```css
.toggles {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.notice {
  margin: 0 var(--space-4) var(--space-3);
  font-size: 0.875rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}
```

(If `--color-text-muted` doesn't exist, swap for the closest available muted-text token in `src/index.css`. Spot-check with `grep -n -- '--color-text' src/index.css`.)

- [ ] **Step 3: Update `BrowseApiModal.test.tsx`**

Adjust the existing magic-item tests to match the new behavior + add a spell-side test. Replace the file with:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { type ReactNode, StrictMode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";
import type { SpellIndex } from "../api/endpoints/spells";
import { magicItemIndexEntryFactory, spellIndexEntryFactory } from "../api/factories";
import { makeCardRow } from "../test/factories";
import { SB_URL, server } from "../test/msw";
import { BrowseApiModal } from "./BrowseApiModal";

const itemKey = (ruleset: Ruleset) => ["magic-items", ruleset, "index"];
const spellKey = (ruleset: Ruleset) => ["spells", ruleset, "index"];

type Seeds = {
  items?: Partial<Record<Ruleset, MagicItemIndex>>;
  spells?: Partial<Record<Ruleset, SpellIndex>>;
};

const makeClient = (seeds: Seeds = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [ruleset, body] of Object.entries(seeds.items ?? {}) as [Ruleset, MagicItemIndex][]) {
    client.setQueryData(itemKey(ruleset), body);
  }
  for (const [ruleset, body] of Object.entries(seeds.spells ?? {}) as [Ruleset, SpellIndex][]) {
    client.setQueryData(spellKey(ruleset), body);
  }
  return client;
};

const wrap = (ui: ReactNode, client: QueryClient) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

describe("<BrowseApiModal>", () => {
  test("shows index entries once the items list loads", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ items: { "2024": { count: 2, results: [entryA, entryB] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    expect(await screen.findByRole("button", { name: "Bag of Holding" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cloak of Protection" })).toBeInTheDocument();
  });

  test("search filters the items list", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ items: { "2024": { count: 2, results: [entryA, entryB] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: "Bag of Holding" });
    await userEvent.type(screen.getByRole("searchbox"), "bag");

    expect(screen.getByRole("button", { name: "Bag of Holding" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cloak of Protection" })).not.toBeInTheDocument();
  });

  test("switching ruleset loads a different items list", async () => {
    const v2024 = magicItemIndexEntryFactory.build({ name: "Ring A" });
    const v2014 = magicItemIndexEntryFactory.build({ name: "Ring Z" });
    const client = makeClient({
      items: {
        "2024": { count: 1, results: [v2024] },
        "2014": { count: 1, results: [v2014] },
      },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: "Ring A" });
    await userEvent.click(screen.getByRole("radio", { name: "2014" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Ring Z" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Ring A" })).not.toBeInTheDocument();
  });

  test("switching kind to Spells swaps the list source", async () => {
    const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const spell = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [item] } },
      spells: { "2024": { count: 1, results: [spell] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: "Bag of Holding" });
    await userEvent.click(screen.getByRole("radio", { name: "Spells" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Fireball" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Bag of Holding" })).not.toBeInTheDocument();
  });

  test("clicking an item POSTs a card with kind:item", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(await screen.findByRole("button", { name: "Bag of Holding" }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost.mock.calls[0]?.[0]?.payload?.kind).toBe("item");
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("clicking a spell POSTs a card with kind:spell", async () => {
    const entry = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({ spells: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await userEvent.click(screen.getByRole("radio", { name: "Spells" }));
    await userEvent.click(await screen.findByRole("button", { name: "Fireball" }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost.mock.calls[0]?.[0]?.payload?.kind).toBe("spell");
  });

  test("clicking the same row only POSTs once even under StrictMode double-render", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Flame Tongue" });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );

    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />
        </QueryClientProvider>
      </StrictMode>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Flame Tongue" }));

    await waitFor(() => expect(onPost).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPost).toHaveBeenCalledTimes(1);
  });

  test("Escape calls onClose", async () => {
    const onClose = vi.fn();
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={onClose} onSelected={() => {}} />, client);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("renders the SRD notice with a link", async () => {
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });
    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);
    expect(
      await screen.findByRole("link", { name: "SRD" }),
    ).toHaveAttribute("href", "https://en.wikipedia.org/wiki/System_Reference_Document");
  });
});
```

- [ ] **Step 4: Run modal tests**

Run: `npx vitest run src/views/BrowseApiModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/BrowseApiModal.tsx src/views/BrowseApiModal.module.css src/views/BrowseApiModal.test.tsx
git commit -m "feat(browse): add kind picker (items/spells) and SRD notice"
```

---

## Task 12: EditorView — drop "items only" rejection, update import-hint copy

**Files:**
- Modify: `src/views/EditorView.tsx`
- Modify: `src/views/EditorView.test.tsx`

- [ ] **Step 1: Widen `EditorView.tsx`**

In `src/views/EditorView.tsx`:

1. Update the import:
   ```ts
   import type { ItemCard, RenderableCard } from "../cards/types";
   ```

2. Replace the `isPristineNewCard` parameter type:
   ```ts
   const isPristineNewCard = (card: RenderableCard): boolean =>
   ```

3. Drop the kind rejection. Replace:
   ```ts
   if (existing && existing.kind !== "item") return <p>Only item cards are supported in v1.</p>;
   ```
   with:
   ```ts
   if (existing && existing.kind !== "item" && existing.kind !== "spell")
     return <p>This card kind isn't editable yet.</p>;
   ```

4. Widen the draft state. Replace:
   ```ts
   const [draft, setDraft] = useState<ItemCard | null>(
     initial && initial.kind === "item" ? initial : null,
   );

   useEffect(() => {
     if (initial && initial.kind === "item") setDraft(initial);
   }, [initial]);
   ```
   with:
   ```ts
   const [draft, setDraft] = useState<RenderableCard | null>(
     initial && (initial.kind === "item" || initial.kind === "spell") ? initial : null,
   );

   useEffect(() => {
     if (initial && (initial.kind === "item" || initial.kind === "spell")) setDraft(initial);
   }, [initial]);
   ```

5. Widen the measurement type:
   ```ts
   const measurementCard = useMemo<RenderableCard | null>(
     () => (draft ? { ...draft, body: debouncedBody } : null),
     [draft, debouncedBody],
   );
   ```

6. The stub still creates `kind: "item"` (custom new-card flow stays item-typed; spell creation from scratch is out of scope). Keep:
   ```ts
   const stub: ItemCard | null = useMemo(() => { ... }, [isNew]);
   ```

7. Update the import-hint button label:
   ```tsx
   <Button variant="secondary" onPress={() => setBrowseOpen(true)}>
     Browse Catalog
   </Button>
   ```

   And update the surrounding hint copy:
   ```tsx
   <span>
     Importing from the{" "}
     <Link ...>SRD</Link>
     ? Browse the catalog instead.
   </span>
   ```

   (Already mostly says that — confirm wording stays "Browse the catalog instead." not "Browse items instead.")

- [ ] **Step 2: Update `EditorView.test.tsx`**

Two assertions need updating:

1. Replace:
   ```ts
   await userEvent.click(within(hint).getByRole("button", { name: /browse items/i }));
   ```
   with:
   ```ts
   await userEvent.click(within(hint).getByRole("button", { name: /browse catalog/i }));
   ```
   (in both tests that click the import-hint button — there are two)

2. Replace:
   ```ts
   expect(await screen.findByRole("dialog", { name: /browse magic items/i })).toBeInTheDocument();
   ```
   with:
   ```ts
   expect(await screen.findByRole("dialog", { name: /browse srd/i })).toBeInTheDocument();
   ```

- [ ] **Step 3: Run editor tests**

Run: `npx vitest run src/views/EditorView.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/EditorView.tsx src/views/EditorView.test.tsx
git commit -m "feat(editor): allow editing imported spells; rename import-hint to Browse Catalog"
```

---

## Task 13: PrintView + DeckView — include spells

**Files:**
- Modify: `src/views/PrintView.tsx`
- Modify: `src/views/PrintView.test.tsx` (if it asserts copy)
- Modify: `src/views/DeckView.tsx`

- [ ] **Step 1: Update PrintView filter and copy**

In `src/views/PrintView.tsx`:

1. Replace:
   ```ts
   import type { ItemCard } from "../cards/types";
   ```
   with:
   ```ts
   import type { RenderableCard } from "../cards/types";
   ```

2. Replace:
   ```ts
   const items = cards.filter((c): c is ItemCard => c.kind === "item");
   ```
   with:
   ```ts
   const printable = cards.filter(
     (c): c is RenderableCard => c.kind === "item" || c.kind === "spell",
   );
   const { physicalCards } = useExpandedCards(printable, perPage);
   ```

3. Replace `items.length` references in the JSX (Print button `isDisabled`, empty-state guard) with `printable.length`.

4. Update the empty-state copy:
   ```tsx
   {printable.length === 0 && <p>No printable cards in this deck yet.</p>}
   ```

- [ ] **Step 2: Check `PrintView.test.tsx` for breakage**

Run: `npx vitest run src/views/PrintView.test.tsx`
Expected: PASS — if a test asserts the old "No item cards in this deck yet." copy, update it to "No printable cards in this deck yet."

- [ ] **Step 3: Drop the stale `kind === "item"` guard in `DeckView.tsx`**

In `src/views/DeckView.tsx` around line 91, change:
```tsx
{card.kind === "item" && card.headerTags.length > 0 && (
  <span className={styles.headerTags}>{card.headerTags.join(" | ")}</span>
)}
```
to:
```tsx
{card.headerTags.length > 0 && (
  <span className={styles.headerTags}>{card.headerTags.join(" | ")}</span>
)}
```

After Task 1, `headerTags` lives on every kind via `BaseCard`, so the kind narrow is no longer needed for type safety — and leaving it would silently suppress imported-spell tags from the deck list. If `DeckView.test.tsx` has assertions that depend on the guard's behavior (it shouldn't — items still render their tags identically), update them.

Run: `npx vitest run src/views/DeckView.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.test.tsx src/views/DeckView.tsx src/views/DeckView.test.tsx
git commit -m "feat(views): include spell cards in print sheet and deck list"
```

---

## Task 14: Final verification

**Files:** none modified.

- [ ] **Step 1: Full unit test run**

Run: `npm test`
Expected: PASS — all green.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS. If Biome reports formatting issues, run `npm run lint:fix` and commit any formatting-only changes:
```bash
git add -A
git commit -m "chore: biome formatting"
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS — including `tsc -b` and `vite build`.

- [ ] **Step 5: Schema-drift check**

Run: `npm run check:schema`
Expected: PASS.

- [ ] **Step 6: Manual smoke (dev server)**

Run: `npm run dev`, open the deck editor, click "Browse Catalog":
- Verify the dialog title is "Browse SRD".
- Switch to "Spells", search for "Fireball", click it.
- Confirm the editor loads with header tags `["3rd-level evocation", "1 action", "150 feet", "Instantaneous"]` and footer tags `["V, S, M (...)", "Sorcerer, Wizard"]`.
- Edit the body, save, navigate back, confirm the spell renders in deck view + print preview.
- Switch ruleset to 2014; verify the spell list reloads and contains 2014-only entries (e.g., spells removed in 2024).

(If markdown support hasn't landed yet, the body will show `***At Higher Levels.***` literal — log it but don't gate the task on it.)

- [ ] **Step 7: Final summary commit (if any straggler edits)**

If steps 1–6 produced no new changes, skip. Otherwise commit a single cleanup.

---

## Out of scope (per handoff)

- Per-spell icon resolution (issue #32) — every spell uses `magic-swirl`.
- Visual differentiation between spell and item icons (rectangle vs circle) — explicitly deferred by the user.
- Differentiating spell vs item in the deck view list — mixed list is fine.
- Brief preview info in the browse modal — title-only is fine.
- Migrating any existing spell rows in prod — there are none.
- LLM-generated spell summaries.
- Markdown rendering of `***At Higher Levels.***` — assumed to be landed by another implementer; if not, the literal markers display until then.
