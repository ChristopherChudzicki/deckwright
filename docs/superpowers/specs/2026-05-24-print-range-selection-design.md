# Print selection: Drive-style range selection

## Problem

The "Choose cards to print" modal (`PrintSelectionModal`, shipped in
#84) lists each renderable card with its own independent checkbox.
Selecting a subset means toggling cards one at a time, or hitting the
header "select all shown" and then unchecking the ones you don't want.

For the common goal — keep a contiguous run of recently-edited cards
("everything I've touched since last week"), which the default recency
sort already floats to the top of the list — the work is **linear in
the number of cards toggled**. Narrowing a 20-card deck to its 12 newest
is 8 unchecks; a 50-card deck to its 30 newest is 20. Every other
list-selection UI the user reaches for (Google Drive, Gmail, the macOS
Finder) makes a contiguous range a **constant** two-or-three-gesture
operation regardless of run length.

## Goals

- **Gmail-style range select.** Click a card, then Shift-click another →
  the whole range takes the *first* card's state: Shift-click after
  selecting **fills** the range (including gaps); Shift-click after
  deselecting **clears** it. Constant gesture regardless of run length.
- **Keyboard parity, not a lesser path.** Keyboard-only users get the
  *same* power: arrow to a card (moves focus only), Space to toggle,
  **Shift+↑/↓ to extend a range** (Cmd/Ctrl+Shift+Home/End to extend to
  an end), Cmd/Ctrl+A to select all shown, type-ahead to jump by name.
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

Note: RAC's native Shift-extend is additive-only (it can't deselect a
range), so the anchor-mirror rule is layered on top with a custom override.
See "Selection semantics" in Approach for how and why.

## Non-goals

- **No heavy discoverability affordance** — no coachmark, animated tour,
  or dismissible callout. A *single static one-line hint* near the list
  **is** in scope (see Components / Accessibility); it was decided in
  favor after review flagged the Tab-model change (Accessibility) as a
  mild regression for existing keyboard users that the hint also
  mitigates.
- **No recency/date *filter*.** ("Edited this week / since a date.") The
  existing recency *sort* already surfaces recent cards at the top and is
  preserved; a date filter is a possible future follow-up, out of scope.
