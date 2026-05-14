# Browse SRD — All tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "All" content type to the SRD browse dialog that merges items and spells into one searchable list and prepends a kind tag (`Item · …` / `Spell · …`) to each row's meta column. Make it the default tab.

**Architecture:** A new `allContentType` composed in `src/api/content-types/all.ts` calls the three existing index hooks (magic items, mundane items, spells), tags each entry with `__source`, and produces `ContentRow`s with a `kindLabel`. `BrowseApiModal` row renderer prepends `kindLabel · ` when `type.id === "all"`. A new `emptyMessage` field on `ContentType` replaces the current `No ${type.label.toLowerCase()} match…` interpolation so the new tab can read "No results match your search." rather than the broken "No all match your search."

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, react-aria-components, fuzzysort, vitest + RTL + MSW + Fishery factories.

**Spec:** `docs/superpowers/specs/2026-05-14-browse-all-tab-design.md`

---

## File Structure

Files this plan creates or modifies:

- `src/api/content-types/types.ts` — modify: add `kindLabel?: string` to `ContentRow`; add `emptyMessage: string` to `ContentType`.
- `src/api/content-types/items.ts` — modify: add `emptyMessage`.
- `src/api/content-types/spells.ts` — modify: add `emptyMessage`.
- `src/api/content-types/all.ts` — create: the new `allContentType`.
- `src/api/content-types/index.ts` — modify: register `allContentType` first.
- `src/views/BrowseApiModal.tsx` — modify: read `type.emptyMessage`; prepend `row.kindLabel · ` when `type.id === "all"`.
- `src/views/BrowseApiModal.test.tsx` — modify: update tablist test; add All-tab assertions for kind tag presence/absence and empty-state copy.

`itemsContentType` and `spellsContentType` are otherwise untouched.

---

## Task 1: Add `kindLabel` to `ContentRow`

Pure type-only addition. No runtime behaviour changes. Setting up the surface that Task 2 will populate and Task 3 will read.

**Files:**
- Modify: `src/api/content-types/types.ts`

- [ ] **Step 1: Add the optional field**

Open `src/api/content-types/types.ts`. The current `ContentRow` is:

```ts
export type ContentRow = {
  key: string;
  name: string;
  meta: string;
  toCard: () => Card;
};
```

Replace with:

```ts
export type ContentRow = {
  key: string;
  name: string;
  meta: string;
  kindLabel?: string;
  toCard: () => Card;
};
```

- [ ] **Step 2: Verify the suite still passes**

Run: `npm test -- --run`
Expected: 773 tests pass. No new tests yet — this is a structural prep step.

- [ ] **Step 3: Commit**

```bash
git add src/api/content-types/types.ts
git commit -m "refactor(content-types): add optional kindLabel to ContentRow"
```

---

## Task 2: Build `allContentType` and register it first

The merge logic. Tests are written before the implementation. The existing tablist test breaks here and is updated as part of this task because the change is intrinsic to placing All first.

**Files:**
- Create: `src/api/content-types/all.ts`
- Modify: `src/api/content-types/index.ts`
- Modify: `src/views/BrowseApiModal.test.tsx`

- [ ] **Step 1: Write failing tests in `BrowseApiModal.test.tsx`**

Update the existing tablist-order test to expect three tabs in the new order:

```ts
test("renders the registered types as a vertical tablist in registry order", async () => {
  const client = makeClient();
  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((t) => t.textContent)).toEqual(["All", "Items", "Spells"]);
});
```

Add a new test asserting All is selected by default. Place it directly after the tablist-order test:

```ts
test("All tab is selected by default", async () => {
  const client = makeClient();
  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
});
```

Add a new test asserting items and spells interleave alphabetically on the All tab. Place it after the "All tab is selected by default" test:

