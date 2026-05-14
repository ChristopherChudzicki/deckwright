# Browse SRD — All tab

## Problem

`BrowseApiModal` has separate tabs for Items and Spells, driven by the `CONTENT_TYPES` array in `src/api/content-types/`. A user adding a card has to know in advance which category their target belongs to. Most of the time they just want to type a name (e.g., "fireball", "longsword", "bag of holding") and have the matching SRD entry show up — picking the right tab first is friction.

## Goal

Add a third content type, "All", that searches across items and spells in a single list. Make it the default tab. When the active tab is "All", each row shows a leading meta tag indicating whether the row is an Item or a Spell. Other tabs are visually unchanged.

## Approach

Compose, don't special-case. Add an `allContentType` in `src/api/content-types/all.ts` whose `useResults` internally subscribes to the same React Query hooks that items/spells use today (`useMagicItemIndex`, `useMundaneItemIndex`, `useSpellIndex`), tags each row with a `kindLabel`, merges, and sorts/fuzzy-matches across the combined set.

`ContentRow` gains an optional `kindLabel?: string`. `BrowseApiModal`'s row renderer prepends `kindLabel` to the existing `meta` string with a center-dot separator, but only when the active tab id is `"all"`. Other tabs continue to render `meta` unchanged.

This keeps `BrowseApiModal` generic — it still iterates `CONTENT_TYPES` and renders a `TypePanel` per tab. The only branch is the one bit that decides whether to prepend `kindLabel`.

## Scope

In:

- New `allContentType` placed first in `CONTENT_TYPES` (becomes the default tab).
- `ContentRow.kindLabel?: string`. Only `all` sets it — `"Item"` for both magic and mundane item entries, `"Spell"` for spells. `itemsContentType` and `spellsContentType` are untouched.
- `BrowseApiModal` row renderer: when `typeId === "all"` and `row.kindLabel` is defined, display meta as `${kindLabel} · ${meta}`.
- `ContentType.emptyMessage: string` — new field used by the modal's empty-state UI in place of the current `No ${type.label.toLowerCase()} match your search.` interpolation. Items: `"No items match your search."`, spells: `"No spells match your search."`, all: `"No results match your search."` This avoids the grammatically broken "No all match your search." that the current interpolation would produce for the new tab.
- Source filter (2024/2014) keeps working — both kinds support both sources.
- Tests: extensions to `BrowseApiModal.test.tsx` covering default tab, mixed results, kind tag visibility in All, and kind tag absence in both Items and Spells tabs.

Out:

- Three-way kind labeling (Magic item / Mundane item / Spell). Two labels only; magic vs mundane is implicit in the existing meta column (rarity vs category).
- Persisting the last-selected tab across sessions.
- Grouping or section headers in All. Flat merged list.
- Per-kind toggles inside All (e.g., "hide spells"). The All tab is purely additive — granular filtering is what the individual tabs are for.
- Changes to the source menu, header, or footer.

## UX

When the modal opens:

- "All" is selected by default (the tab list now shows `All`, `Items`, `Spells` in that order).
- The search field's placeholder for `all` is `"Search SRD…"`.
- Rows render as today, with the meta column reading `${kindLabel} · ${meta}`. Example:

```
Fireball              Spell · 3rd-level evocation
Bag of Holding        Item · Wondrous item
Longsword             Item · Martial Melee Weapon
```

When the user switches to `Items` or `Spells`, the kind tag disappears (because the renderer only adds it for `typeId === "all"`).

On narrow viewports (`<560px` container width), the tab list collapses into the existing `TypeMenu` dropdown. That menu iterates `CONTENT_TYPES`, so "All" appears at the top of the dropdown automatically — no extra code path is needed.

## Architecture

