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
- Source filter (2024/2014) keeps working — both kinds support both sources.
- Tests: a `BrowseApiModal` test covering default tab, mixed results, kind tag visibility, and tag hidden in other tabs.

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

## Architecture

```
src/api/content-types/
  all.ts                   — new: allContentType
  all.test.ts              — new: unit test for merge/sort/kindLabel
  index.ts                 — place allContentType first in CONTENT_TYPES
  types.ts                 — add kindLabel?: string to ContentRow
src/views/
  BrowseApiModal.tsx       — when typeId === "all", render `${row.kindLabel} · ${row.meta}`
  BrowseApiModal.test.tsx  — new assertions for All tab + kind tag visibility
```

`itemsContentType` and `spellsContentType` are not modified.

### `allContentType.useResults`

- Calls `useMagicItemIndex(source)`, `useMundaneItemIndex(source)`, `useSpellIndex(source)`.
- Builds a tagged union of all three entry types, with `__source: "magic" | "mundane" | "spell"` (extending the pattern in `items.ts`'s `TaggedEntry`).
- When `query === ""`: alpha-sort by `name`.
- When `query !== ""`: `fuzzysort.go(q, tagged, { key: "name" })`.
- Maps each entry to a `ContentRow`, delegating row-shape decisions to the existing detail-to-card mappers (`magicItemDetailToCard`, `mundaneItemDetailToCard`, `spellDetailToCard`). Sets `kindLabel` based on `__source`: `"Item"` for `magic`/`mundane`, `"Spell"` for `spell`. `meta` matches what items/spells tabs already show (rarity, category, level/school).
- `isLoading`: OR of all three.
- `isError`: OR of all three (same posture items uses today — bundled JSON makes partial failure rare).
- `refetch`: fire-and-forget all three.

## Behaviour edge cases

- **Empty query, both sources loaded**: rows interleave alphabetically by name. A spell named "Aid" sits above an item named "Alchemist's Fire".
- **Search query**: fuzzy match operates across the merged set; results are ordered by fuzzysort score, not by kind.
- **One source still loading**: `isLoading` stays true and the modal shows the loading state. We don't render a partial list. Acceptable because both indices come from bundled JSON and complete near-simultaneously.
- **Source switch (2024 ↔ 2014)** while in All: tab stays on All, query is preserved (today's behaviour), results refresh from the new source.

## Tests

`src/views/BrowseApiModal.test.tsx` — add cases:

- All tab is selected by default (assert via the selected `Tab` role / data-selected).
- With empty query, results include both an item and a spell, with the kind tag visible (e.g., "Item · Wondrous item", "Spell · 3rd-level evocation").
- Typing a known item name in All returns the item row and the kind tag reads "Item".
- Typing a known spell name in All returns the spell row and the kind tag reads "Spell".
- Switching to the Items tab hides the kind tag (meta does not start with "Item · ").

`src/api/content-types/all.test.ts` — small unit test:

- Given mocked item + spell indices, the rows array merges and sorts as expected; each row carries the correct `kindLabel`.

No changes to existing tests for `itemsContentType` or `spellsContentType` are expected, because `kindLabel` is additive on rows and consumers of those tabs ignore it.

## Risks

- **Default tab shift** — anyone with muscle memory for "Items first" will land on All instead. Low impact; one extra click to reach Items if they want it.
- **Performance** — All tab pays the cost of three indices loaded simultaneously. Indices are bundled JSON; this is already the case for the Items tab today (magic + mundane).
- **Visual density** — adding a meta prefix lengthens the meta string. The existing `.rowMeta` column is right-aligned and uses muted text; longer text should still fit within typical row widths. If it overflows on narrow viewports, that's an existing concern, not introduced here.
