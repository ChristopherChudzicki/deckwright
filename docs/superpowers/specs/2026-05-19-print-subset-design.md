# Print a subset of a deck

## Problem

When a deck has been printed once and the user edits one or two cards, the
print view forces them to reprint the entire deck. The current `PrintView`
renders every renderable card in the deck — there's no way to narrow which
cards make it onto the sheet. Users either reprint a full deck to refresh
two cards or skip reprinting and live with an out-of-date physical deck.

The friction is real for the common case: small edits to a deck someone has
already printed. The fix is to let the user choose a subset before
printing, without complicating the default "print the whole deck" path.

## Goals

- The user can narrow what gets printed to an arbitrary subset of the
  deck's renderable cards.
- The default is unchanged: opening the print view selects every
  renderable card, so a user who never touches the selection UI gets
  today's behavior.
- Choosing a subset is fast for the friction case ("I just edited two
  cards") — those cards should be easy to find and check, without
  scrolling through a long list.
- The print sidebar stays compact. It tells the user how many cards are
  going to print and offers one button to change that. All filtering,
  sorting, and checkbox work lives in a modal.

## Non-goals

- **No tracking of "last printed at" per card.** Considered and rejected:
  there's no reliable browser signal that distinguishes a real print from a
  cancelled print dialog, and an explicit "Mark as printed" button adds a
  step users will forget. The reliable substitute — sorting by `updatedAt`
  in the picker — gives the same workflow without a second source of
  truth.
- **No URL persistence of the selection.** Sharing a print is done by PDF,
  not by URL. Selection lives in component state for the duration of the
  print view; refreshing resets to "all cards".
- **No cross-device persistence.** Selection is per-tab, per-visit.
- **No new card-listing primitive.** The picker reuses existing list/row
  patterns; it doesn't introduce a virtualized table or new sort framework.
- **No changes to print output, page layout, back imposition, or the
  `Card` component.** The pipeline downstream of card filtering is
  untouched — it just receives a shorter array.

## Approach

`PrintView` gains a single new piece of state: which renderable cards are
selected for printing, as a set of card IDs. The set defaults to "every
renderable card in the deck" once the deck loads, and is plain component
state — ephemeral, lost on refresh.

The sidebar grows one block above its existing controls:

- A live count: **"Printing 7 of 15 cards"** (or "Printing all 15 cards"
  when the selection is the full deck).
- A button: **"Customize selection…"** that opens a modal.
- When the selection is narrowed, a small "Reset" affordance that returns
  to all-cards.

The Print button is disabled when the selection is empty (in addition to
its existing disabled state when the deck has no renderable cards).

The modal — `PrintSelectionModal` — is where the work happens:

- A filter row at the top: **kind** (All / Items / Spells) and
  **updated-since** (Any time / Last 24h / Last 7 days / Last 30 days).
- A card list, sorted by `updatedAt` descending by default. Each row shows
  a checkbox, the card name, a small kind indicator, and a relative
  "updated" timestamp ("2 hours ago", "3 days ago").
- Bulk actions on the currently filtered view: **Select all visible** and
  **Clear visible**.
- A footer with the running count ("X cards selected"), **Cancel**, and
  **Apply**.

Filters apply only to what's *shown* in the modal — they're a way to find
cards faster, not a saved query. Checkbox state survives filter changes:
checking a card under "Items only", then switching to "All", keeps it
checked.

The friction case is now: open print view → click "Customize selection…"
→ the two recently-edited cards are at the top of the list → check them
→ Apply → Print. Three to four clicks beyond today's default.

## Behavior details

### Initial selection

When `useDeckCards` resolves, the selection is initialized to
`new Set(renderable.map(c => c.id))`. This happens once per deck load.
Subsequent re-renders don't reset the selection.

### Selection state through deck mutations

If a card is removed from the deck while the print view is open
(unlikely, but possible if the user has the deck editor open in another
tab), its ID drops out of the selection automatically — the print
pipeline filters by `selection.has(card.id)` on the current cards list,
so missing cards simply aren't there.

If a card is added to the deck while the print view is open, the new
card is **not** auto-added to the selection. The user opens the modal to
include it. This is the predictable behavior: a narrowed selection stays
narrowed until the user changes it.

### Empty selection

If the user clears every card and clicks Apply, the sidebar shows
"Printing 0 of 15 cards" and the Print button is disabled with a small
hint ("Select at least 1 card to print"). The sheet preview area shows
a new empty-selection message ("No cards selected — click Customize
selection to choose what to print"), distinct from today's "No
printable cards in this deck yet" message (which still fires only when
the deck itself is empty of renderable cards).

### Reset to all

A "Reset" link next to the count returns the selection to the full
renderable set. The modal is closed; no dialog needed.

### Modal close behavior

- **Apply**: commits the modal's draft selection to `PrintView`. Closes
  the modal.
- **Cancel**: discards the draft. Closes the modal. The previous
  selection is preserved.
- **Escape / overlay click**: same as Cancel.

The modal owns its own draft state (filter chips, sort, draft checkbox
set). It receives the current selection as a prop and only commits via an
`onApply` callback.

### Filters

- **Kind**: a single-select chip group. Default "All". "Items only" hides
  spell cards from the list; "Spells only" hides item cards. Hidden cards
  retain their checkbox state.
- **Updated since**: a single-select dropdown. Default "Any time". Other
  options: "Last 24 hours", "Last 7 days", "Last 30 days". Filters by
  `updatedAt` against the current time at modal open.

### Sort

Default sort is `updatedAt` descending — most-recently-edited cards at
the top. This is the central UX choice that makes the friction case
trivial. A small sort selector lets the user switch to name-ascending if
they prefer alphabetical.

### Bulk actions

- **Select all visible**: checks every card currently visible under the
  active filters.
- **Clear visible**: unchecks every card currently visible under the
  active filters.

Both operate on the *visible* subset, not the full deck, so the user can
say "all items, plus those two specific spells" by combining filter +
bulk action + individual checks.

### Sidebar count phrasing

- 0 selected: "Printing 0 of 15 cards" (red/warning treatment)
- All selected: "Printing all 15 cards"
- Narrowed: "Printing 7 of 15 cards"

The phrasing emphasizes the *narrowed* state — when the user has changed
something from the default, the count reads differently enough that they
notice.

## Components

- **`PrintView.tsx`** — gains selection state, the sidebar count + button
  + reset, and a feed of the filtered cards into the existing pipeline.
- **`PrintSelectionModal.tsx`** (new, sibling to `BrowseApiModal`) —
  owns the picker UI. Uses the same `react-aria-components` Modal /
  Dialog primitives as `BrowseApiModal`.
- **`PrintSelectionModal.module.css`** (new) — picker layout.

The selection state could live inline in `PrintView` or be extracted to a
`usePrintSelection(deckId)` hook. The implementation plan can decide; the
behavior is the same either way.

## Tests

Behavior tests, written against accessible roles per project convention:

- Print view opens with all renderable cards selected and shows
  "Printing all N cards".
- Clicking "Customize selection…" opens a modal listing all renderable
  cards.
- The card list defaults to `updatedAt` descending — recently-updated
  cards appear first.
- Unchecking one card, clicking Apply, narrows the print to the
  remaining cards. The sidebar count updates. The sheet preview shows
  only the remaining cards.
- Cancel discards changes; the previous selection is preserved.
- Filtering by kind hides the other kind from the list but does not
  uncheck them. Switching back to "All" shows them re-checked.
- "Updated in last 7 days" hides older cards.
- "Select all visible" + "Clear visible" operate on the filtered subset.
- Empty selection disables the Print button.
- Reset link returns the selection to all cards.
- An ability card (non-renderable kind) does not appear in the picker.

## Risks

- **Selection vs. deck mutation.** The "new cards aren't auto-added"
  rule is the predictable behavior, but a user who edits in another tab
  could be confused. The sidebar count showing "Printing 7 of 16 cards"
  (note 16, not 15) is the only signal. Acceptable: most users won't
  edit while the print view is open, and the count change is visible.
- **Long decks in the picker.** A deck with 100+ cards is rare today
  but possible. The picker is a flat scrollable list, not virtualized.
  If decks grow much larger, this becomes a performance concern.
  Punt; revisit when actual deck sizes warrant it.
- **Filter state confusion.** The filter row helps find cards but
  doesn't *commit* anything. A user could plausibly check a few cards
  under "Items only", then hit Apply without realizing all the
  invisible cards are still selected. The footer count ("X cards
  selected" — counts the full draft, not the visible subset) is the
  mitigation, but worth watching in UX review.

## Forward compatibility

If a "print a subset" pattern shows up elsewhere — e.g., picking which
decks to export to PDF in bulk — the picker's filter + sortable list +
bulk action pattern could extract into a generic primitive in
`src/lib/ui/`. One consumer is not a pattern; revisit when there's a
second.