```ts
test("All tab merges items and spells alphabetically", async () => {
  const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
  const spell = spellIndexEntryFactory.build({ name: "Fireball" });
  const client = makeClient({
    items: { "2024": { count: 1, results: [item] } },
    spells: { "2024": { count: 1, results: [spell] } },
  });

  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  await screen.findByRole("button", { name: /Bag of Holding/ });
  const rows = screen.getAllByRole("button", { name: /Bag of Holding|Fireball/ });
  const names = rows.map((b) => b.textContent ?? "");
  const bagIdx = names.findIndex((n) => /Bag of Holding/.test(n));
  const fireIdx = names.findIndex((n) => /Fireball/.test(n));
  expect(bagIdx).toBeGreaterThanOrEqual(0);
  expect(fireIdx).toBeGreaterThanOrEqual(0);
  expect(bagIdx).toBeLessThan(fireIdx);
});
```

- [ ] **Step 2: Run tests to verify the three new/updated cases fail**

Run: `npm test -- --run src/views/BrowseApiModal.test.tsx`

Expected failures:
- "renders the registered types as a vertical tablist in registry order" — fails because tablist currently reads `["Items", "Spells"]`.
- "All tab is selected by default" — fails because no "All" tab exists yet.
- "All tab merges items and spells alphabetically" — fails (no All tab, only the magic item appears).

- [ ] **Step 3: Create `src/api/content-types/all.ts`**

Write the complete file:

```ts
import fuzzysort from "fuzzysort";
import { useMemo } from "react";
import type { MagicItem, MundaneItem, Spell } from "../../data/srd-schema";
import { levelLabel } from "../../lib/srd-format/spells";
import { useMagicItemIndex, useMundaneItemIndex, useSpellIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import { mundaneItemDetailToCard } from "../mappers/mundaneItems";
import { spellDetailToCard } from "../mappers/spells";
import type { ContentRow, ContentType } from "./types";

type TaggedEntry =
  | (MagicItem & { __source: "magic" })
  | (MundaneItem & { __source: "mundane" })
  | (Spell & { __source: "spell" });

export const allContentType: ContentType = {
  id: "all",
  label: "All",
  searchPlaceholder: "Search SRD…",
  emptyMessage: "No results match your search.",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const magic = useMagicItemIndex(source);
    const mundane = useMundaneItemIndex(source);
    const spells = useSpellIndex(source);
    const rows = useMemo<ContentRow[]>(() => {
      const q = query.trim();
      const tagged: TaggedEntry[] = [
        ...(magic.data?.results ?? []).map(
          (entry): TaggedEntry => ({ ...entry, __source: "magic" }),
        ),
        ...(mundane.data?.results ?? []).map(
          (entry): TaggedEntry => ({ ...entry, __source: "mundane" }),
        ),
        ...(spells.data?.results ?? []).map(
          (entry): TaggedEntry => ({ ...entry, __source: "spell" }),
        ),
      ];
      const ordered =
        q === ""
          ? [...tagged].sort((a, b) => a.name.localeCompare(b.name))
          : fuzzysort.go(q, tagged, { key: "name" }).map((r) => r.obj);
      return ordered.map((entry): ContentRow => {
        if (entry.__source === "magic") {
          return {
            key: entry.key,
            name: entry.name,
            meta: entry.rarity.name,
            kindLabel: "Item",
            toCard: () => magicItemDetailToCard({ ...entry, ruleset: source }),
          };
        }
        if (entry.__source === "mundane") {
          return {
            key: entry.key,
            name: entry.name,
            meta: entry.category.name,
            kindLabel: "Item",
            toCard: () => mundaneItemDetailToCard({ ...entry, ruleset: source }),
          };
        }
        return {
          key: entry.key,
          name: entry.name,
          meta: levelLabel(entry.level, entry.school.name),
          kindLabel: "Spell",
          toCard: () => spellDetailToCard({ ...entry, ruleset: source }),
        };
      });
    }, [magic.data, mundane.data, spells.data, query, source]);
    return {
      isLoading: magic.isLoading || mundane.isLoading || spells.isLoading,
      isError: magic.isError || mundane.isError || spells.isError,
      refetch: () => {
        magic.refetch();
        mundane.refetch();
        spells.refetch();
      },
      rows,
    };
  },
};
```

Note: the file references `ContentType.emptyMessage`, which Task 4 adds to the type. Until Task 4 runs, TypeScript will flag the `emptyMessage:` line. That's expected; the type is added in Task 4 and the runtime suite is what matters for verification between tasks. The line stays in place because removing and re-adding it across two tasks is churn.

