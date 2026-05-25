# Print selection: Drive-style range selection

## Problem

The "Choose cards to print" modal (`PrintSelectionModal`, shipped in
#84) lists each renderable card with its own independent checkbox.
Selecting a subset means toggling cards one at a time, or hitting the
header "select all shown" and then unchecking the ones you don't want.

For the common goal — grab a contiguous run of recently-edited cards
("everything I've touched since last week"), which the default recency
sort already floats to the top of the list — there's no fast gesture.
Narrowing a 20-card deck to its 12 newest is 12 clicks (or 8 unchecks
after select-all). Every other list-selection UI the user reaches for
(Google Drive, Gmail, the macOS Finder) lets them click one item and
Shift-click another to take the whole range in two clicks.

## Goals

- **One-gesture range select.** Click the first card, Shift-click the
  last → every card between them (inclusive) is selected. The Drive /
  Gmail / file-manager convention.
- **Keyboard parity, not a lesser path.** Keyboard-only users get the
  *same* range power: arrow to a card, Space to toggle, Shift+↑/↓ (and
  Shift+Home/End) to extend a range, Cmd/Ctrl+A to select all shown,
  type-ahead to jump by name.
- **Additive single toggle.** Cmd/Ctrl-click toggles one card without
  disturbing the rest — like Drive's checkbox column.
- **Everything else is preserved exactly.** Name search, the kind
  filter (All / Items / Spells), the sort selector with its **recency
  default and Name option**, the header "select all shown" tri-state,
  the "hidden by filters — still included when you Apply" footer line +
  Clear-filters link, Apply/Cancel, and the whole `PrintView` sidebar —
  all unchanged in behavior.
- **No regression to print output.** The pipeline downstream of the
  modal still receives the same `Set<CardId>`.

## Non-goals

- **No discoverability affordance, for now.** No "Tip: Shift-click to
  select a range" hint or equivalent. Range-select is treated as an
  expected affordance (Drive/Gmail add no hint either). Explicitly
  deferred — revisit only if real use shows users miss it.
- **No recency/date *filter*.** ("Edited this week / since a date.")
  The existing recency *sort* already surfaces recent cards at the top
  and is preserved; a date filter is a possible future follow-up, out
  of scope here. Considered and deferred so this change stays a pure
  interaction-layer upgrade.
- **No "true Finder" destructive plain-click.** A plain click or Space
  toggles a card; it never clears the rest of the selection. The
  checked set *is* the print output, so a click that wipes the prior
  selection would be a footgun. (This is why Finder's model was rejected
  in favour of Drive's checkbox-column model.)
- **No changes to filters/search/sort logic, the sidebar,
  `usePrintSelection`, the print pipeline, page layout, or the `Card`
  component.** Only how the list renders and how selection is driven
  changes.

## Approach

Replace the hand-rolled `<ul>` of name-labelled `lib/ui/Checkbox` rows
with a `react-aria-components` **`GridList`** in
`selectionMode="multiple"`, `selectionBehavior="toggle"`. RAC's
selection manager then provides the entire Drive-style interaction
model — for both pointer and keyboard — conforming to the WAI-ARIA
selection pattern, with roving focus, the selection anchor, and
`aria-selected` announcements handled by the library:

- **Pointer:** click toggles a card; Shift-click selects the range from
  the anchor to the clicked card; Cmd/Ctrl-click toggles a single card.
- **Keyboard:** ↑/↓ move focus; Space toggles the focused card;
  Shift+↑/↓ and Shift+Home/End extend a contiguous range; Cmd/Ctrl+A
  selects all shown; type-ahead jumps by card name.

Each row still renders a real selection checkbox
(`<Checkbox slot="selection">`), preserving the visible, clickable
checkbox affordance from today's UI and from Drive/Gmail. The range
anchor is managed internally by RAC.

**Why `GridList` over a hand-rolled Shift-click handler.** The mouse
part (Shift-click range) is easy to hand-roll; the *keyboard* part —
Shift+Arrow range extension, roving focus, select-all, type-ahead, and
correct `aria-multiselectable` / `aria-selected` semantics — is exactly
the part that's easy to get subtly wrong by hand, and it's the direct
answer to the a11y concern that motivated this work. RAC owns it. The
cost is a refactor of one component plus a selector migration in its
tests (see Tests).

### Escape must close the dialog, not clear selection

RAC's `GridList` defaults to `escapeKeyBehavior="clearSelection"` —
pressing Escape inside the list would clear the selection instead of
bubbling up to close the modal. The modal's current contract is
"Escape = Cancel = close, discarding the draft". So the `GridList` must
set **`escapeKeyBehavior="none"`** so Escape propagates to the Dialog
and closes it, preserving today's behavior. This is a known gotcha and
gets its own test.

### Source of truth and the filter/search interaction

`draft: Set<CardId>` remains the single source of truth for what will
print — unchanged. The `GridList` is a *controlled selection view over
only the visible (post-filter, post-search) cards*:

- `selectedKeys` = the visible cards that are in `draft`.
- `onSelectionChange(keys)` merges the new visible selection back with
  the selected-but-hidden cards:
  - `hidden` = `draft` minus the currently visible ids (cards selected
    but filtered out),
  - `keys === "all"` (the Cmd/Ctrl+A sentinel) resolves to all visible
    ids,
  - `next = hidden ∪ resolvedVisibleSelection`.

  We always resolve to a concrete `Set` and never pass the `"all"`
  sentinel back into `selectedKeys`.

This preserves today's contract exactly: filters/search change only
which rows are *shown*, never the selection; selected-but-hidden cards
stay selected and still print; the "N selected cards are hidden by
filters — still included when you Apply" footer line and its "Clear
filters" link behave as before. Range selection necessarily operates
only over visible rows (you can't range across a hidden card), which is
the correct and expected behavior. The merge helper is the one genuinely
new piece of logic — it's the same shape as today's `onHeaderToggle`,
which already splits visible vs. hidden.

### Header "select all shown" and sidebar

The header tri-state checkbox ("Select all shown cards" + "X of Y
shown" status) stays, sitting *outside* the `GridList` (GridList has no
built-in header). It drives the same visible-selection merge:
clear-all-visible / select-all-visible per the existing two-outcome
rule, with the indeterminate (`mixed`) state when only some visible
cards are selected. Keyboard users additionally get Cmd/Ctrl+A inside
the list as an equivalent select-all-shown. The sidebar count,
Select-all link, Apply/Cancel, Print-button disable, and
empty-selection messaging are untouched.

## Accessibility

This is the heart of the change.

- The list becomes a `role="grid"` (`GridList`) with
  `aria-multiselectable`, each card a `role="row"` carrying
  `aria-selected`. RAC manages roving focus, the selection anchor, and
  selection announcements.
- **Keyboard parity with the pointer** — the direct answer to "how does
  range-select work for keyboard-only users": Space toggles the focused
  card; Shift+↑/↓ and Shift+Home/End extend a contiguous range;
  Cmd/Ctrl+A selects all shown; type-ahead by name. Same power as the
  mouse, same as Drive.
- Each row keeps a real selection checkbox, and the row's `textValue` is
  the card name so type-ahead and the row's accessible name are by name.
- `escapeKeyBehavior="none"` so Escape closes the dialog (Cancel),
  matching today.
- Preserved as-is: the header checkbox's `aria-checked="mixed"`
  indeterminate state and stable action-verb name ("Select all shown
  cards") with "X of Y shown" as adjacent status text via
  `aria-describedby`; the single polite live region announcing the
  selected total; focus-on-open landing on the search input; and
  focus-return-on-close to the "Choose cards…" button.
- No discoverability hint is added (deferred); the affordance relies on
  convention.

## Components

- **`PrintSelectionModal.tsx`** — the list rendering changes from
  `<ul>` + per-row `Checkbox` to a RAC `GridList` + `GridListItem`s. The
  `draft` state, search/kind-filter/sort, header checkbox, footer, and
  Apply/Cancel wiring are adapted but functionally preserved. The
  `selectedKeys` ↔ `draft` merge (hidden ∪ visible, plus the `"all"`
  sentinel) is the one new piece of logic.
- **`PrintSelectionModal.module.css`** — the row layout (name / kind /
  time grid) moves onto GridList rows/items; visual parity with today's
  rows is a requirement. (This modal is screen UI, not print-sensitive,
  so styling changes here are safe — but it should look unchanged apart
  from selection behavior.)
- **No changes** to `PrintView.tsx`, `deckListing.ts`,
  `usePrintSelection.ts`, the sidebar, or any print-output code.

**Implementation notes for the plan:**

- Confirm RAC `GridList`'s selection-checkbox labeling and how the row
  accessible name composes (name alone vs. name + kind + time) — this
  determines the test selectors. Verify early.
- Verify whether `lib/ui/Checkbox` can be reused via `slot="selection"`
  or whether a thin GridList-specific selection checkbox is cleaner.
- If `GridList`'s real-checkbox rendering proves awkward, a `ListBox`
  (`role="listbox"` / `role="option"` with decorative checkbox visuals)
  is the lighter alternative with the *same* selection semantics; the
  plan may choose it after a short spike. Either way the external
  behavior in Tests must hold.

## Tests

**Migration.** Most existing modal tests keep their *assertions* but
change *selectors*: rows are queried by
`getByRole("row", { name: /CardName/ })` and asserted via
`aria-selected`, replacing `getByRole("checkbox", { name })` /
`toBeChecked()`. The behavior tests for search, kind filter, sort
(recency default + Name), header select-all, hidden-by-filters line,
Apply count, and Cancel are all preserved with updated selectors. This
mechanical migration is the bulk of the diff.

**New behavior tests** (against accessible roles):

- Click one card, then Shift-click a card further down → every card in
  the inclusive range (recency order) is selected; cards outside it are
  not.
- Range *deselect*: from an all-selected list, toggle one card off, then
  Shift-click another → the range takes the toggled state. (Pin the
  exact state RAC produces rather than assuming it.)
- Cmd/Ctrl-click toggles a single card without changing the others.
- Keyboard: focus a row, Shift+↓ extends selection to the next row(s);
  Cmd/Ctrl+A selects all shown; Space toggles the focused row.
- Range selection spans only visible rows: with a filter hiding a card
  whose recency position falls between the anchor and target, that
  hidden card is unaffected, and the Apply total + hidden-by-filters
  line still reconcile.
- Escape closes the modal (Cancel) rather than only clearing the
  selection.
- The list exposes `aria-multiselectable` and rows expose
  `aria-selected` (sanity check on the ARIA pattern).

## Risks

- **Test selector migration surface.** The change touches most existing
  modal tests. They're role-based and the behaviors are unchanged, so
  it's mechanical — but confirm the row accessible name early so the new
  selectors are right the first time.
- **Controlled selection over a filtered collection.** The
  `selectedKeys` ↔ `draft` merge (hidden ∪ visible, plus the `"all"`
  sentinel) is the one subtle bit. Get it wrong and either
  hidden-selected cards drop out on a selection change, or Cmd/Ctrl+A
  over-selects. Covered by the hidden-range test.
- **Exact Shift-range semantics.** RAC defines the resulting state of a
  Shift-extension; the plan should pin it with a test rather than
  assume, and confirm it matches the "click first, Shift-click last →
  both ends and everything between selected" expectation for the
  recency use case.
- **Escape behavior regression.** Easy to miss `escapeKeyBehavior`;
  without it, Escape stops closing the modal. Covered by a test.

## Forward compatibility

If a second multi-select list with range selection appears (e.g. bulk
PDF export of decks), the `GridList` + filter + header-select-all
arrangement could extract into a `src/lib/ui/` primitive. One consumer
isn't a pattern; revisit when there's a second.
