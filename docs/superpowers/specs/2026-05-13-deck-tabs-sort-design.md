# Deck view — kind tabs & sort

## Problem

The deck list at `/deck/$deckId` (`src/views/DeckView.tsx`) shows every card in one flat list, sorted by whatever order `get_public_deck_cards` returns. For a deck with a mix of items and spells, there is no way to:

- Scope the view to just items or just spells.
- Reorder by name or recency.

The browse-catalog dialog (`src/views/BrowseApiModal.tsx`) already uses tabs per content type, so users have a precedent for thinking of the deck as splittable by kind.

## Goals

- Tabs at the top of the deck list: **All**, **Items**, **Spells**, each labeled with its count.
- A sort picker offering **Last updated** (default, newest first) and **Name** (A→Z).
- Active tab and sort are reflected in the URL so refresh/back/share all preserve the view.
- Filtering and sorting happen client-side over the existing `useDeckCards` result — no RPC or schema changes.
- Read-only viewers of a shared deck get the same affordances.

## Non-goals

- Sorting by rarity, spell level, or spell school. The card model is intentionally unstructured (free-form tags), so a robust implementation would require parsing tag strings — deferred until tag conventions stabilize.
- A free-text or fuzzy filter inside the deck view. Tracked separately if needed.
- Bulk operations across tabs (multi-select, move, delete-many).
- Surfacing the `ability` card kind. The type exists in `src/cards/types.ts` and `src/decks/schema.ts` but no code path creates one today (the editor uses `RenderableCard`, and no API mapper produces it). Treat the deck list as item-or-spell only.

## URL state

Two search params on the existing `/deck/$deckId` route, declared via the router's `validateSearch`:

```ts
type DeckSearch = {
  kind: "all" | "item" | "spell"; // default "all"
  sort: "updated" | "name";       // default "updated"
};
```

`validateSearch` coerces unknown values back to defaults so render code never has to defend against bad params. Reading uses `useSearch({ from: ... })`; writing uses the router's `navigate({ search: prev => ({ ...prev, kind: "spell" }) })` pattern (or `<Link search>` where appropriate).

## Filter / sort helper

A pure helper, colocated with `DeckView.tsx`:

```ts
// src/views/deckListing.ts
type Sort = "updated" | "name";
type KindFilter = "all" | "item" | "spell";

export type DeckListing = {
  cards: Card[];             // filtered + sorted
  counts: { all: number; item: number; spell: number };
};

export function deckListing(cards: Card[], opts: { kind: KindFilter; sort: Sort }): DeckListing;
```

Behavior:

- **Filter:** `kind === "all"` returns every card; otherwise `card.kind === kind`. Ability cards (if any ever land in a deck) are excluded from Items and Spells; they appear under All.
- **Counts:** `all` = total, `item` = `kind === "item"`, `spell` = `kind === "spell"`. Computed in the same pass.
- **Sort:**
  - `updated`: `updatedAt` descending (ISO strings compare lexicographically). Tie-break: `name` ascending (`localeCompare`), then `id` ascending.
  - `name`: `name` ascending via `localeCompare(undefined, { sensitivity: "base" })` so accented characters sort intuitively. Tie-break: `id` ascending.

Pure, no React imports, trivially unit-testable.

## UI structure

`DeckView.tsx` gains a toolbar row between the existing `<header>` and the `<ul>`:

```
┌─ header (title, count, actions: Print / Browse / New) ──────┐
├─ toolbar ────────────────────────────────────────────────────┤
│  [ All (12) ] [ Items (5) ] [ Spells (7) ]  Sort: Last updated ▾ │
├─ list (filtered + sorted) ───────────────────────────────────┤
│  card row …                                                  │
│  card row …                                                  │
```

### Tabs

`react-aria-components` `Tabs` + `TabList` + `Tab` (horizontal). `selectedKey={kind}`. `onSelectionChange` calls `navigate({ search: prev => ({ ...prev, kind: key }) })`. Labels include counts: `"All (12)"`, `"Items (5)"`, `"Spells (7)"`. Zero-count tabs render normally (`"Spells (0)"`) — never hidden.

