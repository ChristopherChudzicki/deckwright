# Deck view — kind filter & sort

## Problem

The deck list at `/deck/$deckId` (`src/views/DeckView.tsx`) shows every card in one flat list, sorted by whatever order `get_public_deck_cards` returns. For a deck with a mix of items and spells, there is no way to:

- Scope the view to just items or just spells.
- Reorder by name or recency.

The browse-catalog dialog (`src/views/BrowseApiModal.tsx`) already uses tabs per content type, so users have a precedent for thinking of the deck as splittable by kind.

## Goals

- A kind filter at the top of the deck list: **All**, **Items**, **Spells**, each labeled with its count.
- A sort picker offering **Last updated** (default, newest first) and **Name** (A→Z).
- Active filter and sort are reflected in the URL so refresh/back/share all preserve the view.
- Filtering and sorting happen client-side over the existing `useDeckCards` result — no RPC or schema changes.
- Read-only viewers of a shared deck get the same affordances.

## Non-goals

- Sorting by rarity, spell level, or spell school. The card model is intentionally unstructured (free-form tags), so a robust implementation would require parsing tag strings — deferred until tag conventions stabilize.
- A free-text or fuzzy filter inside the deck view. Tracked separately if needed.
- Bulk operations (multi-select, move, delete-many).
- Surfacing the `ability` card kind. The type exists in `src/cards/types.ts` and `src/decks/schema.ts` but no code path creates one today (the editor uses `RenderableCard`, and no API mapper produces it). Treat the deck list as item-or-spell only.

## URL state

Two search params on the existing `/deck/$deckId` route, declared via TanStack Router's `validateSearch`:

```ts
type DeckSearch = {
  kind: "all" | "item" | "spell"; // default "all"
  sort: "updated" | "name";       // default "updated"
};
```

No route in this repo currently uses `validateSearch`, so this introduces a new pattern. Implement as a hand-rolled validator (no Zod) — the value space is two enums; a small `validateSearch: (raw): DeckSearch => ({ kind: ALLOWED_KINDS.includes(raw.kind) ? raw.kind : "all", sort: ALLOWED_SORTS.includes(raw.sort) ? raw.sort : "updated" })` is enough. Coercion guarantees render code never has to defend against bad params.

Reading uses `useSearch({ from: ... })`; writing uses `navigate({ search: prev => ({ ...prev, kind: "spell" }) })`.

**User-facing label mapping:** `sort: "updated"` displays as `"Last updated"` in the UI.

## Filter / sort helper

A pure helper in the domain folder (matches `src/decks/queries.ts`, `mutations.ts`, `rowMappers.ts`; `src/views/` is component-only):

```ts
// src/decks/deckListing.ts
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
│  ( All (12) | Items (5) | Spells (7) )  Sort: Last updated ▾ │
├─ list (filtered + sorted) ───────────────────────────────────┤
│  card row …                                                  │
│  card row …                                                  │
```

### Kind filter

These are filter buttons, not tabs (the list region below stays the same; only its filter changes), so we use the existing `ToggleButtonGroup` + `ToggleButton` primitives from `src/lib/ui/` rather than react-aria `Tabs`. This avoids the a11y problem of using `Tabs` without `TabPanel` (no `tabpanel` role for screen readers) and matches the existing pattern in `CardEditor.tsx:90-102`.

```tsx
<ToggleButtonGroup
  aria-label="Filter by kind"
  selectionMode="single"
  disallowEmptySelection
  selectedKeys={[kind]}
  onSelectionChange={(keys) => {
    const next = Array.from(keys)[0];
    if (next === "all" || next === "item" || next === "spell") {
      navigate({ search: (prev) => ({ ...prev, kind: next }) });
    }
  }}
>
  <ToggleButton id="all">All ({counts.all})</ToggleButton>
  <ToggleButton id="item">Items ({counts.item})</ToggleButton>
  <ToggleButton id="spell">Spells ({counts.spell})</ToggleButton>
</ToggleButtonGroup>
```

Zero-count buttons render normally (`"Spells (0)"`) — never hidden.

### Sort dropdown

Reuses the `MenuTrigger` + `RACButton` + `Popover` + `Menu` pattern from `BrowseApiModal.tsx`'s `SourceMenu` (lines 144–169) so styling and a11y match the existing source picker. Trigger label: `"Sort: Last updated ▾"` / `"Sort: Name ▾"`. `onAction` writes `sort` to URL.