```
src/api/content-types/
  all.ts                   — new: allContentType
  index.ts                 — place allContentType first in CONTENT_TYPES
  types.ts                 — add kindLabel?: string to ContentRow; add emptyMessage: string to ContentType
  items.ts                 — add emptyMessage: "No items match your search."
  spells.ts                — add emptyMessage: "No spells match your search."
src/views/
  BrowseApiModal.tsx       — read type.emptyMessage instead of inlining the string; when typeId === "all", render `${row.kindLabel} · ${row.meta}`
  BrowseApiModal.test.tsx  — new assertions for All tab + kind tag visibility
```

Existing row-building logic in `itemsContentType` and `spellsContentType` is not modified.

### `allContentType.useResults`

- Calls `useMagicItemIndex(source)`, `useMundaneItemIndex(source)`, `useSpellIndex(source)`.
- Builds a tagged union of all three entry types, with `__source: "magic" | "mundane" | "spell"` (extending the pattern in `items.ts`'s `TaggedEntry`).
- When `query === ""`: alpha-sort by `name`.
- When `query !== ""`: `fuzzysort.go(q, tagged, { key: "name" })`.
- Maps each entry to a `ContentRow`, dispatching on `__source`:
    - `"magic"` → `meta: entry.rarity.name`, `kindLabel: "Item"`, `toCard: () => magicItemDetailToCard({ ...entry, ruleset: source })`.
    - `"mundane"` → `meta: entry.category.name`, `kindLabel: "Item"`, `toCard: () => mundaneItemDetailToCard({ ...entry, ruleset: source })`.
    - `"spell"` → `meta: levelLabel(entry.level, entry.school.name)`, `kindLabel: "Spell"`, `toCard: () => spellDetailToCard({ ...entry, ruleset: source })`.
  The `{ ...entry, ruleset: source }` wrap matches the call shape `items.ts` and `spells.ts` use today; the mappers expect a detail object with a `ruleset` field.
- `isLoading`: OR of all three.
- `isError`: OR of all three (same posture items uses today — bundled JSON makes partial failure rare).
- `refetch`: fire-and-forget all three.

## Behaviour edge cases

- **Empty query, both sources loaded**: rows interleave alphabetically by name. A spell named "Aid" sits above an item named "Alchemist's Fire".
- **Search query**: fuzzy match operates across the merged set; results are ordered by fuzzysort score, not by kind.
- **One source still loading**: `isLoading` stays true and the modal shows the loading state. We don't render a partial list. Acceptable because both indices come from bundled JSON and complete near-simultaneously.
- **Source switch (2024 ↔ 2014)** while in All: tab stays on All, query is preserved (today's behaviour), results refresh from the new source.

## Tests

All test coverage lives in `src/views/BrowseApiModal.test.tsx`. Content-type modules don't carry their own unit tests in this repo (see `src/api/hooks.test.tsx` for the existing hook-test pattern); the modal test exercises `allContentType.useResults` end-to-end via its UI output, which is enough for this feature.

Cases to add:

- All tab is selected by default (assert via the `Tab` with name "All" being `data-selected`).
- With empty query and both indices loaded, results include both an item and a spell row; their meta text starts with "Item · " and "Spell · " respectively.
- Typing a known item name in All returns that item row and the meta starts with "Item · ".
- Typing a known spell name in All returns that spell row and the meta starts with "Spell · ".
- Switching to the Items tab: rendered rows' meta does NOT start with "Item · " (the kind tag is omitted outside All).
- Switching to the Spells tab: same — meta does NOT start with "Spell · ".
- Empty-state copy in All reads "No results match your search." when a query matches nothing.

No changes to existing tests for `itemsContentType` or `spellsContentType` are expected.

## Risks

- **Default tab shift** — anyone with muscle memory for "Items first" will land on All instead. Low impact; one extra click to reach Items if they want it.
- **Performance** — All tab pays the cost of three indices loaded simultaneously. Indices are bundled JSON; this is already the case for the Items tab today (magic + mundane).
- **Visual density** — adding a meta prefix lengthens the meta string. The existing `.rowMeta` column is right-aligned and uses muted text; longer text should still fit within typical row widths. If it overflows on narrow viewports, that's an existing concern, not introduced here.