If a stricter intermediate state is preferred, alternative: add `emptyMessage` to `ContentType` first (Task 4 swapped to Task 2-and-a-half). The chosen ordering keeps the user-visible "merge rows" change in Task 2 and the "empty state copy" change in Task 4 cleanly separated.

- [ ] **Step 4: Register `allContentType` first in `src/api/content-types/index.ts`**

Replace the file with:

```ts
import { allContentType } from "./all";
import { itemsContentType } from "./items";
import { spellsContentType } from "./spells";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly [ContentType, ...ContentType[]] = [
  allContentType,
  itemsContentType,
  spellsContentType,
];

export type { ContentRow, ContentType, ContentTypeResults } from "./types";
```

- [ ] **Step 5: Run the focused test file and confirm the three new/updated cases pass**

Run: `npm test -- --run src/views/BrowseApiModal.test.tsx`

Expected: all tests in this file pass, including the three from Step 1.

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`

Expected: all tests pass. Some pre-existing tests now run against the All tab as the default (e.g., the "shows index entries", "search filters", and "switching source" cases pick up the magic items via the All tab instead of the Items tab). The set of assertions in those tests is robust to that — they search by row name only.

- [ ] **Step 7: Commit**

```bash
git add src/api/content-types/all.ts src/api/content-types/index.ts src/views/BrowseApiModal.test.tsx
git commit -m "feat(browse): add All content type that merges items and spells"
```

---

## Task 3: Render the kind tag prefix in All

TDD. Tests assert that meta starts with `Item · ` / `Spell · ` on All and does not on the other tabs.

**Files:**
- Modify: `src/views/BrowseApiModal.tsx`
- Modify: `src/views/BrowseApiModal.test.tsx`

- [ ] **Step 1: Write failing tests**

Add the four cases below to `src/views/BrowseApiModal.test.tsx`, after the "All tab merges items and spells alphabetically" test from Task 2:

```ts
test("All tab prefixes item rows with 'Item · '", async () => {
  const item = magicItemIndexEntryFactory.build({
    name: "Bag of Holding",
    rarity: { name: "Uncommon" },
  });
  const client = makeClient({ items: { "2024": { count: 1, results: [item] } } });

  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  const row = await screen.findByRole("button", { name: /Bag of Holding/ });
  expect(row).toHaveTextContent("Item · Uncommon");
});

test("All tab prefixes spell rows with 'Spell · '", async () => {
  const spell = spellIndexEntryFactory.build({
    name: "Fireball",
    level: 3,
    school: { name: "evocation" },
  });
  const client = makeClient({ spells: { "2024": { count: 1, results: [spell] } } });

  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  const row = await screen.findByRole("button", { name: /Fireball/ });
  expect(row).toHaveTextContent("Spell · 3rd-level evocation");
});

test("Items tab does not prefix rows with 'Item · '", async () => {
  const item = magicItemIndexEntryFactory.build({
    name: "Bag of Holding",
    rarity: { name: "Uncommon" },
  });
  const client = makeClient({ items: { "2024": { count: 1, results: [item] } } });

  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  await userEvent.click(screen.getByRole("tab", { name: "Items" }));
  const row = await screen.findByRole("button", { name: /Bag of Holding/ });
  expect(row).toHaveTextContent("Uncommon");
  expect(row).not.toHaveTextContent("Item · ");
});