No `TabPanel` components: the list below is a single `<ul>` that re-renders from the filtered data. The tabs are purely a filter signal. This keeps row keys stable across tab changes and avoids three near-identical list templates.

### Sort dropdown

Reuses the `MenuTrigger` + `RACButton` + `Popover` + `Menu` pattern from `BrowseApiModal.tsx`'s `SourceMenu` (lines 144–169) so styling and a11y match the existing source picker. Trigger label: `"Sort: Last updated ▾"` / `"Sort: Name ▾"`. `onAction` writes `sort` to URL.

## Empty states

| Condition | Treatment |
|---|---|
| Deck has zero cards | Toolbar row is hidden. Existing `"No cards yet."` message shows where the list would be. |
| Active tab has zero matches (e.g. Spells in an items-only deck) | Toolbar stays visible. List area shows `"No items in this deck."` / `"No spells in this deck."`. The zero in the tab count makes the reason obvious. |
| All filter with zero cards | Same as the first row — toolbar hidden, no-cards message shown. (Equivalent to deck-empty.) |

No inline "Add a card" CTA in the empty-tab state; `New card` and `Browse Catalog` are already in the header right above.

## Read-only decks

Shared decks (non-owner viewers) get the full tabs + sort UI. Filtering and sorting help viewers too. Owner-only affordances (delete, rename) stay gated as today.

## Components touched

- `src/views/DeckView.tsx` — add toolbar row, wire URL params, consume the helper.
- `src/views/DeckView.module.css` — toolbar layout, tab styling, sort-trigger styling (mirror `BrowseApiModal.module.css`'s `menuTrigger`).
- `src/views/deckListing.ts` (new) — pure filter/sort helper.
- `src/views/deckListing.test.ts` (new) — helper unit tests.
- `src/views/DeckView.test.tsx` — integration tests for tabs, sort, URL state, empty tabs.
- Route file for `/deck/$deckId` — add `validateSearch` for `kind` + `sort`.

No changes to `useDeckCards`, the RPC, the schema, factories, or `Card` types.

## Testing

### Helper (`deckListing.test.ts`)

- `kind: "all"` returns all cards in input order subject to sort.
- `kind: "item"` returns only items; `"spell"` returns only spells.
- `counts` is correct for mixed, single-kind, and empty inputs.
- `sort: "updated"` orders newest-first by `updatedAt`.
- `sort: "name"` orders A→Z, with `localeCompare`-style behavior on accented characters.
- Tie-break for `updated`: equal `updatedAt` falls through to name then id.
- Tie-break for `name`: equal name falls through to id.

### `DeckView.test.tsx`

- Tabs render with correct counts when the deck has a mix of items and spells.
- Tab row is absent when the deck has zero cards.
- Default render lands on All + Last updated, with cards in `updatedAt`-desc order.
- Clicking the Items tab filters the list to items (assert via rendered card names) and writes `kind=item` to the URL.
- Switching the sort dropdown to Name reorders the list alphabetically and writes `sort=name`.
- Mounting the route at `?kind=spell&sort=name` lands on the Spells tab in name order without a click.
- Empty-tab message: a deck with only items renders `"No spells in this deck."` on the Spells tab; counts still show `Items (N)` and `Spells (0)`.
- A read-only deck (non-owner) still shows tabs + sort.

Factories pass only the fields each test asserts on (`name`, `kind`, `updatedAt`).

## Out of scope / follow-ups

- **Sort by rarity / spell level / spell school.** Requires either structured fields on the card model or a tag-string parser tolerant of `"lvl 3"` / `"level 3"` / `"3rd-level"` and abbreviations. Worth reconsidering once tag conventions stabilize, or paired with a free-text filter.
- **Free-text or fuzzy filter inside the deck view.** A natural complement to the tabs; not bundled here to keep this change focused.
