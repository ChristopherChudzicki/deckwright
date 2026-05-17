# Selective card printing

> **Status: tentative / draft.** Captures the design converged in discussion.
> Open decisions are called out inline under "Open questions". Not yet
> approved for implementation.

## Problem

`PrintView` always prints the entire deck. There is no way to print a
subset. Two concrete pains follow:

- A user who edits one card must reprint the whole deck to get the
  corrected card onto paper, even if every other card is already printed
  and unchanged.
- A user who only wants a handful of cards (e.g. the spells for one
  character) has to print everything and discard the rest.

The print pipeline has a single chokepoint — `PrintView.tsx:44`:

```ts
const printable = cards.filter(isRenderableCard);
```

Everything downstream (`useExpandedCards` → `pairSlots` → `chunk` → pages
and backs) flows from that array. Subsetting is fundamentally *one extra
filter here* plus UI to drive it; no pagination, imposition, or print-CSS
logic needs to change.

## Goals

- Let the user choose a subset of a deck's renderable cards to print, from
  a **modal dialog** opened off the print sidebar.
- Inside the modal: filter the list by **kind** (All / Items / Spells),
  free-text **name search**, and a **"Needs reprint"** quick-select; plus
  **Select all (filtered)** / **Select none**; plus per-row checkboxes for
  hand-picking.
- Track, **per card**, when it was last printed, so "Needs reprint" can
  mean *never printed, or edited since it was last printed*. This is the
  direct answer to the edit-one-card pain and must remain correct when the
  user only ever prints subsets.
- A **clear, screen-only indicator** in the print view when a strict subset
  is active, so the user can't mistake a partial print for the whole deck.
- Print output and the database are **untouched** — no changes to
  `Card.tsx`, `@page`/`@media print` rules, or `supabase/migrations`.

## Non-goals

- **Shareable / URL selection state.** Considered and rejected: the
  benefits (mostly "survive a refresh") are low-frequency, the cost
  (only/skip encoding, a router validator, stale-ID semantics) is the
  largest single piece of the feature, and "share this exact set" is served
  by sharing the resulting PDF. Selection lives in local state, mirrored to
  localStorage (see below).
- **Database persistence of selection or print history.** Needs a migration
  and raises a "whose history?" question under the public share-by-link
  model. localStorage sidesteps both.
- **Cross-device sync** of reprint state. Printing happens at one physical
  machine/printer; per-browser state is the right scope.
- **Deck-level "last printed at".** Explicitly rejected: a single deck
  timestamp conflates "I printed something" with "I printed *this card*"
  and silently mis-classifies cards once subsets exist. Tracking is
  per-card or it is wrong.
- Mobile-first redesign of `PrintView`. Existing single-column fallback
  stays as-is.
- Changing the cards-per-page / print-backs / content-on-back controls.

## Approach

### Selection model

Selection is represented as an **exclusion set**, not an inclusion set:

```
selected(printable) = printable.filter(c => !excludes.has(c.id))
```

- Default `excludes` = empty ⇒ everything selected ⇒ today's behaviour is
  unchanged until the user opts out of a card.
- A newly added card is selected by default, matching the "print the deck,
  *except*…" mental model. (Trade-off noted under Risks for the hand-pick
  flow.)
- "Print all" / reset = clear `excludes`.

`PrintView.tsx:44` becomes:

```ts
const allRenderable = cards.filter(isRenderableCard);
const printable = allRenderable.filter((c) => !excludes.has(c.id));
```

`allRenderable` feeds the modal and the "N of M" indicator; `printable`
feeds the existing pipeline unchanged.

### Reprint tracking

One localStorage key per deck:

```
deckwright:print:<deckId>  →  {
  excludes: CardId[],                 // selection mirror
  lastPrinted: { [cardId: string]: string /* ISO */ }
}
```

- On **Print**, before `window.print()`, stamp `lastPrinted[id] = now` for
  **exactly the cards in this job** (`printable`), then persist. Subset
  prints only stamp what was actually printed — this is what keeps
  "Needs reprint" correct under subset workflows.
- **Needs reprint** for a card = it has no `lastPrinted` entry **or**
  `card.updatedAt > lastPrinted[id]`.
- `excludes` is mirrored on every selection change so the choice survives a
  refresh / leaving and returning to the print page.

Stamping happens on the Print *button press*, not on confirmed print
completion (the OS dialog is opaque). Accepted limitation, documented in
the helptext-adjacent copy and under Risks.

### Modal: `PrintCardPicker`

Built on the existing modal primitives (`DialogShell`, `DialogHeader` —
same scaffolding as `BrowseApiModal` / `IconPickerDialog`). Structure:

- `DialogHeader` title: "Choose cards to print".
- **Kind filter** — `ToggleButtonGroup` with `All` / `Items` / `Spells`,
  mirroring the pattern already in `DeckView.tsx`. A *view* filter over the
  list, not a selection mutation.
- **Search** — `Input`, filters the list by `name` (case-insensitive
  substring; fuzzy is a non-goal for v1).
- **Quick actions row** — `Select all (filtered)`, `Select none`,
  `Needs reprint (N)`. All operate on the **currently filtered** view, so
  e.g. *Items → Select all* selects only items. `Needs reprint` selects the
  needs-reprint cards within the current filter.
- **List** — one row per filtered card: a checkbox, the card `name`, its
  `headerTags` (muted), and a status badge: *Never printed* /
  *Edited since printed* / *Up to date*.
- Footer: live count ("Printing 12 of 30"), Done/close.

The modal reads `allRenderable`, the current `excludes`, and `lastPrinted`;
it emits a new `excludes` set. It owns no persistence — `PrintView` writes
through to localStorage.