## Empty states

| Condition | Treatment |
|---|---|
| Deck has zero cards | Toolbar row is hidden. Existing `"No cards yet."` message shows where the list would be. |
| Active filter has zero matches (e.g. Spells in an items-only deck) | Toolbar stays visible. List area shows `"No items in this deck."` / `"No spells in this deck."`. The zero in the count makes the reason obvious. |
| All filter with zero cards | Same as the first row — toolbar hidden, no-cards message shown. (Equivalent to deck-empty.) |

No inline "Add a card" CTA in the empty-tab state; `New card` and `Browse Catalog` are already in the header right above.

## Read-only decks

Shared decks (non-owner viewers) get the full filter + sort toolbar. Filtering and sorting help viewers too. Owner-only affordances (delete, rename) stay gated as today.

## Components touched

- `src/views/DeckView.tsx` — add toolbar row, wire URL params, consume the helper.
- `src/views/DeckView.module.css` — toolbar layout, sort-trigger styling (mirror `BrowseApiModal.module.css`'s `menuTrigger`). No new styles needed for the filter buttons — `ToggleButtonGroup`/`ToggleButton` already own that look.
- `src/decks/deckListing.ts` (new) — pure filter/sort helper.
- `src/decks/deckListing.test.ts` (new) — helper unit tests.
- `src/views/DeckView.test.tsx` — integration tests for filter buttons, sort, URL state, empty states.
- `src/app/router.tsx` — add `validateSearch` to `deckViewRoute` for `kind` + `sort`.

No changes to `useDeckCards`, the RPC, the schema, factories, or `Card` types.

## Testing

### Helper (`src/decks/deckListing.test.ts`)

- `kind: "all"` returns all cards, sorted as requested.
- `kind: "item"` returns only items; `"spell"` returns only spells.
- Ability cards: when `kind: "all"` they are included in the result; for `"item"` / `"spell"` they are excluded.
- `counts` is correct for mixed, single-kind, and empty inputs.
- `sort: "updated"` orders newest-first by `updatedAt`.
- `sort: "name"` orders A→Z, with `localeCompare`-style behavior on accented characters.
- Tie-break for `updated`: equal `updatedAt` falls through to name; equal name then falls through to id. (Two separate assertions so the chain is provable.)
- Tie-break for `name`: equal name falls through to id.

### Route (`src/app/router.tsx` via integration in `DeckView.test.tsx`)

- `validateSearch` coerces an unknown `kind` (e.g. `"weapons"`) to `"all"`.
- `validateSearch` coerces an unknown `sort` to `"updated"`.
- Missing params resolve to defaults.

### `DeckView.test.tsx`

- Filter buttons render with correct counts when the deck has a mix of items and spells.
- Toolbar row is absent when the deck has zero cards.
- Default render lands on All + Last updated, with cards in `updatedAt`-desc order.
- Clicking the Items button filters the list to items (assert via rendered card names) and triggers a `navigate` call writing `kind: "item"`.
- Counts stay correct after filtering: with Items selected, the Spells button still shows `Spells (M)` where M is the unfiltered spell count.
- Switching the sort dropdown to Name reorders the list alphabetically and triggers a `navigate` call writing `sort: "name"`.
- Mounting the route at `?kind=spell&sort=name` lands on Spells in name order without a click.
- Empty-tab message: a deck with only items renders `"No spells in this deck."` on the Spells filter; counts still show `Items (N)` and `Spells (0)`.
- A read-only deck (non-owner) shows the full toolbar (filter buttons + sort).

**URL assertion pattern:** Existing view tests in this repo mock `useNavigate` and `Link` rather than rendering the real router (see `src/views/DeckView.test.tsx`). Assert on the mocked `navigate` call (`expect(navigate).toHaveBeenCalledWith({ search: expect.any(Function) })`, then invoke the callback with a sample prev to verify the produced object). Avoid asserting on `router.state.location.search` — that is not the established pattern here.

Factories pass only the fields each test asserts on (`name`, `kind`, `updatedAt`).

## Out of scope / follow-ups

- **Sort by rarity / spell level / spell school.** Requires either structured fields on the card model or a tag-string parser tolerant of `"lvl 3"` / `"level 3"` / `"3rd-level"` and abbreviations. Worth reconsidering once tag conventions stabilize, or paired with a free-text filter.
- **Free-text or fuzzy filter inside the deck view.** A natural complement to the tabs; not bundled here to keep this change focused.