test("Spells tab does not prefix rows with 'Spell · '", async () => {
  const spell = spellIndexEntryFactory.build({
    name: "Fireball",
    level: 3,
    school: { name: "evocation" },
  });
  const client = makeClient({ spells: { "2024": { count: 1, results: [spell] } } });

  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  await userEvent.click(screen.getByRole("tab", { name: "Spells" }));
  const row = await screen.findByRole("button", { name: /Fireball/ });
  expect(row).toHaveTextContent("3rd-level evocation");
  expect(row).not.toHaveTextContent("Spell · ");
});
```

- [ ] **Step 2: Run the focused test file and verify the four new cases fail**

Run: `npm test -- --run src/views/BrowseApiModal.test.tsx`

Expected: the four new tests fail. The two "All tab prefixes…" cases fail because the renderer hasn't been changed yet. The two "does not prefix" cases pass right now (because the prefix doesn't exist anywhere), which is fine — they exist to guard against regressions introduced by Step 3.

Confirm both All-tab tests fail with an assertion mismatch on the prefix text. The other two should pass.

- [ ] **Step 3: Conditionally render the kind prefix**

Edit `src/views/BrowseApiModal.tsx`. Find this block in `TypePanel` (currently lines 258-269):

```tsx
{results.rows.map((row) => (
  <button
    key={row.key}
    type="button"
    className={styles.row}
    onClick={() => onPick(row.key, row.toCard())}
    disabled={pickingKey !== null}
  >
    <span className={styles.rowName}>{row.name}</span>
    <span className={styles.rowMeta}>{pickingKey === row.key ? "Loading…" : row.meta}</span>
  </button>
))}
```

Replace the `<span className={styles.rowMeta}>…</span>` line with:

```tsx
    <span className={styles.rowMeta}>
      {pickingKey === row.key
        ? "Loading…"
        : type.id === "all" && row.kindLabel
          ? `${row.kindLabel} · ${row.meta}`
          : row.meta}
    </span>
```

`TypePanel` already receives the `type` prop, so no signature change is needed.

- [ ] **Step 4: Run the focused test file and verify all four cases pass**

Run: `npm test -- --run src/views/BrowseApiModal.test.tsx`

Expected: all four new tests pass, plus the entire file.

- [ ] **Step 5: Run the full suite**

Run: `npm test -- --run`

Expected: 781 tests pass (773 baseline + 3 from Task 2 + 4 from Task 3, with the existing tablist test updated rather than added — net +7). The "mundane-item rows show category in the meta column" test still passes because `toHaveTextContent("Adventuring Gear")` is a substring match and "Item · Adventuring Gear" contains it.

- [ ] **Step 6: Commit**

```bash
git add src/views/BrowseApiModal.tsx src/views/BrowseApiModal.test.tsx
git commit -m "feat(browse): prefix kind tag on All-tab row meta"
```

---

## Task 4: Add `emptyMessage` to `ContentType` and use it

Replaces the inline `No ${type.label.toLowerCase()} match your search.` interpolation, which produces broken grammar for the All tab.

**Files:**
- Modify: `src/api/content-types/types.ts`
- Modify: `src/api/content-types/items.ts`
- Modify: `src/api/content-types/spells.ts`
- Modify: `src/api/content-types/all.ts`
- Modify: `src/views/BrowseApiModal.tsx`
- Modify: `src/views/BrowseApiModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Add the case below to `src/views/BrowseApiModal.test.tsx` after the kind-tag tests from Task 3:

```ts
test("All tab empty state reads 'No results match your search.'", async () => {
  const client = makeClient();
  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  await userEvent.type(screen.getByRole("searchbox"), "xyzzy");

  expect(await screen.findByText("No results match your search.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test file and verify the new case fails**

Run: `npm test -- --run src/views/BrowseApiModal.test.tsx`

Expected: this new test fails. With no `emptyMessage` plumbed yet, the rendered text reads "No all match your search." (or similar) and the new test can't find "No results match your search." on the page.

- [ ] **Step 3: Add the field to `ContentType`**

Edit `src/api/content-types/types.ts`. The current `ContentType` is:

```ts
export type ContentType = {
  id: string;
  label: string;
  searchPlaceholder: string;
  supportedSources: readonly [Ruleset, ...Ruleset[]];
  useResults: (source: Ruleset, query: string) => ContentTypeResults;
};
```

Replace with:

```ts
export type ContentType = {
  id: string;
  label: string;
  searchPlaceholder: string;
  emptyMessage: string;
  supportedSources: readonly [Ruleset, ...Ruleset[]];
  useResults: (source: Ruleset, query: string) => ContentTypeResults;
};
```

- [ ] **Step 4: Set `emptyMessage` on each existing content type**

Edit `src/api/content-types/items.ts`. In the `itemsContentType` object, add directly after `searchPlaceholder: "Search items…"`:

```ts
  emptyMessage: "No items match your search.",
