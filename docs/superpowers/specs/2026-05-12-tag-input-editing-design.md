# TagInput — inline editing & mid-list insertion

## Problem

`TagInput` in `src/lib/ui/TagInput.tsx` is a chip-input field used for header and footer tags on cards. Two pain points:

1. **No editing.** To change a tag, the user must delete it and retype it whole. Worse: because the only delete shortcut from the keyboard is `Backspace` on an empty trailing input, editing the first of four chips means deleting the last three first.
2. **No mid-list insertion.** New chips can only be appended at the end. There's no way to place the cursor between two existing chips.

## Goals

- Allow editing an existing chip in place.
- Allow inserting a new chip at an arbitrary position in the list.
- Preserve current accessibility (keyboard reachable, screen-reader friendly).
- Keep `TagInput`'s public API unchanged — consumers (`CardEditor`) don't change.
- Keep the component inside the design system (`src/lib/ui/`); continue using design-system tokens.

## Non-goals

- Drag-and-drop reordering of chips.
- Multi-select / bulk operations on chips.
- Suggestions, autocomplete, or chip validation.

## Interaction matrix

| | Mouse | Touch | Keyboard |
|---|---|---|---|
| Focus a chip | (hover only) | (tap on label enters edit; no "focus-only" state) | Tab into list, ←/→ between slots |
| Edit a chip | Click on chip label | Tap on chip label | Active chip + `Enter` (or `F2`) |
| Remove a chip | Click × | Tap × | Active chip + `Delete` or `Backspace` |
| Insert between chips | Click in gap | Tap in gap (12px target) | Active gap slot + `Enter` or any printable key |
| Append at end | Click trailing area | Tap trailing area | Active trailing input (default landing slot) |
| Commit edit / insert | Click elsewhere (blur) | Tap elsewhere | `Enter` or `Tab` |
| Cancel edit / insert | (none — blur commits) | (none — blur commits) | `Escape` |

Why mouse/touch have no "focused but not editing" state: there's no useful action available in that state, and adding a two-step click-then-act feels heavier than necessary. Keyboard users need the intermediate state because navigation precedes activation.

## Slot model

The wrapper renders a flat sequence of *slots*. For `value = [A, B, C]` there are `value.length + 1 = 4` insertion positions; the last one is the trailing input itself:

```
[gap 0] [chip A] [gap 1] [chip B] [gap 2] [chip C] [trailing-input = gap 3]
```