### Subset indicator (screen-only)

In the sidebar (already `display:none` under `@media print`, so zero
print-output risk):

- A compact summary line that doubles as the modal trigger:
  **"Printing 12 of 30 cards — Choose cards…"**.
- When a strict subset is active (`excludes` non-empty), the summary is
  visually emphasised (accent / `--color` token, not a print token) and a
  **"Print all"** reset is shown.
- The Print button label reflects scope: **"Print 12 cards"** when
  subsetting, **"Print"** otherwise. `isDisabled` when the selected set is
  empty (extends today's `printable.length === 0` guard).

No changes to `@page`, `@media print`, `Card.tsx`, `CardBack.tsx`, or the
sheet-preview geometry.

## Architecture

```
src/cards/
  printSelection.ts            — new: pure logic + localStorage I/O
  printSelection.test.ts       — new

src/views/
  PrintCardPicker.tsx          — new: the modal
  PrintCardPicker.module.css   — new
  PrintCardPicker.test.tsx     — new
  PrintView.tsx                — edited: selection state, filter at :44,
                                 sidebar summary + indicator, modal
                                 trigger, Print stamps lastPrinted +
                                 dynamic label
  PrintView.module.css         — edited: screen-only summary/indicator
                                 styles (no print-scoped rules touched)
  PrintView.test.tsx           — edited: subsetting, indicator, stamping
```

Untouched (sensitive): `src/cards/Card.tsx`, `CardBack.tsx`, the printed
half of `PrintView.module.css` (`@page` / `@media print`), and
`supabase/migrations`.

### `src/cards/printSelection.ts` (proposed surface)

```ts
type PrintState = { excludes: string[]; lastPrinted: Record<string, string> };

function loadPrintState(deckId: string): PrintState;
function savePrintState(deckId: string, state: PrintState): void;

// pure helpers (unit-tested without localStorage):
function needsReprint(card: RenderableCard, lastPrinted: Record<string, string>): boolean;
function reprintCount(cards: RenderableCard[], lastPrinted: Record<string, string>): number;
function stampPrinted(
  lastPrinted: Record<string, string>,
  printedIds: string[],
  now: string,
): Record<string, string>;
```

Pure functions take/return plain data; the React layer owns when to load,
save, and stamp. localStorage access is wrapped in try/catch and degrades
to in-memory-only on failure (private-mode / quota), with no user-facing
error — selection still works for the session.

## Open questions

1. **Per-row control primitive.** `src/lib/ui/` has no `Checkbox`. Options:
   (a) add a small `Checkbox` primitive (a recognised design-system pattern;
   a second consumer is plausible), (b) use a `react-aria-components`
   `GridList`/`ListBox` with `selectionMode="multiple"` and its built-in
   selection affordance, or (c) reuse `ToggleButton` per row. Leaning (a)
   for list-row semantics + a11y; decide before implementation.
2. **Status badge relative time.** "Edited 3d ago" needs a small relative
   formatter. Reuse an existing helper if one exists; otherwise an inline
   `Intl.RelativeTimeFormat` wrapper rather than a new dependency.
3. **Hand-pick + new card interaction** — see Risks; confirm the
   exclusion-set default is acceptable for the "Select none, pick 3" flow.

## Tests

- **`printSelection.test.ts`** — `needsReprint`: never-printed → true;
  `updatedAt > stamp` → true; `updatedAt <= stamp` → false. `stampPrinted`
  only writes the passed ids and overwrites prior stamps. `reprintCount`
  over a mixed list. localStorage round-trip via a mocked store; corrupt /
  absent value yields the empty default; throwing storage degrades quietly.
- **`PrintCardPicker.test.tsx`** — kind filter narrows rows; search
  narrows rows; Select all / none act on the *filtered* view, not the whole
  deck; `Needs reprint (N)` count and selection are correct; toggling a row
  updates the emitted excludes; footer count updates. Queries by role
  (`getByRole`), per repo convention.
- **`PrintView.test.tsx`** — a subset actually shortens the rendered pages;
  indicator reads "N of M" and shows "Print all" only when subsetting;
  Print stamps only the selected ids and not excluded ones; default state
  (no localStorage) selects all and matches current output; empty selection
  disables Print.

No new e2e spec for v1; the existing `e2e/print-pagination.spec.ts`
remains the print-output regression guard and must stay green (subset
defaults to all, so it is unaffected).

## Risks

- **Stamp-on-press, not on completion.** If the user opens the print
  dialog and cancels, cards are marked printed anyway. Standard trade-off;
  the alternative (`afterprint`) is unreliable across browsers and still
  can't distinguish "printed" from "saved as PDF then discarded".
- **localStorage is per-browser/device.** Reprint state does not follow the
  user to another machine. Acceptable: printing is inherently
  machine-local. Documented, not mitigated.
- **Exclusion-set default vs hand-pick.** "Select none then pick 3" is
  stored as "exclude all-but-3"; a card added later would auto-join the
  print set, which can surprise in a hand-pick mindset. The alternative
  (inclusion set) surprises the far more common "print all" flow when new
  cards *don't* join. Exclusion is the lesser surprise for the dominant
  use; revisit if hand-pick proves the primary workflow.
- **Modal scope creep.** Kind + search + needs-reprint is the agreed v1
  surface. Fuzzy search, tag filters, grouping, and saved selections are
  explicitly out; resist adding them under this spec.
- **Indicator must stay screen-only.** Any styling for the
  summary/indicator must use screen tokens and live outside
  `@media print`. A code-review check when touching `PrintView.module.css`
  is the mitigation.
