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
  cards") — those cards should be easy to find, and the picker should
  make it cheap to reduce a full selection down to a small one.
- The print sidebar stays compact. It tells the user how many cards are
  going to print and offers one button to change that. All filtering,
  sorting, search, and checkbox work lives in a modal.

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

The sidebar grows one new block, sitting **above** the existing controls
(what gets printed comes before how it's printed):

- A live count line: **"All 15 cards"**, **"7 of 15 cards"**, or
  **"0 of 15 cards"** depending on selection state.
- A button: **"Customize selection…"** that opens the picker modal.
- A **"Select all"** link, shown only when the selection is narrowed
  (`0 < selection.size < renderable.length`). Hidden at all-selected and
  at zero-selected, since neither case has a useful target for the link.

The full new sidebar order: count → Customize button → Select all link →
divider → Cards per page → Print backs (with sub-option) → Print button →
margins tip.

The Print button is disabled when the selection is empty (in addition to
its existing disabled state when the deck has no renderable cards).

The modal — `PrintSelectionModal` — is where the work happens:

- A **filter row** at the top:
  - **Kind**: chip group (All / Items / Spells), default All.
  - **Updated since**: dropdown (Any time / Last 24 hours / Last 7 days /
    Last 30 days), default Any time. Filters by `updatedAt` against the
    time the modal opened.
  - **Name search**: small text input matching by substring against card
    name. Empty by default.
- A **header bulk-select**: a tri-state checkbox immediately above the
  list (the standard Gmail/GitHub pattern). Its state reflects only the
  *currently visible* (post-filter) cards:
  - All visible checked → checkbox is checked. Click clears all visible.
  - None visible checked → unchecked. Click selects all visible.
  - Some visible checked → indeterminate. Click selects all visible.
  - Label next to it: **"X of Y shown selected"** (live).
- A **card list**, sorted by `updatedAt` descending by default. Each row:
  - Checkbox
  - Card name
  - Small kind indicator
  - Relative "updated" timestamp ("2 hours ago", "3 days ago")
  - A small **"new"** badge if `createdAt === updatedAt` and the card was
    created within the last 7 days — disambiguates recent creations from
    recent edits, since both sort to the top.
- A small **sort selector** (defaults to "Recently edited"; alternative
  "Name A→Z").
- A **footer** with:
  - Running total: **"X cards selected"** — counts the full draft, not
    the visible subset.
  - When filters are active and at least one *hidden* card is selected,
    a second line: **"N selected card(s) hidden by filters."** with a
    "Clear filters" link. This is the central mitigation for the
    filter↔selection coupling risk: it makes invisible state visible.
  - **Cancel** and **Apply** buttons. Apply is labelled
    **"Apply (X cards)"** so the committed total is visible at the click
    moment.

Filters apply only to what's *shown* in the modal — they're a way to
find cards faster, not a saved query. Checkbox state survives filter
changes: checking a card under "Items only", then switching to "All",
keeps it checked. The hidden-checked footer line is the safety net for
users who expect filters to be scoping.

### The friction-case walkthrough

The friction case is: "I just edited two cards in a 15-card deck, I want
to reprint just those two." Realistic flow:

1. Open print view → modal opens with **all 15 cards checked**.
2. Click "Customize selection…".
3. Click the **header tri-state checkbox** once → clears all 15.
   (Equivalent to "Clear" — a single click, not 15 unchecks.)
4. The two recently-edited cards are at the top of the list (default
   sort). Check them.
5. Footer reads **"Apply (2 cards)"**. Click it.
6. Sidebar reads **"2 of 15 cards"**. Click Print.

Five clicks beyond today's default, with no hunting and no ambiguity
about what's selected. The header tri-state is the linchpin: it
collapses "uncheck 13 cards" into one click.

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
include it. The only signal is the sidebar's denominator changing
(`7 of 15` → `7 of 16`). This is accepted as low-frequency and not
worth a dedicated UI hint.

### Empty selection

If the user clears every card and clicks Apply, the sidebar shows
"0 of 15 cards" in a warning treatment and the Print button is disabled
with a small hint ("Select at least 1 card to print"). The sheet preview
area shows a new empty-selection message ("No cards selected — click
Customize selection to choose what to print"), distinct from today's
"No printable cards in this deck yet" message (which still fires only
when the deck itself is empty of renderable cards).

### Select all (from the sidebar)

The "Select all" link returns the selection to the full renderable set
without opening the modal. It's hidden when the selection is already
the full set or empty. Naming choice: "Select all" rather than "Reset",
because "Reset" implies clearing all print settings (per-page, backs,
etc.) — which is misleading.

### Modal close behavior

- **Apply**: commits the modal's draft selection to `PrintView`. Closes
  the modal.
- **Cancel**: discards the draft. Closes the modal. The previous
  selection is preserved.
- **Escape / overlay click**: same as Cancel.

The modal owns its own draft state (filter chips, sort, search input,
draft checkbox set). It receives the current selection as a prop on open
and only commits via an `onApply` callback.

### Re-opening the modal

When the modal opens a second time on a narrowed selection, the draft
starts from the current narrowed checkbox state. Filters reset to
defaults (All / Any time / empty search) and sort resets to "Recently
edited". This gives the user a predictable starting position each open
without losing their committed selection.

### Filters

- **Kind**: single-select chip group, default "All". "Items only" hides
  spell cards from the list; "Spells only" hides item cards. Hidden
  cards retain their checkbox state.
- **Updated since**: single-select dropdown, default "Any time". Filters
  by `updatedAt` against the time the modal opened (not "now" on every
  render — that would shift the cutoff while the user works).
- **Name search**: substring match against card name, case-insensitive.
  Empty matches everything.

All three filters compose with `AND`.

### Sort

Default sort is **`updatedAt` descending** ("Recently edited") — this is
the central UX choice that makes the friction case trivial. The
alternative offered is **name A→Z**. Two options keep the selector
small.

### Sidebar count phrasing

- 0 selected: **"0 of 15 cards"** (warning treatment — uses
  `--color-warning-fg` or equivalent semantic token)
- All selected: **"All 15 cards"**
- Narrowed: **"7 of 15 cards"**

The phrasing drops the redundant "Printing" prefix (the surrounding
Print button context carries that). When the user has changed something
from the default, the count reads differently enough — the word "All"
disappears, a "of" appears — that they notice without needing color
alone.

## Accessibility

- The modal is labelled by its visible heading ("Customize print
  selection" or equivalent), using `aria-labelledby`.
- Focus moves to the **name search input** when the modal opens. On
  close, focus returns to the **"Customize selection…"** button.
- The footer running total (`"X cards selected"`) and the hidden-checked
  line both live inside an `aria-live="polite"` region so screen-reader
  users hear the counts update as they check/uncheck.
- Kind chips are implemented as a `radiogroup` (one checked at a time)
  with proper `aria-label` (e.g., "Filter by card kind").
- The header tri-state checkbox uses the standard `aria-checked="mixed"`
  state when indeterminate.
- The card list is keyboard-navigable: Tab into the list, arrow keys
  move between rows, Space toggles the focused checkbox.
- All filter inputs have visible labels (not placeholder-only).

## Responsive behavior

PrintView's existing 16rem sticky sidebar collapses to a full-width strip
above the sheet at the existing `max-width: 1399px` breakpoint. With the
new count + Customize button + Select all link sitting above the
existing controls, the collapsed layout should still read top-to-bottom
in the same order. No new breakpoint is introduced.

The modal is mobile-tolerant by virtue of using the same
react-aria-components Modal/Dialog primitives as `BrowseApiModal`, which
already handles narrow viewports. The filter row may wrap at very narrow
widths; that's acceptable.

## Components

- **`PrintView.tsx`** — gains selection state, the sidebar count +
  button + select-all link, and a feed of the filtered cards into the
  existing pipeline.
- **`PrintSelectionModal.tsx`** (new, sibling to `BrowseApiModal`) —
  owns the picker UI. Uses the same `react-aria-components` Modal /
  Dialog primitives as `BrowseApiModal`.
- **`PrintSelectionModal.module.css`** (new) — picker layout.

The selection state could live inline in `PrintView` or be extracted to
a `usePrintSelection(deckId)` hook. The implementation plan can decide;
the behavior is the same either way.

## Tests

Behavior tests, written against accessible roles per project convention:

- Print view opens with all renderable cards selected and shows
  "All N cards".
- Clicking "Customize selection…" opens the modal listing all
  renderable cards.
- Focus lands on the name search input on open.
- The card list defaults to `updatedAt` descending — recently-updated
  cards appear first.
- Unchecking one card, clicking Apply, narrows the print to the
  remaining cards. The sidebar count updates to "N-1 of N cards". The
  sheet preview shows only the remaining cards.
- Cancel discards changes; the previous selection is preserved.
- The header tri-state checkbox: clears all when fully selected;
  selects all visible when partially or none selected; reflects
  `aria-checked="mixed"` in the indeterminate case.
- Filtering by kind hides the other kind from the list but does not
  uncheck them. Switching back to "All" shows them re-checked.
- "Updated in last 7 days" hides older cards.
- Name search narrows the list by substring on card name,
  case-insensitive.
- When filters are active and a selected card is hidden, the
  "N selected card(s) hidden by filters" line appears with a working
  "Clear filters" link.
- Apply button text reflects the running total: "Apply (3 cards)".
- Empty selection disables the Print button.
- The sidebar "Select all" link is hidden at all-selected and at zero;
  visible only when narrowed; clicking it restores the full selection.
- An ability card (non-renderable kind) does not appear in the picker.
- The count line in the sidebar updates without losing screen-reader
  focus (sanity check on `aria-live`).

## Risks

- **Long decks in the picker.** A deck with 100+ cards is rare today
  but possible. The picker is a flat scrollable list, not virtualized.
  Around ~150 rows, scroll performance and DOM size start to bite —
  that's the tripwire for adding virtualization. Acceptable for now;
  revisit when actual deck sizes warrant it.
- **Filter↔selection coupling.** Even with the hidden-checked footer
  hint and the Apply-button count, the conceptual model "filters
  narrow the *list*, not the *selection*" requires one moment of
  learning. The hint catches the failure case, but users may still be
  briefly surprised on first encounter. Worth watching in real use.
- **The tri-state header checkbox is the most novel control.** This
  codebase doesn't currently use one. The behavior is the standard
  Gmail/GitHub one, but it deserves a careful implementation and a
  test confirming the `mixed` state.

## Forward compatibility

If a "print a subset" pattern shows up elsewhere — e.g., picking which
decks to export to PDF in bulk — the picker's filter + sortable list +
tri-state-header pattern could extract into a generic primitive in
`src/lib/ui/`. One consumer is not a pattern; revisit when there's a
second.
