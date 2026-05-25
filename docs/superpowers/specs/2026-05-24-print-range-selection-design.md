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
  *same* range power: arrow to a card (moves focus only), Space to
  toggle, **Shift+↑/↓ to extend a range** (and Cmd/Ctrl+Shift+Home/End
  to extend to an end), Cmd/Ctrl+A to select all shown, type-ahead to
  jump by name.
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

- **No discoverability affordance, for this iteration.** No "Tip:
  Shift-click to select a range" hint or coachmark. Per decision, the
  affordance relies on convention. (Review flagged a one-line static
  hint as near-zero-cost and worth reconsidering, since this is a
  rare-use tool with no analytics to detect a missed gesture — recorded
  as a fast follow, not built here.)
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
with a `react-aria-components` **`ListBox`** in `selectionMode="multiple"`,
`selectionBehavior="toggle"`. RAC's selection manager then provides the
entire Drive-style interaction model — for both pointer and keyboard —
conforming to the WAI-ARIA listbox pattern, with roving focus, the
selection anchor, and `aria-selected` announcements handled by the
library:

- **Pointer:** click toggles a card; Shift-click selects the range from
  the anchor to the clicked card; Cmd/Ctrl-click toggles a single card.
- **Keyboard:** ↑/↓ move focus *without* changing selection
  (`selectOnFocus` is `false` under `toggle` behavior); Space toggles
  the focused card; Shift+↑/↓ extend a contiguous range; Cmd/Ctrl+A
  selects all shown; type-ahead jumps by card name.

### Why `ListBox`, not `GridList`

These rows are a single column of selectable items with **no
interactive children** — just name, kind, and a timestamp, all text.
That is the textbook `role="listbox"` / `role="option"` case. `GridList`
(`role="grid"`/`row`/`gridcell`) is for rows that contain focusable
controls reachable by arrow/tab navigation — which is why the icon
picker (`IconPickerDialog`, genuinely 2-D) correctly uses it, and why
this list should not. Verified against the installed
`react-aria-components@1.17.0` source, `ListBox` gives us, equivalently
to GridList: `selectionMode="multiple"` + `selectionBehavior="toggle"`,
Shift+Arrow range extension, Cmd/Ctrl+A, Shift-click / Cmd-click,
type-ahead, and the same `escapeKeyBehavior` prop. ListBox is the better
fit for three concrete reasons:

1. **No double-announcement.** `GridList` ships its own selection
   `LiveAnnouncer` (`useGridSelectionAnnouncement`) that speaks on every
   in-grid selection change. `ListBox` ships **none** — selection is
   conveyed purely via `aria-selected`. So the modal's existing single
   polite "N cards selected" region stays the *sole* announcer; with
   GridList it would double-speak.
2. **Cleaner SR semantics** — a list of options announces as a list, not
   a one-column table.
