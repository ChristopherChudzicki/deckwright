# SRD browse modal — rework for content-type growth

## Problem

`BrowseApiModal` exposes two filter axes — content type (Items / Spells) and source (2014 / 2024 SRD) — as four sibling toggle buttons in the dialog header. Today that's manageable; we want to add monsters, effects, feats, and a few more types in the next year. With ~5–10 types the toggle row stops fitting and stops scaling. The modal also hardcodes the `Kind = "items" | "spells"` union and switches on it (mappers, hooks, placeholders, empty messages), so adding a new type means editing the modal in several places.

## Goal

Reshape the dialog so adding a content type is a localized, additive change — register one module, append it to a list, done. Visually, replace the four-toggle header with a left sidebar of types (the growing axis) and a single source dropdown in the header (the slow axis). Keep the modal a modal.

## Non-goals

- Counts in the sidebar. The bundled JSON would have to be dynamically imported for every registered type just to read `.length`. Not a clear win; trivial to add later.
- Attribute filtering (rarity, spell level, school, CR, etc.). Out of scope for this rework.
- Cross-type / "All" view with mixed listing. Users entering this dialog know whether they want a spell or an item; mixed listing changes how search behaves and is straightforward to add later if browsing patterns argue for it.
- "Coming soon" placeholder rows for unimplemented types.
- Renaming the dialog to "Browse Library." Stays "Browse SRD" until a non-SRD source actually ships.
- Database changes. This is a frontend refactor; the saved card payload still flows through `useSaveCard` into the existing `cards` table.

## Approach

### Layout

`DialogShell` size grows from `md` (640px) to `lg` (720px). At wide widths the dialog is split:

- **Header** (existing `DialogHeader`): title "Browse SRD" on the left; a single `Select` "Source: SRD 2024 ▾" on the right; close button.
- **Sidebar** (~160px, left): vertical list of registered content types, active type styled in `--color-primary`. Only types whose `supportedSources` include the current source are rendered; if the active type doesn't support the chosen source, see "Source × type interaction" below.
- **Main pane** (right): existing search row + results list + attribution footer. No structural change beyond receiving the active type from the sidebar instead of from the kind toggle.

Sidebar uses **`Tabs` from `react-aria-components`** in vertical orientation. Sidebar items act like tabs (each one switches the active result panel), and the primitive gives keyboard nav (↑/↓/Home/End), focus management, and the right ARIA roles for free. Each `TabPanel` renders the search field + results for one type.

All styling uses existing screen tokens (`--color-*`, `--space-*`, `--radius-*`, `--fs-*`); no new tokens introduced.

### Type registry

Replace the hardcoded `Kind` union and its switch sites with a single registry array. Each content type is a self-contained module:

```ts
// src/api/content-types/types.ts
export type ContentType<TEntry> = {
  id: string;                   // "items"
  label: string;                // "Items"
  searchPlaceholder: string;    // "Search items…"
  emptyMessage: string;         // "No items match your search."
  supportedSources: Ruleset[];  // ["2014", "2024"]
  useIndex: (source: Ruleset) => UseQueryResult<{ results: TEntry[] }>;
  rowMeta: (entry: TEntry) => string;          // right-side text on each row
  toCard: (entry: TEntry, source: Ruleset) => Card;
};

// src/api/content-types/index.ts
export const CONTENT_TYPES: ContentType<unknown>[] = [items, spells];
```

`BrowseApiModal` becomes type-agnostic: it iterates `CONTENT_TYPES` to render the sidebar/tab list, looks up the active type to drive the search field, calls its `useIndex` for results, and on click hands the entry to `toCard` then `useSaveCard`.

Re-homing existing pieces (no behavior change):

- `magicItemDetailToCard` / `spellDetailToCard` → `toCard` on the items/spells type modules.
- `useMagicItemIndex` / `useSpellIndex` → `useIndex` on each type module.
- The current per-kind helpers (`itemMeta`, `spellMeta`, `placeholder`, `emptyMessage`) → fields on the type module.

Adding monsters later is: create `src/api/content-types/monsters.ts`, append to the `CONTENT_TYPES` array. No edits to `BrowseApiModal`.