```

Edit `src/api/content-types/spells.ts`. In the `spellsContentType` object, add directly after `searchPlaceholder: "Search spells…"`:

```ts
  emptyMessage: "No spells match your search.",
```

The `allContentType` file (created in Task 2) already includes `emptyMessage: "No results match your search."` — no edit needed here.

- [ ] **Step 5: Replace the inline message in `BrowseApiModal.tsx`**

In `src/views/BrowseApiModal.tsx`, find this line inside `TypePanel` (currently near line 214):

```tsx
  const emptyMessage = `No ${type.label.toLowerCase()} match your search.`;
```

Replace with:

```tsx
  const emptyMessage = type.emptyMessage;
```

- [ ] **Step 6: Run the focused test file and verify the new case passes**

Run: `npm test -- --run src/views/BrowseApiModal.test.tsx`

Expected: the new empty-state test passes. The entire file still passes.

- [ ] **Step 7: Run the full suite**

Run: `npm test -- --run`

Expected: 782 tests pass.

- [ ] **Step 8: Type-check via build**

Run: `npm run build`

Expected: build succeeds with no TypeScript errors. (Vitest doesn't enforce `noUncheckedIndexedAccess` and similar strict-mode checks; the build does.)

- [ ] **Step 9: Commit**

```bash
git add src/api/content-types/types.ts src/api/content-types/items.ts src/api/content-types/spells.ts src/views/BrowseApiModal.tsx src/views/BrowseApiModal.test.tsx
git commit -m "feat(browse): per-type empty-state copy on the SRD modal"
```

---

## Task 5: Manual verification in the dev server

The test suite covers the logic, but the modal is visual; eyeball it once before declaring done.

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background-friendly)

Open the URL it prints in a browser.

- [ ] **Step 2: Walk the golden path**

- Sign in if required, open a deck, click the "Browse SRD" button.
- Confirm the dialog opens with the **All** tab selected and rows showing a mix of items and spells in alphabetical order.
- Confirm each row's right-aligned meta starts with `Item · ` or `Spell · `.
- Type a query (e.g., "fire"); confirm rows narrow down across both kinds and the prefix is still present.
- Clear the query; type something that matches nothing (e.g., "xyzzy"); confirm the empty state reads "No results match your search."
- Switch to the **Items** tab; confirm the prefix disappears, the layout is otherwise unchanged from current behaviour, and the empty-state message (when search matches nothing) reads "No items match your search."
- Switch to the **Spells** tab; confirm the prefix disappears and behaviour is current.
- Switch the source (2024 ↔ 2014) while on All; confirm rows refresh and the prefix remains.
- Pick an item from All; confirm a card is added to the deck (this exercises `toCard()` end-to-end).
- Pick a spell from All; confirm the same.
- Resize the window narrow (under ~560px container width); confirm the tab list collapses into the **Type** dropdown and "All" appears at the top.

- [ ] **Step 3: Stop the dev server**

Either close the browser tab or interrupt the dev process. No commit needed for this task.

---

## Self-Review (already done)

Spec coverage:
- "New `allContentType` placed first" → Task 2.
- "`ContentRow.kindLabel?: string`" → Task 1; populated in Task 2.
- "`BrowseApiModal` row renderer: when `typeId === "all"` and `row.kindLabel` is defined, display meta as `${kindLabel} · ${meta}`" → Task 3.
- "`ContentType.emptyMessage`" → Task 4.
- "Source filter (2024/2014) keeps working" → no code change; verified in Task 5.
- "Tests: extensions to BrowseApiModal.test.tsx" → Tasks 2, 3, 4.
- UX section bullets (default tab, search placeholder, narrow-viewport TypeMenu) → covered by Tasks 2 and 5.
- Behaviour edge cases (alpha sort, fuzzy across merged set, OR-merged loading/error) → covered by `allContentType.useResults` in Task 2 and verified by the existing loading/error tests that already exercise the magic-items hook (which is now a dependency of All too).

No placeholders. Types referenced (`ContentType`, `ContentRow`, `MagicItem`, `MundaneItem`, `Spell`, the three mappers, the three index hooks, `levelLabel`) all exist in the repo at the cited paths.