3. **No anti-pattern.** A real focusable checkbox is invalid inside
   `role="option"` (RAC enforces "checkboxes are not allowed inside a
   listbox"), so the per-row checkbox becomes a **decorative,
   `aria-hidden` visual** driven by the option's `isSelected` render
   prop — selection state is carried by `aria-selected`, the glyph is
   presentation only. (In a GridList it would be a real
   `<Checkbox slot="selection">`; we don't want that here.)

The cost is a refactor of one component plus a selector migration in its
tests (`checkbox`→`option`); see Tests.

### Escape must close the dialog, not clear selection

RAC's selection layer defaults `escapeKeyBehavior="clearSelection"` —
pressing Escape inside the list would clear the selection (when
non-empty) instead of bubbling up to close the modal. The modal's
contract is "Escape = Cancel = close, discarding the draft". So the
`ListBox` sets **`escapeKeyBehavior="none"`** so Escape propagates to the
Dialog. Confirmed present on `ListBox` in 1.17.0. Gets its own test.

### Source of truth and the filter/search interaction

`draft: Set<CardId>` remains the single source of truth for what will
print — unchanged. The `ListBox` is a *controlled selection view over
only the visible (post-filter, post-search) cards*:

- `selectedKeys` = the visible cards that are in `draft`, `useMemo`'d
  over `[draft, visibleIds]`.
- `onSelectionChange(keys)` merges the new visible selection back with
  the selected-but-hidden cards. This logic is extracted into a **pure,
  unit-tested helper** rather than living inline:

  ```ts
  // printSelectionMerge.ts — colocated with printSelectionLabel.ts
  mergeVisibleSelection(
    draft: Set<CardId>,
    visibleIds: CardId[],
    keys: Selection,        // RAC: "all" | Set<Key>
  ): Set<CardId>
  ```

  - `hidden` = `draft` minus `visibleIds` (cards selected but filtered
    out),
  - `keys === "all"` (the Cmd/Ctrl+A sentinel) resolves to all
    `visibleIds` — and *only* visible ids, because the ListBox's
    collection is fed only the visible cards, so RAC's `"all"` can only
    mean "all visible",
  - `next = hidden ∪ resolvedVisibleSelection`.

  The helper always resolves to a concrete `Set` (never re-emits the
  `"all"` sentinel) and is **idempotent**: re-applying the current
  visible selection yields a content-equal `draft`. This matters under
  React `StrictMode` (double-invoked renders) and because
  `onSelectionChange` calls `setDraft`.

Extracting the helper is also the mitigation for the test-feasibility
risk below: it puts the *correctness* of the merge (hidden∪visible, the
`"all"` sentinel, empty-visible) under fast deterministic unit tests
that don't depend on whether jsdom can fake a Shift-pointer.

This preserves today's contract exactly: filters/search change only
which rows are *shown*, never the selection; selected-but-hidden cards
stay selected and still print; the "N selected cards are hidden by
filters — still included when you Apply" footer line and its "Clear
filters" link behave as before. Range selection necessarily operates
only over visible rows (you can't range across a hidden card), which is
the correct and expected behavior. The merge is the same *shape* as
today's `onHeaderToggle` (`PrintSelectionModal.tsx:49`), which already
splits visible vs. hidden — it's a generalization, not a new concept.

### Header "select all shown" and sidebar

The header tri-state checkbox ("Select all shown cards" + "X of Y
shown" status) stays, sitting *outside* the `ListBox`. It drives the
same `mergeVisibleSelection` path: clear-all-visible / select-all-visible
per the existing two-outcome rule, with the indeterminate (`mixed`)
state when only some visible cards are selected. Keyboard users
additionally get Cmd/Ctrl+A inside the list as an equivalent
select-all-shown.

Note one accepted divergence between the two select-all paths: from a
*partially* selected state, the header follows its "any visible checked →
clear" rule, while RAC's Cmd/Ctrl+A follows "select all, then a second
press deselects all". Different outcomes from the same mixed start, but
both routes go through `mergeVisibleSelection` and neither can drop a
hidden-selected card, so the divergence is acceptable and documented
rather than reconciled. (Test asserts that after Cmd/Ctrl+A the header
reads checked, not mixed.)

The sidebar count, Select-all link, Apply/Cancel, Print-button disable,
and empty-selection messaging are untouched.

### Anchor across view changes

The range anchor is managed internally by RAC, keyed by item. The
modal mutates the visible collection constantly (search-as-you-type,
kind filter, sort flip), so the anchor's referent can move or vanish:

- If the anchor card is filtered/searched out of the collection, a
  subsequent Shift-click extends from RAC's current focus fallback, not
  from the now-absent card.
- If the sort flips, the anchor's *visual position* changes, so a
  Shift-click spans a different visual run than before the flip.

This is accepted: it is fine for the anchor to reset/relocate when the
collection changes, as long as the result is sensible and **never
destructive**. The merge guarantees the worst case is mis-selecting some
*visible* rows (fully recoverable by the user), never dropping a
hidden-selected card. A test pins that Shift-click after a sort change
produces a sane, non-destructive selection.

### Touch and pointers without modifiers

Range-select is inherently a modifier gesture; there is no Shift or Cmd
key on touch. On touch (and any modifier-less pointer), tapping a card
**toggles** it — additive and non-destructive, because
`selectionBehavior="toggle"` makes a plain press a toggle, never a
replace. So touch users keep exactly today's one-tap-per-card behavior;
the range gesture simply doesn't exist for them. Their fast path is the
header "select all shown" + recency sort (tap select-all, then tap off
the few they don't want). This limitation is stated, not hidden, and a
test confirms a plain tap toggles rather than replaces the selection.

## Accessibility

- The list becomes `role="listbox"` with `aria-multiselectable`, each
  card a `role="option"` carrying `aria-selected`; the list gets an
  `aria-label` (e.g. "Cards to print"). RAC manages roving focus, the
  selection anchor, and focus order.
- **Keyboard parity with the pointer** — the direct answer to "how does
  range-select work for keyboard-only users": arrow moves focus only,
  Space toggles, Shift+↑/↓ extend a range (Cmd/Ctrl+Shift+Home/End to an
  end), Cmd/Ctrl+A selects all shown, type-ahead by name. Same power as
  the mouse.
- **One announcer.** ListBox emits no selection live-announcements
  (verified), so the modal's single existing polite region
  (`PrintSelectionModal.tsx:182`) announces the running total and is the
  *only* selection announcer — no double-speak. It covers both header
  select-all and in-list selection changes.
- **`textValue={card.name}`** so type-ahead jumps by name; the kind and
  the relative timestamp stay `aria-hidden` row decoration (as today),
  so the option's accessible name is exactly the card name and
  `getByRole("option", { name })` resolves cleanly. The decorative
  checkbox glyph is `aria-hidden` and not a focusable/queryable control.
- **`escapeKeyBehavior="none"`** so Escape closes the dialog (Cancel).
- **Tab model change (called out):** today every row checkbox is its own
  Tab stop; the ListBox is a single Tab stop with arrow-key roving. Tab
  order: search input → kind toggles → sort → header checkbox → (one Tab
  into the listbox; arrows within) → footer "Clear filters" link →
  Cancel/Apply. The header checkbox precedes the list and remains
  reachable. Net improvement for most, but it is a behavior change for
  Tab-only users; without a hint (deferred) it relies on the standard
  listbox interaction model.
- **Empty state** uses ListBox's `renderEmptyState` to keep "No cards
  match." (a bare `<li>` would be an invalid listbox child).
- Preserved as-is: the header checkbox's `aria-checked="mixed"`
  indeterminate state and stable action-verb name ("Select all shown
  cards") with "X of Y shown" as adjacent status text via
  `aria-describedby`; focus-on-open landing on the search input;
  focus-return-on-close to the "Choose cards…" button; and the focused
  option carrying the existing `--color-focus-ring` outline.

## Components

- **`PrintSelectionModal.tsx`** — the list rendering changes from
  `<ul>` + per-row `Checkbox` to a RAC `ListBox` + `ListBoxItem`s with a
  decorative checkbox glyph. The `draft` state, search/kind-filter/sort,
  header checkbox, footer, and Apply/Cancel wiring are adapted but
  functionally preserved. `selectedKeys` is `useMemo`'d; selection
  changes call the new merge helper.
- **`printSelectionMerge.ts`** (new) + **`printSelectionMerge.test.ts`**
  — the pure `mergeVisibleSelection` helper, colocated with the existing
  `printSelectionLabel.ts`. This is the one genuinely new unit of logic
  and owns selection correctness.
- **`PrintSelectionModal.module.css`** — the row layout (name / kind /
  time grid) moves onto listbox options; the focus ring and selected
  styling carry over. Visual parity with today's rows is a requirement.
  (This modal is screen UI, not print-sensitive, so styling changes here
  are safe.)
- **No changes** to `PrintView.tsx`, `deckListing.ts`,
  `usePrintSelection.ts`, the sidebar, or any print-output code.

**Implementation note:** the decorative checkbox is rendered off the
`ListBoxItem` `isSelected` render prop (children-as-function or
`data-selected`), `aria-hidden`, no `role`. Confirm the existing
`.box` checkbox visual from `lib/ui/Checkbox.module.css` can be reused as
pure presentation, or factor a small shared glyph.

## Tests

Tests split into three layers so correctness doesn't hinge on whether
jsdom can drive modifier gestures (see Risks):

**(a) Pure unit tests — `printSelectionMerge.test.ts`** (no RAC, fast,
deterministic; these own correctness):
- hidden ∪ visible: a selected-but-hidden card survives a visible
  selection change.
- `"all"` sentinel resolves to all visible ids (and only those).
- empty visible set (filtered to nothing) does not drop hidden-selected
  cards.
- idempotency: re-applying the current visible selection yields a
  content-equal set.

**(b) Component structure / smoke tests** (no modifier gestures):
- The list is `role="listbox"` with `aria-multiselectable`; options
  expose `aria-selected`.
- `renderEmptyState` shows "No cards match." and hides the "Updated"
  header (preserves `PrintSelectionModal.test.tsx:147`).
- Escape closes the modal (Cancel), not just clears selection.
- Bare ArrowDown/ArrowUp moves focus without changing selection.
- After Cmd/Ctrl+A the header checkbox reads checked (not mixed).
- Migration of the existing behavior tests (search, kind filter, sort
  recency+Name, header select-all, hidden-by-filters line, Apply count,
  Cancel): assertions preserved, selectors migrated from
  `getByRole("checkbox", { name })` / `toBeChecked()` to
  `getByRole("option", { name })` + `aria-selected`.

**(c) Interaction tests — contingent on the spike (see Risks):**
- Click one card, Shift-click a card further down → the inclusive range
  (recency order) is selected; cards outside are not.
- Range *deselect* semantics, pinned to what RAC actually produces in
  `toggle` behavior (do not assume).
- Cmd/Ctrl-click toggles a single card without changing others.
- Shift+↓ extends selection to the next row(s).
- Range selection spans only visible rows: a card hidden by a filter
  between the anchor and target is unaffected, and the Apply total +
  hidden-by-filters line still reconcile.
- Shift-click after a sort flip is sensible and non-destructive.
- Touch/plain pointer tap toggles a single card (never replaces).

If a gesture proves undrivable in jsdom, correctness is still covered by
layer (a); the affected layer-(c) tests become a best-effort/`@react-aria
/test-utils` or browser-mode follow-up (see Risks).

## Risks

- **jsdom may not reliably drive modifier/pointer gestures** (lead
  risk). This repo has no precedent for `selectionMode="multiple"`,
  Shift-click, Cmd-click, or Shift+Arrow in tests, and already had to
  stub `ResizeObserver` + `clientWidth/Height` in `src/test/setup.ts` to
  make RAC's Virtualizer survive jsdom. jsdom 29 *does* expose a real
  `PointerEvent` carrying `shiftKey`, and RAC takes the pointer path, so
  the gestures are *probably* drivable with modifier-held `user-event`
  clicks — but it's unproven here. **Mitigation:** (1) the pure helper
  owns correctness; (2) a **gating spike** as the plan's first task —
  write one throwaway test driving Shift-click and Shift+↓ against a
  3-option multi-select ListBox and confirm `aria-selected` updates in
  this exact jsdom + RAC 1.17.0 + user-event stack. If it works, write
  layer (c) normally. If not, the fallback is `@react-aria/test-utils`
  (`ListBoxTester`) — **which requires a dependency add (needs
  approval)** — or a browser/e2e follow-up; either way layer (a) + (b)
  still ship.
- **Exact Shift-range / deselect semantics.** RAC defines the resulting
  state of a Shift-extension in `toggle` behavior; the headline "select
  everything since last week" walkthrough depends on it. The spike must
  determine it and the walkthrough/tests must match whichever model RAC
  implements (extend-selects-range vs. mirror-anchor-toggle). Either way
  the operation beats today's per-card path; the click count in the
  walkthrough is finalized after the spike.
- **Controlled selection over a filtered collection.** The
  `selectedKeys` ↔ `draft` merge is the subtle bit; get it wrong and
  hidden-selected cards drop, or Cmd/Ctrl+A over-selects. Covered by the
  layer-(a) tests and the hidden-range layer-(c) test.
- **Escape regression.** Easy to miss `escapeKeyBehavior`; without it
  Escape stops closing the modal. Covered by a test.
- **Touch users get no range gesture** — accepted and documented; the
  header select-all + recency sort is their fast path.
- **Discoverability remains unaddressed** — deferred by decision; review
  noted a one-line static hint as a near-zero-cost fast follow.

## Forward compatibility

If a second multi-select list with range selection appears (e.g. bulk
PDF export of decks), the `ListBox` + filter + header-select-all
arrangement plus `mergeVisibleSelection` could extract into a
`src/lib/ui/` primitive. If such a list ever needs genuinely interactive
per-row controls, that's the point to revisit `GridList` for it
specifically. One consumer isn't a pattern; revisit when there's a
second.
