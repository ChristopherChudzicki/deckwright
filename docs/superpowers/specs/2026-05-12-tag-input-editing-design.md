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

Slot indexing: even indices `0, 2, 4, …` are gap slots; odd indices `1, 3, 5, …` are chip slots. The trailing input is the final even index, `value.length * 2`.

## Edit-mode semantics

- `Enter` commits. The whole input string becomes the chip value (no splitting on Enter — the 2A question; "save whole").
- Pre-commit normalization: any `\n` / `\r` in the draft (e.g., from paste) is replaced with a space, then the string is `trim()`-ed. Matches today's append path.
- Empty / whitespace commit → the chip at `editing.index` is removed.
- Non-empty commit → `value[editing.index]` is updated.
- Duplicates are allowed — committing a value that already exists elsewhere is fine; consumers dedupe if they care.
- `Escape` reverts to `original` and exits edit mode. **Escape's keydown event has `stopPropagation()` called** so it does not bubble to the parent `CardEditor` dialog and dismiss the card. After cancel, focus moves to the chip slot.
- Blur to *outside the wrapper* (focusing another form field, etc.) → commits using the same rules as `Enter`.
- Click/tap on another slot *inside the wrapper* while editing → handled via `onPointerDown` (covers mouse + touch + pen) on the new slot, which calls commit before opening the new editor. This sidesteps the `blur → click` race.
- × on a chip in edit mode → removes the chip; the in-progress edit text is discarded. Same `onPointerDown` mechanism short-circuits the blur-commit so the removal wins.
- Focus return after commit: the chip slot at `editing.index` (the just-edited chip's container). After empty-commit-remove: the gap slot at that same index, or trailing input if the list is now empty.

## Insert-mode semantics

Same as edit-mode (including newline collapse and trim) except:

- Empty / whitespace commit → no-op (no chip created). Differs from edit-mode because there's no existing chip to delete.
- After a successful commit, active slot moves to the gap *after* the newly inserted chip (i.e., slot index `at*2 + 2` in the new layout) so consecutive insertion keeps working.
- `Escape` discards the draft and clears `mode`. Same `stopPropagation()` rule as edit-mode Escape.
- Focus return after commit / discard: the gap slot that hosted the insert (or the gap after, per the rule above for successful commit).
- Removing the trailing input is meaningless; in trailing-input insert mode, Escape just clears the draft and keeps focus there.

## Keyboard navigation

- Tab into the component lands on the active slot. Default active slot on mount is the trailing input (matches today).
- ←/→ arrows move active among slots in order: gap → chip → gap → … → trailing-input. **No wrap.** Edges stop.
- On a focused chip slot, `Enter` (or `F2`) opens edit; `Delete` removes (primary); `Backspace` also removes (secondary shortcut, retained because users currently use Backspace).
- On a focused gap slot:
  - `Enter` opens insert with an empty draft.
  - Any *printable* key opens insert with that key as the initial draft, **only when** `event.key.length === 1`, no `Ctrl`/`Meta`/`Alt` modifier is held (Shift is allowed for capitals/punctuation), and `event.isComposing === false` (skip IME composition events).
- `Backspace` on the *empty trailing input* still removes the last chip (preserved from today).
- `Backspace` inside a non-empty edit/insert input edits text normally — never deletes the chip.
- Focus return after `Delete`/`Backspace`-removes-chip: the gap slot at the deleted index, or trailing input if the list is now empty.

## Accessibility

- Wrapper: `role="group"`, `aria-label` / `aria-labelledby` from props (today's behavior).
- Inside the wrapper, a `<ul role="list">` (CSS-reset to flex row) holds the chip + gap slots. Each chip slot is a `<li role="listitem">` so screen readers announce a list with the correct item count. Gap slots are also `<li>` but with `role="presentation"` so they don't pollute the item count — they're nav-relevant, not content-relevant.
- Chip slot (the `<li>`): focusable container (`tabindex` managed by roving), `aria-label="Tag: <text>"`. Owns Enter/Delete/Backspace handling. The × button inside is focusable as `<button aria-label="Remove <text>">`.
- Chip-edit: replaces chip-view in the same `<li>`. Real DOM focus on the `<input aria-label="Edit tag '<original>'">` — not `aria-activedescendant`, because the input needs real keystroke focus.
- Gap slot: focusable `<button>` styled as a 1–2px caret target. `aria-label`s:
  - `"Insert tag at start"` (index 0, before any chip)
  - `"Insert tag before <next>"` (middle, before chip `n`)
  - The trailing input keeps the consumer's `aria-label` / `aria-labelledby` (today's behavior) — it is *both* the trailing input *and* the "insert at end" gap, so its single label needs to convey both. We rely on the consumer's "Header tags" / "Footer tags" label naming the whole field; the trailing input is the canonical entry point.
- Gap slot caret rendering only appears on `:hover` or `[data-focused]` to keep idle UI quiet.
- Roving tabindex: exactly one slot has `tabindex=0` at a time; all others `tabindex=-1`. Active slot is tracked in state. When the active slot is removed (chip deletion), focus moves per the rules above before the offending slot unmounts (use `flushSync` or move focus on the same render that prunes the slot).
- Escape inside an edit/insert input calls `stopPropagation()` to prevent dismissing the parent dialog.

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
- `mode` discriminated union and `activeSlot` index live in `useReducer` or a small `useState` pair; transitions (`openEdit`, `openInsert`, `commit`, `cancel`, `remove`) go through one reducer-style helper for predictability.
- All slot pointer interactions use `onPointerDown` (mouse + touch + pen) for the commit-before-open mechanism; `onClick` handlers only run after commit has settled.
- Width-growing edit / insert input: CSS `field-sizing: content` with a fixed `width: 8ch` (and `min-width: 8ch`) fallback. Modern Chromium + Safari 18.4+ + Firefox 144+ get content-fit growth; older browsers see a fixed-ish input — acceptable graceful degradation, no polyfill.

Why drop `TagGroup`: it's designed for read-only-or-removable chip rows. Editable chips interleaved with insertion slots don't fit its collection model, and its built-in keyboard handlers fight ours. The custom focus-management code is well-known but non-trivial — estimate 250–350 lines including the slot dispatch, the reducer, and the keyboard handler.

## Styling

Keep using `TagInput.module.css`. New additions:

- `.gap` — flex item with width 8px (12px on coarse pointers via `@media (pointer: coarse)`), cursor `text`. Caret renders via `::before` on `:hover` or `[data-focused]`. Button reset (no border, no background).
- `.chipEdit` — input styled to match `.tag` chrome so the chip doesn't visually jump when entering edit mode. `field-sizing: content; min-width: 8ch;`. Long values: the wrapper is already `flex-wrap: wrap`, so an overgrowing edit input wraps to a new row rather than overflowing horizontally.
- `.trailingHidden` — applied to the trailing input while edit/insert mode is active: `visibility: hidden; pointer-events: none;`. Preserves its space so the wrapper doesn't reflow.
- All new colors/sizes use existing `--color-*` / `--space-*` / `--radius-*` tokens.

## Testing plan

Tests live in `src/lib/ui/TagInput.test.tsx`. All 10 existing tests stay (they describe the still-valid public contract: append, blur-commit, comma-not-committing, trim, etc.). New tests:

**Edit mode**
1. Click chip enters edit mode with text pre-filled and selected.
2. Edit + `Enter` commits the new value at the same index.
3. Edit + `Escape` reverts and does not bubble (assert outer key handler is *not* called).
4. Empty edit commit removes the chip at that index.
5. Whitespace-only edit commit also removes (e.g., `"   "` → remove).
6. Edit + blur to outside the wrapper commits.
7. × on a chip currently being edited removes the chip without committing the in-progress edit text.
8. Clicking another chip while editing commits the current edit then opens edit on the new chip.
9. Pasting `"a\nb"` into an edit and committing yields a single chip `"a b"` (newline collapsed + trimmed).
10. Non-empty edit commit is trimmed.

**Insert mode**
11. Click gap opens an input at that index; type + `Enter` inserts at that index.
12. Empty insert commit is a no-op.
13. Whitespace-only insert commit is a no-op.
14. After a successful insert, active slot is the gap *after* the new chip (assert next `Enter` opens insert at index+1).
15. `Escape` during insert discards the draft.

**Keyboard navigation**
16. Tab into list lands on the trailing input by default.
17. Arrow Right from trailing input goes nowhere (no wrap). Arrow Left from leading gap goes nowhere.
18. Arrow Left/Right traverses gap → chip → gap → trailing.
19. `Enter` on focused chip enters edit mode.
20. `Enter` on focused gap opens insert with empty draft.
21. Printable key on focused gap opens insert with that character as the draft.
22. Shift+letter on focused gap opens insert with capital letter (assert Shift permitted).
23. `Delete` on focused chip removes it; `Backspace` on focused chip also removes (both shortcuts).
24. After `Delete`, focus lands on the gap at the deleted index.
25. `Backspace` on empty trailing input still removes last chip (preserve current behavior).
26. `Backspace` inside a non-empty edit input edits text, does NOT remove the chip.

**Accessibility**
27. Wrapper exposes `role="group"` with the consumer's aria-label.
28. List inside has `role="list"`; chip count matches `value.length` via `getAllByRole("listitem")`.
29. Gap slots have aria-labels: `"Insert tag at start"`, `"Insert tag before <next>"`. Targeted by these labels throughout the insert tests.
30. Roving tabindex: at idle, exactly one slot has `tabindex=0`; after arrow nav, the new slot is `tabindex=0` and the previous is `tabindex=-1`.

Use `getByRole` selectors throughout. Factories not needed (chip text is just `string`).

## Out-of-scope follow-ups

- Drag-and-drop reorder. If desired later, the slot model already gives us slot indices; reorder is a state mutation, not a structural change.
- Touch long-press to reveal a remove confirmation for nervous mobile users. Today's × tap target is sufficient.