- **No "true Finder" destructive plain-click.** A plain click or Space
  toggles a card; it never clears the rest. The checked set *is* the
  print output, so a click that wipes the prior selection would be a
  footgun. (This is why Finder's replace-on-click model was rejected for
  Drive's checkbox-column model.)
- **No changes to filter/search/sort logic, the sidebar,
  `usePrintSelection`, the print pipeline, page layout, or the `Card`
  component.**

Scope note: this is *not* a "pure interaction-layer" tweak — be honest
about the surface. It is a contained rewrite of the modal's card list
(`<ul>` + per-row `Checkbox` → RAC `ListBox`/`ListBoxItem` with a
decorative selection glyph), one new pure helper, a CSS migration of the
row layout onto options, and a **partly non-mechanical** test migration
(see Tests). The print pipeline, sidebar, and hook are genuinely
untouched; the modal's list is genuinely rewritten.

## Approach

Replace the hand-rolled `<ul>` of name-labelled `lib/ui/Checkbox` rows
with a `react-aria-components` **`ListBox`** in `selectionMode="multiple"`,
`selectionBehavior="toggle"`. RAC handles the WAI-ARIA listbox pattern,
roving focus, `aria-selected`, type-ahead, and the keyboard model for free;
the Gmail-style Shift-**click** rule is layered on top (see "Selection
semantics"):

- **Pointer:** click toggles a card; Shift-click sets the anchor→clicked
  range to the *anchor's* state (fill or clear); Cmd/Ctrl-click toggles one.
- **Keyboard:** ↑/↓ move focus *without* changing selection
  (`selectOnFocus` is `false` under `toggle`); Space toggles; Shift+↑/↓
  extend the selection (additive — RAC-native); Cmd/Ctrl+A selects all
  shown; type-ahead jumps by name.

### Selection semantics: Gmail-style range (anchor-mirror)

A Shift-click sets the whole range from the **anchor** (the last
plain-clicked card, after its own toggle) to the clicked card to the
**anchor's** current state — anchor selected → the range *fills* (including
unselected cards in between); anchor deselected → the range *clears*. Plain
and Cmd/Ctrl click toggle one card.

There's no formal standard for the *edge* behaviors (Finder, Gmail, etc. all
differ), so we match **Gmail**, since it's a checkbox list like ours:
*extending* the range includes the clicked card, but *shrinking* it back
inward (Shift-clicking nearer the anchor) excludes the clicked card and drops
everything out to the previous extent — e.g. click 1 → Shift-5 → Shift-3
leaves {1, 2}, not {1, 2, 3}. (Finder keeps the clicked card; we don't.)

RAC's `ListBox` does **not** provide this rule, so it's layered on with care.
Three RAC behaviors (verified against the installed 1.17.0 source) shaped
the implementation:

1. **Shift-extend is additive-only.** `SelectionManager.extendSelection`
   always `.add()`s the anchor→target range; it never deselects. So we
   can't lean on RAC for the clear/fill rule — on a Shift-click we recompute
   the range and overwrite RAC's result. We rebuild from a **base snapshot**
   taken when the anchor was set (not the live draft), so a second
   Shift-click from the same anchor *re-bases* the range rather than stacking
   on the prior range, and we track the range's moving end (`extentRef`) to
   tell an extend (include the clicked card) from a shrink (exclude it).
2. **No anchor is recorded on a *deselecting* click** (`toggleSelection`
   sets `anchorKey` only when adding). So "click a card to start,
   Shift-click another to clear the run" has no RAC anchor. We track our
   **own** anchor: a `data-card-id` on each `ListBoxItem`, read in
   `onPointerDownCapture` on every plain (non-Shift) click that lands on an
   option (a stray Shift+pointerdown on chrome can't set the flag).
3. **`onSelectionChange` is suppressed when the result is unchanged**
   (an `!equalSets` guard) — exactly the deselect-an-already-selected-range
   case, so a change-handler override would never fire. We enable
   react-stately's **`allowDuplicateSelectionEvents`** (a real option RAC
   doesn't surface on `ListBox`'s prop types — passed via a small typed
   cast, `SelectionListBox`).

`onPointerDownCapture` also records whether the change came from a
Shift+*pointer* (the event carries `shiftKey`), so the anchor-mirror
override applies only to Shift-**click**. **Keyboard Shift+Arrow stays
additive** (RAC-native): the anchor-mirror rule fights RAC's incremental
grow/shrink, and additive extension is the natural keyboard behavior. The
override mutates RAC's `Selection` object in place (clear + rebuild) so its
anchor/current keys — needed for keyboard Shift+Arrow — survive.

**Drivability is proven.** A throwaway spike confirmed that Shift-click,
Cmd/Ctrl-click, Shift+Arrow, and `onPointerDownCapture`'s `shiftKey` all
work in this exact jsdom + `react-aria-components@1.17.0` +
`@testing-library/user-event` stack, so the interaction tests are writable
directly in jsdom — **no `@react-aria/test-utils` dependency and no
browser/e2e harness are required.** (See Validation.)

### Why `ListBox`, not `GridList`

These rows are a single column of selectable items with **no interactive
children** — name, kind, timestamp, all text. That is the textbook
`role="listbox"`/`option` case. `GridList` (`role="grid"`/`row`/
`gridcell`) is for rows containing focusable controls reachable by
arrow/tab navigation — which is why the icon picker (`IconPickerDialog`,
genuinely 2-D) correctly uses it and this list should not. Verified
against the installed 1.17.0 source, `ListBox` matches `GridList` on
`selectionMode="multiple"` + `selectionBehavior="toggle"`, Shift+Arrow,
Cmd/Ctrl+A, Shift-/Cmd-click, type-ahead, and `escapeKeyBehavior`, and
is the better fit for three reasons:

1. **No double-announcement.** `GridList` ships its own selection
   `LiveAnnouncer` (`useGridSelectionAnnouncement`) that speaks on every
   in-grid change. `ListBox` ships **none** (verified) — selection is
   conveyed via `aria-selected` and roving focus. So the modal's single
   existing polite region stays the sole *total* announcer; with GridList
   it would double-speak.
2. **Cleaner SR semantics** — a list of options announces as a list, not
   a one-column table.
3. **No anti-pattern.** A focusable checkbox inside `role="option"` is
   invalid ARIA. (RAC documents this as a convention — a source comment
   in `useListBox.mjs`, *not* a runtime guard — so don't expect a thrown
   error.) The per-row checkbox therefore becomes a **decorative,
   `aria-hidden` glyph** driven by the option's `isSelected` render prop;
   selection state lives on `aria-selected`, the glyph is presentation.

### Escape must close the dialog, not clear selection

RAC's selection layer defaults `escapeKeyBehavior="clearSelection"` —
Escape inside the list would clear a non-empty selection instead of
closing the modal. The contract is "Escape = Cancel = close, discarding
the draft", so the `ListBox` sets **`escapeKeyBehavior="none"`** to let
Escape propagate to the Dialog. (The prop is inherited via
`AriaListBoxProps`; it is not declared on RAC's own `ListBoxProps`
typedoc, so a reader checking that list won't find it — it's real.)
Gets its own test.

### Source of truth and the filter/search interaction

`draft: Set<CardId>` remains the single source of truth — unchanged. The
`ListBox` is a *controlled selection view over only the visible
(post-filter, post-search) cards*:

- `selectedKeys` = the whole `draft`, passed to the `ListBox` directly.
  `draft` may include cards hidden by the current filter/search; RAC
  renders only the visible collection and leaves the rest of the set
  untouched (verified against the 1.17.0 source: RAC does **not** prune a
  controlled `selectedKeys` against the collection, and `toggleSelection`
  / `extendSelection` copy the whole set before mutating, so hidden keys
  ride through).
- `onSelectionChange(keys)` handles three cases:
  - **`"all"`** (Cmd/Ctrl+A) → expand the sentinel via the pure helper
    `mergeVisibleSelection(draft, visibleIds, "all")` = `hidden ∪ visibleIds`.
  - **Shift-click range** → recompute the range to the anchor's state and
    overwrite RAC's result (see "Selection semantics").
  - **any other change** (plain/Cmd toggle, keyboard Shift+Arrow) → store
    RAC's `Selection` **as-is** (`setDraft(keys as Set<CardId>)`).

  ```ts
  // printSelectionMerge.ts — colocated with printSelectionLabel.ts. Used by the
  // header toggle and the "all" sentinel (the bulk paths); the Shift-click path
  // recomputes inline. Pure + unit-tested, independent of RAC/jsdom.
  mergeVisibleSelection(
    draft: Set<CardId>,
    visibleIds: CardId[],
    keys: "all" | ReadonlySet<Key>,   // Key from react-aria-components
  ): Set<CardId>
  ```

  - `hidden` = `draft` minus `visibleIds`; for `"all"`, `next = hidden ∪ visibleIds`.
  - otherwise it intersects: `next = hidden ∪ visibleIds.filter(id => keys.has(id))`
    — narrowing `Key` to `CardId` and guaranteeing `next ⊆ (hidden ∪ visibleIds)`.

  **Store the `Selection` object, never a rebuilt plain `Set`:** RAC keeps the
  range anchor on the `Selection` it returns, and `convertSelection` preserves
  it only when the controlled value is itself a `Selection`. A fresh `Set` nulls
  the anchor and collapses keyboard Shift+Arrow to a single item (a real bug,
  caught by the range tests). The bulk/`"all"` paths (where an anchor reset is
  fine) may produce a plain `Set` via the helper; the Shift-click override clears
  and rebuilds the *same* `Selection` object rather than replacing it. At Apply,
  `draft` is normalized to a plain `Set` for downstream consumers.

This preserves today's contract exactly: filters/search change only
which rows are *shown*, never the selection; selected-but-hidden cards
stay selected and still print; the "N selected cards are hidden by
filters — still included when you Apply" footer line and Clear-filters
link behave as before. Range selection necessarily operates only over
visible rows. The merge is the same *shape* as today's `onHeaderToggle`
(`PrintSelectionModal.tsx:49`), generalized.

### Header "select all shown" and Cmd/Ctrl+A

The header tri-state checkbox ("Select all shown cards" + "X of Y shown"
status) stays, *outside* the `ListBox` (it remains a real `lib/ui/
Checkbox`). It drives the same `mergeVisibleSelection` path:
clear-all-visible / select-all-visible per the existing two-outcome rule,
with the `mixed` indeterminate state.

Keyboard users also get Cmd/Ctrl+A inside the list. These two paths are
**not equivalent** and the spec does not claim they are: from a
*partially* selected state, the header follows "any visible checked →
clear", while Cmd/Ctrl+A just selects all shown. (RAC's select-all
shortcut is **not** a toggle — it calls `selectAll()`, which is a no-op
once everything shown is selected; a second press does nothing.) Different
outcomes from the same mixed start. Both route through
`mergeVisibleSelection` and neither can drop a hidden-selected card, so
the divergence is accepted and documented rather than reconciled
(reconciling would change shipped #84 behavior + tests). A test asserts
the header reads checked, not mixed, after Cmd/Ctrl+A.

The sidebar count, Select-all link, Apply/Cancel, Print-button disable,
and empty-selection messaging are untouched. The keyboard route to an
empty selection is the header checkbox (Space) — Cmd/Ctrl+A only ever
selects, and Shift is additive, so neither clears; the existing
disabled-Print + "Select at least 1 card" state handles empty, unchanged.

### Anchor across view changes

We track our own anchor (the last plain-clicked card's id). The modal
mutates the visible collection constantly (search, filter, sort), so the
anchor can scroll away or be filtered out: if its id isn't in the current
`visibleIds`, the Shift-click override is skipped and RAC's additive extend
stands (non-destructive). If sort flips, the anchor's visual position
changes so a Shift-click spans a different run — accepted. The override only
ever sets *visible* rows, so the worst case is recoverable and never drops a
hidden-selected card. A test pins that range selection still works after a
sort change.

### Touch and pointers without modifiers

Range-select needs a modifier key, which touch lacks. On touch, tapping a
card *toggles* it (additive, non-destructive — `toggle` behavior makes a
plain press a toggle, never a replace; verified). So touch users keep
exactly today's per-card behavior — this feature adds nothing new for
them, and that's fine; their flow is unchanged from #84. (No false "fast
path" claim: tapping select-all then tapping off a few only helps when
keeping a majority.) A test confirms a plain tap toggles rather than
replaces.

## Walkthrough — "drop everything older than last week"

The list opens all-selected (default = whole deck), recency-sorted
(newest first). Goal: drop the older tail, keep the newest run.

1. Click the first (newest) card of the tail → toggles it off; it becomes
   the deselected anchor (**1**).
2. Shift-click the last (oldest) card → the range follows the anchor's
   deselected state and **clears the whole tail** (**1**).

**2 gestures, constant** regardless of tail length — versus today's *N*
unchecks (8 for a 20→12 narrowing, 20 for a 50→30 one). Filling a run works
symmetrically (select a card, Shift-click another → the range fills). The
header "select all shown" + recency sort/filters remain the keyboard-only
path; Shift+↑/↓ extends additively.

## Accessibility

- The list is `role="listbox"` with `aria-multiselectable`, each card a
  `role="option"` with `aria-selected`; the listbox gets
  `aria-label="Cards to print"`. RAC manages roving focus and the anchor.
- **Per-item feedback comes from roving focus, the total from the polite
  region.** As Shift+↓ moves focus, the SR announces each option it lands
  on with its state ("Bravo, selected") — that's the per-item feedback,
  inherent to the listbox pattern, not something the live region must
  supply. The modal's existing single polite region
  (`PrintSelectionModal.tsx:182`) supplements with the running *total*
  ("12 cards selected"); it is the *only* live region (ListBox adds
  none), so no double-speak. The total may not re-announce on a Shift
  step that nets zero change — acceptable, because focus already conveyed
  the per-item change. Choosing the running-total (not per-item naming)
  in the live region is deliberate, so it doesn't fight the focus
  announcement.
- **`textValue={card.name}`** for type-ahead; the kind span, the `<time>`
  element, **and** its sr-only "Updated " text are all `aria-hidden`, so
  the option's accessible name is exactly the card name and
  `getByRole("option", { name })` resolves cleanly. The decorative
  checkbox glyph is `aria-hidden`, not focusable or queryable.
- **`escapeKeyBehavior="none"`** so Escape closes the dialog (Cancel).
- **One-line hint.** A single static, muted helper line sits on the
  footer's action row, left of Cancel/Apply (so the footer stays one line):
  *"Shift-click or Shift+↑/↓ to select a range."* It is plain visible text
  (not a callout/coachmark), rendered only when the list is non-empty, and
  associated with the listbox via `aria-describedby` so SR users hear it on
  entering the list — doubling as the Tab-model-change mitigation, not just
  mouse discoverability.
- **Tab model change (called out).** Today every row checkbox is its own
  Tab stop; the ListBox is a single Tab stop with arrow roving. Order:
  search → kind toggles → sort → header checkbox → (one Tab into the
  listbox; arrows within) → footer "Clear filters" → Cancel/Apply. The
  header checkbox precedes the list and stays reachable. A net win for
  most, but a behavior change for Tab-only users — the one-line hint
  above (announced via `aria-describedby` on entry) is the mitigation.
- **Empty state** uses ListBox's `renderEmptyState` to keep "No cards
  match." Note RAC wraps that content in a `role="option"` element, so
  the empty modal contains *one* option — tests assert by text and must
  not assert "zero options".
- **Focus-visible** on the focused option binds `[data-focus-visible]`
  (from `useOption`'s `isFocusVisible`) to the existing
  `--color-focus-ring`; verify on the option element, not the now-
  decorative glyph.
- Preserved: header checkbox `aria-checked="mixed"` + stable name
  ("Select all shown cards") + "X of Y shown" via `aria-describedby`;
  focus-on-open to the search input; focus-return-on-close to "Choose
  cards…". No animations exist, so no reduced-motion work.

## Components

- **`PrintSelectionModal.tsx`** — list rendering changes from `<ul>` +
  per-row `Checkbox` to a RAC `ListBox` + `ListBoxItem`s (each with a
  decorative selection glyph and a `data-card-id`). `selectedKeys={draft}`
  (controlled by the whole draft); a `SelectionListBox` typed-cast wrapper
  passes `allowDuplicateSelectionEvents`; `onPointerDownCapture` tracks the
  anchor + Shift-click flag; `onSelectionChange` applies the anchor-mirror
  override or the merge helper. `draft`, search/kind/sort, header checkbox,
  footer (now carrying the hint), Apply/Cancel are functionally preserved.
- **`printSelectionMerge.ts`** (new) + **`printSelectionMerge.test.ts`**
  — the pure `mergeVisibleSelection`, colocated with `printSelectionLabel.ts`.
- **`PrintSelectionModal.module.css`** — the row layout (name / kind /
  time grid) moves onto listbox options; selected + focus styling carry
  over. Note the existing glyph rule `.checkbox[data-selected] .box`
  (`Checkbox.module.css`) must become an option-scoped rule (`data-
  selected` lands on the option); the `[data-indeterminate]` rule is not
  carried onto rows (only the header is ever indeterminate). Visual parity
  with today's rows is a requirement.
- **No changes** to `PrintView.tsx`, `deckListing.ts`,
  `usePrintSelection.ts`, the sidebar, or print-output code.

## Tests

Three layers; drivability of layer (c) is spike-confirmed (see
Validation), so none of it is "contingent".

**(a) Pure unit — `printSelectionMerge.test.ts`** (no RAC, deterministic;
owns correctness):
- hidden ∪ visible: a selected-but-hidden card survives a visible change.
- `"all"` sentinel → all visible ids (and only those).
- a key present in `keys` but not in `visibleIds` is dropped (the
  intersection invariant).
- empty visible set does not drop hidden-selected cards.
- idempotency: re-applying the current visible selection is content-equal.

**(b) Component structure / smoke:**
- The card list is `role="listbox"` (`aria-label` "Cards to print") with
  `aria-multiselectable`; options expose `aria-selected`.
- `renderEmptyState` shows "No cards match." (assert by text; do not
  assert zero options) and hides the "Updated" header.
- Escape closes the modal (Cancel).
- Bare ArrowDown/Up moves focus without changing selection.
- After Cmd/Ctrl+A the header checkbox reads checked (not mixed).

**(c) Interaction (jsdom-confirmed):**
- Shift-click from a **selected** anchor fills the range, including
  unselected cards in between.
- Shift-click from a **deselected** anchor clears the range.
- Cmd/Ctrl-click toggles a single card without changing others.
- Shift+↓ extends the selection by keyboard (additive).
- Range spans only visible rows: a card hidden by a filter between anchor
  and target is unaffected; the Apply total + hidden-by-filters line
  reconcile.
- Range selection still works after a sort change.
- Plain tap/click toggles a single card (never replaces).

**Migration is partly non-mechanical** — do not blanket-swap
`checkbox`→`option`:
- **Header** checkbox queries STAY `role="checkbox"` +
  `toBeChecked()`/`toBePartiallyChecked()` (it's a real `Checkbox`
  outside the listbox). Only **per-row** queries migrate to
  `role="option"` + `aria-selected` (there is no `option` analog of
  `toBeChecked()`).
- The header-select-all family (`PrintSelectionModal.test.tsx:93,102,111,121`)
  *mixes* a row toggle with header assertions — split by hand.
- "Kind filter…unchecking" (`:156-166`) uses `toBeChecked()` on a row →
  rewrite to `aria-selected`.
- **Two listboxes:** the Sort `Select` is itself a RAC ListBox
  (`role="option"` items). With its popover open there are two option
  sets; the sort-by-name test (`:219-236`) already queries the dropdown's
  option and will collide. Scope card-row queries with
  `within(screen.getByRole("listbox", { name: /cards to print/i }))`, and
  query the sort dropdown via its own listbox.

## Validation

A throwaway spike was run (and removed) in this worktree before
finalizing: a 4-option `ListBox selectionMode="multiple"
selectionBehavior="toggle"` exercised with `@testing-library/user-event`
under the project's vitest/jsdom config. All three gestures updated
`aria-selected` correctly — Shift-click additive range, Cmd/Ctrl-click
single toggle, and `{Shift>}{ArrowDown}{/Shift}` keyboard extend (driven
with modifier-held `user.keyboard` around `user.click`). This is the
basis for the "no extra test dependency / no e2e harness" claim above.

## Risks

- **Controlled selection over a filtered collection.** The
  `selectedKeys` ↔ `draft` merge is the subtle bit; get it wrong and
  hidden-selected cards drop or Cmd/Ctrl+A over-selects. Covered by the
  layer-(a) tests (incl. the intersection invariant) and the hidden-range
  layer-(c) test.
- **Escape regression.** Easy to miss `escapeKeyBehavior`; covered by a
  test.
- **Tab-model change / discoverability.** Resolved: the one-line hint is
  in scope (Components / Accessibility), associated with the listbox via
  `aria-describedby`, mitigating both the Tab-model regression and
  Shift-range discoverability.
- **Touch gets no range gesture** — accepted and documented.
- **(Resolved) jsdom drivability + Shift semantics** — previously the top
  risk; settled by source-reading + the spike above. No longer open.

## Forward compatibility

If a second multi-select list with range selection appears (e.g. bulk PDF
export of decks), the `ListBox` + filter + header-select-all arrangement
plus `mergeVisibleSelection` could extract into a `src/lib/ui/` primitive.
If such a list ever needs genuinely interactive per-row controls, that's
the point to revisit `GridList` for it specifically. One consumer isn't a
pattern; revisit when there's a second.