- **Gap slot (interior)** — 1–2px visual, 8px hit target on fine pointers, 12px on coarse pointers (`@media (pointer: coarse)`). Cursor: `text`. On hover/focus, a thin caret line renders to confirm the target. Clicking opens insert mode at index `i`. Focusable for keyboard nav.
- **Chip slot** — a focusable container (`role="listitem"`, `tabindex` managed by roving rules) that renders either *chip-view* (default) or *chip-edit* (in edit mode for this index).
  - Chip-view: a span with the label and the × remove button (today's design).
  - Chip-edit: an `<input>` pre-filled with the chip text, selection-all on focus, plus the same × that removes the chip outright (× wins over commit).
- **Trailing input** — the last insertion slot, distinguished only by being a real `<input>` element instead of a 1–2px caret target. Always mounted; while edit-mode or mid-list insert is active, it stays in the DOM (kept `visibility: hidden`, `tabindex=-1`, `aria-hidden`) so the wrapper doesn't reflow. When idle it's the default landing slot and the only slot showing the `placeholder`.

## Internal state

```ts
type Mode =
  | { kind: "idle" }
  | { kind: "editing"; index: number; draft: string; original: string }
  | { kind: "inserting"; at: number; draft: string };

// Plus:
type ActiveSlot = number; // 0…(value.length * 2) — the slot index that owns tabindex=0
```

`mode` is a discriminated union — illegal states (both `editing` and `inserting` set) are unrepresentable. `original` is captured at edit-open so `Escape` can revert without re-reading from `value`. `activeSlot` is decoupled from `mode` so a transient blur doesn't lose the roving-tabindex position.

Slot indexing: even indices `0, 2, 4, …` are gap slots; odd indices `1, 3, 5, …` are chip slots. The trailing input is the final even index, `value.length * 2`. Edge case: when `value=[]`, the only slot is the trailing input at index 0 — there are no interior gaps and no chip slots.

## Edit-mode semantics

- `Enter` commits. The whole input string becomes the chip value (no splitting on Enter — the 2A question; "save whole").
- Pre-commit normalization: any `\n` / `\r` in the draft (e.g., from paste) is replaced with a space, then the string is `trim()`-ed. Matches today's append path.
- Empty / whitespace commit → the chip at `editing.index` is removed.
- Non-empty commit → `value[editing.index]` is updated.
- Duplicates are allowed — committing a value that already exists elsewhere is fine; consumers dedupe if they care.
- `Escape` reverts to `original` and exits edit mode. **Escape's keydown event has `stopPropagation()` called unconditionally inside any edit / insert input** (including the trailing input, even with an empty draft) so it never bubbles to the parent `CardEditor` dialog. After cancel, focus moves to the chip slot.
- Blur to *outside the wrapper* (focusing another form field, etc.) → commits using the same rules as `Enter`, **but does NOT restore focus to the chip slot** — the user has intentionally moved on; we don't yank them back.
- Click/tap on another slot *inside the wrapper* while editing → handled via `onPointerDown` on the new slot wrapper (covers mouse + touch + pen), which commits the current edit before opening the new editor. This sidesteps the `blur → click` race. **Important scope note:** the `onPointerDown` commit-before-open lives only on *other* slot wrappers (chip slots, gap slots, trailing input). The active `<input>` itself does **not** intercept its own pointer events, so text selection, double-click word selection, and caret placement keep working inside the edit input.
- Transition order on cross-slot pointerdown while editing: resolve the click target by chip identity *before* applying commit. When commit is destructive (empty-commit-remove) and the new target's index sits to the *left* of the just-removed chip, the new target's index is unchanged; if it sits to the *right*, the index shifts down by one. The reducer applies commit then opens the new editor using the post-commit identity.
- × on a chip in edit mode → removes the chip; the in-progress edit text is discarded. Same `onPointerDown` mechanism short-circuits the blur-commit so the removal wins.
- Focus return after commit via Enter or inside-wrapper pointerdown: the chip slot at `editing.index`. After empty-commit-remove: the gap slot at that same index, or trailing input if the list is now empty. After commit via outside-wrapper blur: focus stays on whatever the user moved to (no restore).

## Insert-mode semantics

Same as edit-mode (including newline collapse and trim) except:

- Empty / whitespace commit → no-op (no chip created). Differs from edit-mode because there's no existing chip to delete.
- After a successful commit, active slot moves to the gap *after* the newly inserted chip (i.e., slot index `at*2 + 2` in the new layout) so consecutive insertion keeps working.
- `Escape` discards the draft and clears `mode`. Same unconditional `stopPropagation()` rule as edit-mode Escape (must not bubble to parent dialog even when draft is empty).
- Focus return after commit / discard via Enter or inside-wrapper pointerdown: the gap slot that hosted the insert (or the gap after the new chip, per the rule above for successful commit). After commit via outside-wrapper blur: focus stays where the user moved.
- Cross-slot pointerdown during insert follows the same identity-before-commit rule as edit mode: if the click target is a chip to the *left* of the insert index, its index is unchanged; to the *right*, a successful (non-empty) insert shifts it up by one.
- Trailing-input insert mode is the only insert position whose "host" gap *is* the input itself; Escape clears the draft and focus stays on the trailing input.

## Keyboard navigation

- Tab into the component lands on the active slot. Default active slot on mount is the trailing input (matches today).
- ←/→ arrows move active among slots in order: gap → chip → gap → … → trailing-input. **No wrap.** Edges stop.
- On a focused chip slot, `Enter` (or `F2`) opens edit; `Delete` removes (primary); `Backspace` also removes (secondary shortcut, retained because users currently use Backspace).
- On a focused gap slot:
  - `Enter` opens insert with an empty draft.
  - Any *printable* key opens insert with that key as the initial draft, **only when** `event.key.length === 1`, no `Ctrl`/`Meta`/`Alt` modifier is held (Shift is allowed for capitals/punctuation), and `event.isComposing === false` (skip IME composition events).
- `Backspace` on the *empty trailing input* still removes the last chip (preserved from today). Active slot was the trailing input and stays the trailing input — no focus move.
- `Backspace` inside a non-empty edit/insert input edits text normally — never deletes the chip.
- Focus return after `Delete`/`Backspace` removes a chip via the chip slot's key handler: the gap slot at the deleted index, or trailing input if the list is now empty. (The trailing-input case in the bullet above doesn't go through this path because no chip is removed via the chip slot.)

## Accessibility