### Source × type interaction

The header `Select` lists exactly the **active type's** `supportedSources` — nothing else appears. Switching the active type re-derives the dropdown options. If the previously selected source isn't supported by the new type, source falls back to the new type's first supported source (deterministic, no empty-pane dead end). Today every type supports both 2014 and 2024 so this is a no-op; the registry handles it correctly when a future type ships partial source coverage (e.g., monsters with only 2014 data).

### Search

- Search stays scoped to the active type. Placeholder reads "Search {type}…" from the type module.
- Query **clears on type switch.** A "fire" query for spells doesn't carry meaningful intent into items.
- The current substring-on-name match logic stays as-is; no fuzzy match, no attribute filters.

### Narrow viewports

Modal width is `min(720px, 92vw)`. On a 375px viewport the dialog is ~345px wide and a 160px sidebar would crush the main pane. Use a **container query** (`@container` on the dialog) at ~560px:

- ≥ 560px: sidebar layout described above.
- < 560px: hide sidebar; render type as a second `Select` ("Type: Items ▾") in the header next to the source select. Main pane gets full width. Same primitives, no markup duplication beyond the two header controls.

### Attribution footer

Today's footer copy ("Only SRD spells and items are available…") is type-specific and breaks the moment we add monsters. Generalize to "Only SRD content is available…" and keep the SRD + CC BY 4.0 links unchanged. Footer remains rendered always; per-source variant copy is a future change.

## Component sketch

- `BrowseApiModal.tsx`
  - Owns: selected `typeId`, selected `source`, search query, picking state.
  - Renders: `DialogShell` → `DialogHeader` (title + source `Select` + close) → vertical `Tabs` (sidebar = `TabList`, content = the active `TabPanel`).
  - Each `TabPanel` renders `<TypePanel type={type} source={source} query={query} onQueryChange={...} onPick={...} />`.
- `TypePanel` (new, internal to the file or co-located)
  - Calls `type.useIndex(source)`, filters by query, renders the rows.
  - Keeps the loading / error / empty / pick-error states from today (visuals unchanged).
- `src/api/content-types/items.ts`, `src/api/content-types/spells.ts`
  - Each exports a `ContentType` object built from the existing endpoint hook + mapper.
- `src/api/content-types/index.ts`
  - Exports `CONTENT_TYPES`.

The existing `BrowseApiModal.module.css` keeps its row / state / footer rules; new rules cover the sidebar/tabs and the container-query variant.

## Testing

`BrowseApiModal.test.tsx` already exercises the modal end-to-end with MSW. Update it to:

- Assert the sidebar is rendered as a tablist with two tabs ("Items," "Spells") in the registered order.
- Assert clicking a sidebar tab switches the placeholder, the visible rows, and clears the search query.
- Assert the source `Select` lists the union of supported sources and switches results when changed.
- Keep the existing "pick row → save card → onSelected fires" assertion.

A small new test on the registry verifies that `CONTENT_TYPES` is non-empty and each entry exposes the required fields (acts as a guardrail when adding types).

No new test infrastructure; existing MSW handlers continue to serve the bundled JSON.

## Migration

None. Frontend refactor only — no database, RLS, or schema change. Saved cards keep the same shape (`toCard` produces the same `Card` payload).

## Risks and edge cases

- **Container query support**: relied on; current browser targets all support it.
- **Vertical Tabs styling**: react-aria's `Tabs` defaults to horizontal; the orientation prop and CSS handle vertical layout. Verified pattern in their docs.
- **Type with zero supported sources**: registry guards against this — such a type wouldn't appear at all.
- **Dialog height**: keep `height={{ fixed: "min(70vh, 640px)" }}` from today; the sidebar inherits the dialog height.
- **Focus on open**: search field still autofocuses on the active tab — preserves today's behavior.

## Out-of-scope follow-ups

- Sidebar counts (eager-load all type indices, display `.length`).
- Attribute filters per type (rarity, level, school, CR).
- "All" cross-type view with row tags + unified search.
- Per-source attribution footer copy when non-SRD sources land.
- Renaming dialog to "Browse Library" when fan/non-SRD content arrives.
