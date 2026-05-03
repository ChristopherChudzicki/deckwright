# Deck breadcrumbs in the global header

## Problem

When a user is editing a card or viewing the print sheet, the global header gives no signal of which deck they're inside. Today the header is just `[D&D Cards] [Decks]` plus the user menu. `DeckView` shows the deck name as an H2, but `EditorView` and `PrintView` do not — so context is lost as soon as you click into a card.

## Solution

Replace the existing `Decks` nav link in the global header with a breadcrumb that resolves the current deck (when the URL has a `deckId`) and renders `Decks › <deckName>`. The breadcrumb derives its state from the URL, fetches via React Query, and reuses cached data when present.

## Scope

In scope:
- New `DeckBreadcrumb` component, rendered from `Root.tsx` in the existing nav slot.
- Reads `deckId` from the matched route via TanStack Router's `useMatch` (with `shouldThrow: false`).
- Uses `useDeck(deckId)` (already exists in `src/decks/queries.ts`) to fetch the deck name.
- Loading, error, and "no deck context" states.
- Light styling additions to `root.module.css` for the separator, current-page crumb, and truncation.
- Tests in `Root.test.tsx` (new) covering each render state.

Out of scope:
- 3-level breadcrumbs (e.g. `Decks › Deckname › "Card name"` on the editor). Page content already conveys what you're editing.
- Touching `DeckView`'s in-page H2 title.
- Any change to print output (`@media print` already hides the header).
- Other navigation surfaces (sidebar, footer, mobile menu — none exist today).

## Behavior

### Render rules per route

| Route | Breadcrumb |
|---|---|
| `/` (home), `/login`, `/auth/callback`, `/debug/icons` | `Decks` (link to `/`, current behavior) |
| `/deck/$deckId` | `Decks` (link only — deck name is shown by `DeckView`'s page H2; chrome doesn't repeat it) |
| `/deck/$deckId/edit/$cardId` | `Decks` › `<deckName>` — both clickable, deck name links back to the deck |
| `/deck/$deckId/print` | `Decks` › `<deckName>` — both clickable, deck name links back to the deck |

This is an **ancestors-only** breadcrumb: the current page is never represented in the trail. We chose this over the canonical "current-page-as-leaf" pattern because (a) the editor's leaf would be a card name that can be long or empty (new card), and (b) `DeckView` already prominently shows the deck name as an H2 — so on `/deck/$id` the breadcrumb stays minimal and the page content carries the orientation.

### Loading state

While `useDeck(deckId)` is `pending`, render `Decks › …` (literal ellipsis as plain text). In practice this only flashes on a hard refresh or deep-link, because navigating from `DeckView` populates the React Query cache.

### Error / not-found state

If the deck query errors or returns nothing, render just `Decks` (collapse the trail). The view itself surfaces the error message — the breadcrumb stays out of the way.

### Long deck names

Cap the deck-name crumb at `max-width: 24ch` with `text-overflow: ellipsis` and `white-space: nowrap`. Set `title={deck.name}` for the full name on hover.

## Architecture

### Files

```
src/app/
  Root.tsx                  ← swap nav slot to render <DeckBreadcrumb />
  Root.test.tsx             ← NEW — covers each breadcrumb state
  root.module.css           ← add .breadcrumb, .separator, .crumbCurrent, .crumbName styles
  DeckBreadcrumb.tsx        ← NEW — the component
```

`DeckBreadcrumb` lives next to `Root.tsx` because it's only used there and is tightly coupled to the header's layout slot. No `src/lib/ui/` entry — it's not a reusable primitive.

### Component shape

```tsx
export function DeckBreadcrumb() {
  const deckId = useDeckIdFromUrl();          // undefined when not under /deck/$deckId
  const deckQuery = useDeck(deckId);           // useDeck already no-ops when deckId is undefined
  // … render branches per behavior table above
}
```

`useDeck` (in `src/decks/queries.ts`) already accepts `string | undefined` and is disabled internally when undefined — no extra options needed.

`useDeckIdFromUrl` is a small local helper that wraps the router lookup. Exact invocation (`useMatch({ from: ..., shouldThrow: false })` vs `useMatches().find(...)`) settled at implementation time against the installed router version. Contract: returns `string` when the URL matches `/deck/$deckId/...`, else `undefined`.

The `Decks` link points at `/` (the home/decks-list route).

### Data flow

1. `Root` always mounts `DeckBreadcrumb` in the header.
2. `DeckBreadcrumb` reads the matched route. No `deckId` → render the static `Decks` link.
3. With `deckId` → call `useDeck(deckId)`. Loading / error / success branches as defined above.
4. React Query caches the deck across routes, so transitions inside a deck are instant.

### Accessibility

- Wrapper: `<nav aria-label="Breadcrumb">` containing `<ol>`.
- Each crumb is an `<li>`. Links use the existing `.link` class; the current crumb is plain text inside the `<li>` with `aria-current="page"`.
- The `›` separator is a sibling `<span aria-hidden="true">` between list items (or implemented via a CSS `::after` pseudo with `content: "›"` and not announced — either is fine; tests pin behavior, not implementation).

## Testing

A single new `src/app/Root.test.tsx` covers all states. Each test mounts the router at a specific URL with appropriate MSW handlers, then asserts on the `nav[aria-label="Breadcrumb"]` region.

| Test | Setup | Assertion |
|---|---|---|
| Home shows just "Decks" link | Navigate to `/` | Only one crumb, role=link, name "Decks" |
| Deck route shows deck name as current | `/deck/<id>`, deck factory returns name "X" | `Decks` is a link; `X` rendered as text with `aria-current="page"` |
| Editor route — both crumbs are links | `/deck/<id>/edit/new` | `Decks` and `X` both have role=link |
| Print route — both crumbs are links | `/deck/<id>/print` | `Decks` and `X` both have role=link |
| Loading state | `/deck/<id>`, MSW handler delays response | Renders `Decks › …` while pending |
| Deck not found | `/deck/<id>`, MSW handler returns no rows | Only `Decks` link rendered |
| Long deck name truncates | `/deck/<id>` with very long name | Crumb has the full name in `title` attr |

Existing tests for `DeckView`, `EditorView`, `PrintView`, `HomeView` are unaffected — none assert on the global header today.

## Risks & non-risks

- **Cache miss flicker:** mitigated by the loading state. Acceptable — only visible on hard refresh.
- **TanStack Router API shape:** `useMatch` vs `useMatches` syntax may need a small adjustment at implementation time. Low risk — the contract is trivial.
- **Print output:** the header is already hidden under `@media print`, so no risk to the printed sheet.
- **Layout collision on narrow viewports:** truncation at 24ch keeps the UserMenu visible.