- Wrapper: `role="group"`, `aria-label` / `aria-labelledby` from props (today's behavior).
- Inside the wrapper, a `<ul role="list">` (CSS-reset to flex row) holds the chip + gap slots. Each chip slot is a `<li role="listitem">` so screen readers announce a list with the correct item count. Gap slots are also `<li>` but with `role="presentation"` (ARIA 1.2 listitem-or-presentation pattern). Modern AT honors this and counts only the listitem children; if a target browser/AT pair turns out to count the presentational `<li>`s, the fallback is to drop `role="list"` entirely and rely on per-slot `aria-label` for context.
- Chip slot (the `<li>`): focusable container (`tabindex` managed by roving), `aria-label="Tag: <text>"`, `aria-keyshortcuts="Enter Delete"` so SRs announce the interaction model. Owns Enter/Delete/Backspace handling. The × button inside is `tabindex=-1` (reachable via mouse/touch or via the chip's Delete shortcut, not via Tab).
- Chip-edit: replaces chip-view in the same `<li>`. Real DOM focus on the `<input aria-label="Edit tag '<original>'">` — not `aria-activedescendant`, because the input needs real keystroke focus. While editing, the chip `<li>` itself goes `tabindex=-1` so Shift-Tab from the input exits the widget cleanly without an intermediate stop on the listitem.
- Gap slot: focusable `<button>` styled as a 1–2px caret target. `aria-label`s:
  - `"Insert tag at start"` (index 0, before any chip)
  - `"Insert tag before <next>"` (middle, before chip `n`)
  - The trailing input keeps the consumer's `aria-label` / `aria-labelledby` (today's behavior) — it is *both* the trailing input *and* the "insert at end" gap. It additionally carries `aria-describedby` pointing to a visually-hidden hint: *"Use ← to insert between existing tags."* This is the only entry-discovery cue for keyboard/SR users; consumes one line of sr-only CSS.
- Gap slot caret rendering only appears on `:hover` or `[data-focused]` to keep idle UI quiet. Caret color uses a token meeting 3:1 non-text contrast (`--color-focus-ring` against the wrapper background).
- Roving tabindex: exactly one slot has `tabindex=0` at a time; all others `tabindex=-1`. Active slot is tracked in state. Focus is moved via `useLayoutEffect` keyed on `activeSlot` (and on `mode` for edit/insert transitions) — synchronous-before-paint, no `flushSync` needed.
- Escape inside an edit/insert input calls `stopPropagation()` *unconditionally* — even when the draft is empty — to prevent dismissing the parent dialog.

## Component contract (public API)

Unchanged:

```ts
type TagInputProps = {
  id?: string;
  className?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};
```

## Implementation approach

Drop `react-aria-components`' `TagGroup`/`TagList`/`Tag`. Build a focus-managed list inside `TagInput.tsx`:

- `<div role="group">` wrapper carries the consumer's aria-label and the `onKeyDown` for arrow nav.
- Inside: a `<ul role="list">` of slot `<li>`s — chips and gaps interleaved — plus the trailing `<input>` (the final "gap" rendered as an actual input).
- `mode` discriminated union and `activeSlot` index live in a single `useReducer` (not two `useState`s) so that coupled transitions — e.g., commit-and-move-active-to-the-gap-after — apply in one update. Transitions (`openEdit`, `openInsert`, `commit`, `cancel`, `remove`) are reducer actions.
- All slot *wrapper* pointer interactions use `onPointerDown` (mouse + touch + pen) for the commit-before-open mechanism; `onClick` handlers only run after commit has settled. The active edit/insert `<input>` does NOT install its own `onPointerDown` handler — text selection, double-click word-select, and caret placement keep their default behavior.
- Width-growing edit / insert input: CSS `field-sizing: content` with a fixed `width: 8ch` (and `min-width: 8ch`) fallback. Modern browsers get content-fit growth; older browsers see a fixed-width input — acceptable graceful degradation, no polyfill.

Why drop `TagGroup`: it's designed for read-only-or-removable chip rows. Editable chips interleaved with insertion slots don't fit its collection model, and its built-in keyboard handlers fight ours. The custom focus-management code is non-trivial — slot dispatch, the reducer, and the keyboard handler — but well-bounded.

## Styling

Keep using `TagInput.module.css`. New additions:

- `.gap` — flex item with width 8px (12px on coarse pointers via `@media (pointer: coarse)`), cursor `text`. Caret renders via `::before` on `:hover` or `[data-focused]`. Button reset (no border, no background).
- `.chipEdit` — input styled to match `.tag` chrome so the chip doesn't visually jump when entering edit mode. `field-sizing: content; min-width: 8ch;`. Long values: the wrapper is already `flex-wrap: wrap`, so an overgrowing edit input wraps to a new row rather than overflowing horizontally.
- `.trailingHidden` — applied to the trailing input while edit/insert mode is active: `visibility: hidden; pointer-events: none;`. Preserves its space so the wrapper doesn't reflow.
- All new colors/sizes use existing `--color-*` / `--space-*` / `--radius-*` tokens.

## Testing plan

Tests live in `src/lib/ui/TagInput.test.tsx`. All 10 existing tests stay (they describe the still-valid public contract: append, blur-commit, comma-not-committing, trim, etc.). New tests:

**Edit mode**
1. Click chip enters edit mode with text pre-filled and selected. Assert the edit input is queryable by its `aria-label` ("Edit tag '<original>'").
2. Edit + `Enter` commits the new value at the same index.
3. Edit + `Escape` reverts AND does not bubble. Test pattern: wrap `<Harness>` in a `<div onKeyDown={spy}>`. Assert `spy` is called for a non-Escape key (sanity) and NOT called when Escape is pressed inside the edit input.
4. Empty edit commit removes the chip at that index; focus lands on the gap slot at that index.
5. Whitespace-only edit commit also removes (e.g., `"   "` → remove).
6. Edit + blur to outside the wrapper commits, AND does NOT restore focus to the chip slot (focus stays on the outside element).
7. × on a chip currently being edited removes the chip without committing the in-progress edit text; focus lands on the gap slot at that index.
8. Clicking another chip while editing commits the current edit then opens edit on the new chip (chip→chip transition).
9. Clicking a gap while editing commits the current edit then opens insert at that gap (gap→edit-in-progress transition).
10. Pasting `"a\nb"` into an edit and committing yields a single chip `"a b"` (newline collapsed + trimmed).
11. Non-empty edit commit is trimmed.

**Insert mode**
12. Click gap opens an input at that index; type + `Enter` inserts at that index.
13. Empty insert commit is a no-op.
14. Whitespace-only insert commit is a no-op.
15. After a successful insert at gap N, the next commit (Enter, type, Enter) inserts at index N+1. Asserted *behaviorally* via the resulting `value` order rather than by reading internal state.
16. `Escape` during insert discards the draft (covers both mid-list and trailing-input insert with empty/non-empty drafts; verifies stopPropagation in both).

**Keyboard navigation**
17. Tab into list lands on the trailing input by default.
18. Arrow Right from trailing input goes nowhere (no wrap). Arrow Left from leading gap goes nowhere.
19. Arrow Left/Right traverses gap → chip → gap → trailing.
20. `Enter` on focused chip enters edit mode.
21. `Enter` on focused gap opens insert with empty draft.
22. Printable key on focused gap opens insert with that character as the draft.
23. Shift+letter on focused gap opens insert with capital letter (RTL pattern: `userEvent.keyboard("A")` produces `"A"`; Shift modifier doesn't need explicit press).
24. `Delete` on focused chip removes it; `Backspace` on focused chip also removes (both shortcuts).
25. After `Delete` removes a chip, focus lands on the gap at the deleted index.
26. `Backspace` on empty trailing input still removes last chip (preserve current behavior); focus stays on the trailing input.
27. `Backspace` inside a non-empty edit input edits text, does NOT remove the chip.

**Accessibility**
28. Wrapper exposes `role="group"` with the consumer's aria-label.
29. List inside has `role="list"`; chip count matches `value.length` via `getAllByRole("listitem")` (gaps as `role="presentation"` are excluded).
30. Gap slots have aria-labels: `"Insert tag at start"`, `"Insert tag before <next>"`. Targeted by these labels throughout the insert tests.
31. Roving tabindex: at idle, exactly one slot has `tabindex=0`; after arrow nav, the new slot is `tabindex=0` and the previous is `tabindex=-1`. Uses `document.querySelectorAll('[tabindex="0"]')` — a documented deviation from getByRole, justified because the assertion is about the roving invariant itself.

Use `getByRole` selectors throughout. Factories not needed (chip text is just `string`).

## Out-of-scope follow-ups

- Drag-and-drop reorder. If desired later, the slot model already gives us slot indices; reorder is a state mutation, not a structural change.
- Touch long-press to reveal a remove confirmation for nervous mobile users. Today's × tap target is sufficient.
