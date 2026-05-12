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

The wrapper renders a flat sequence of *slots*. For `value = [A, B, C]`:

```
[gap 0] [chip A] [gap 1] [chip B] [gap 2] [chip C] [trailing-input]
```

- **Gap slot** — 1–2px visual, 8px hit target on fine pointers, 12px on coarse pointers (`@media (pointer: coarse)`). Cursor: `text`. On hover/focus, a thin caret line renders to confirm the target. Clicking sets `inserting = { at: i, draft: "" }`. Focusable for keyboard nav.
- **Chip slot** — renders either *chip-view* (default) or *chip-edit* (when `editing.index === i`).
  - Chip-view: a span with the label and the × remove button (today's design).
  - Chip-edit: an `<input>` pre-filled with the chip text, selection-all on focus, plus the same × that removes the chip outright (× wins over commit).
- **Trailing input** — visible only when no chip is being edited and no mid-list insert is active. Functions as an always-empty entry point for appending. Clicking it (or typing into it) appends to the end via the same commit rules as insertion. When the user is editing a chip or mid-list-inserting, the trailing input is hidden so the "one input at a time" rule holds; the edit/insert input replaces it visually.

## Internal state

```ts
type Editing = { index: number; draft: string } | null;
type Inserting = { at: number; draft: string } | null;
```

`editing` and `inserting` are mutually exclusive. Opening one commits or cancels the other first. We never render two inputs at the same time.

## Edit-mode semantics

- `Enter` commits the whole input string as the new chip value at `editing.index`. No splitting on Enter — this is the question the user flagged in 2A; the answer is "save whole".
- Empty / whitespace commit → the chip at `editing.index` is removed.
- Non-empty commit → `value[editing.index]` is updated.
- `Escape` reverts and exits edit mode; focus returns to the chip-view.
- Blur (click/tap elsewhere, `Tab`) → commits using the same rules as `Enter`.
- × on a chip in edit mode → removes the chip; the in-progress edit text is discarded. Implemented by handling `mousedown` on × to short-circuit the blur-commit.
- Clicking another chip or another gap while editing → commits the current edit, then opens the new editor.

## Insert-mode semantics

Same as edit-mode except:

- Empty / whitespace commit → no-op (no chip created). This differs from edit-mode because there's no existing chip to delete.
- After a successful commit, active slot moves to the gap *after* the newly inserted chip so the user can keep inserting at adjacent positions.
- `Escape` discards the draft.

## Keyboard navigation

- Tab into the component lands on the active slot. Default active slot on mount is the trailing input (matches today).
- ←/→ arrows move active among slots in order: gap → chip → gap → ... → trailing-input. **No wrap.** Edges stop.
- On a focused gap slot, `Enter` opens an insert with an empty draft. Any printable key (single character, no `Ctrl`/`Meta`/`Alt` modifier) also opens an insert with that character as the initial draft (this matches the "I-beam cursor" mental model — typing at a focused cursor position inserts).
- On a focused chip slot, `Enter` (or `F2`) opens edit; `Delete`/`Backspace` removes.
- `Backspace` on the *empty trailing input* still removes the last chip (preserved from today's behavior).
- `Backspace` inside a non-empty edit/insert input edits text normally — never deletes the chip.

## Accessibility

- Wrapper: `role="group"`, `aria-label` / `aria-labelledby` from props (today's behavior).
- Chip-view: a non-focusable visual span. The × button inside is focusable as `<button aria-label="Remove <text>">`.
- Chip-edit: `<input aria-label="Edit tag '<original>'">`.
- Gap slot: focusable `<button aria-label="Insert tag at start">` (index 0), `"Insert tag before <next>"` (middle), or `"Insert tag at end"` (which is the trailing input; can keep its existing aria-label). A thin caret line renders on hover/focus.
- Roving tabindex: exactly one slot in the list has `tabindex=0` at a time. All others are `tabindex=-1`. Active slot is tracked in state and follows arrow-key nav.

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

- One `<div role="group">` wrapper with `onKeyDown` for arrow nav.
- Children are a flat sequence of slot components: `<GapSlot>`, `<ChipView>` (or `<ChipEdit>` when editing that index), and the trailing `<input>` (same component as `<ChipEdit>` parameterized for insert mode).
- One `activeSlot` state value tracks which slot has `tabindex=0`. `editing` and `inserting` are separate state values as defined above.
- Width-growing input: CSS `field-sizing: content` with a `min-width: 8ch` fallback. Already widely supported in modern browsers; we ship without a polyfill.

Why drop `TagGroup`: it's designed for read-only-or-removable chip rows. Editable chips interleaved with insertion slots don't fit its collection model, and its built-in keyboard handlers fight ours. The custom focus-management code is well-known and small (~150–200 lines of well-bounded logic).

## Styling

Keep using `TagInput.module.css`. New additions:

- `.gap` — flex item with width 8px (12px on coarse pointers via `@media (pointer: coarse)`), cursor `text`. Caret renders via `::before` on `:hover` or `[data-focused]`.
- `.chipEdit` — input styled to match `.tag` chrome so the chip doesn't visually jump when entering edit mode.
- All new colors/sizes use existing `--color-*` / `--space-*` / `--radius-*` tokens.

## Testing plan

Tests live in `src/lib/ui/TagInput.test.tsx`. All 10 existing tests stay (they describe the still-valid public contract: append, blur-commit, comma-not-committing, trim, etc.). New tests:

1. Click chip enters edit mode with text pre-filled and selected.
2. Edit + `Enter` commits the new value at the same index.
3. Edit + `Escape` reverts.
4. Empty edit commit removes the chip at that index.
5. Edit + blur (clicking elsewhere) commits.
6. × on a chip currently being edited removes the chip without committing the in-progress edit text.
7. Click gap opens an input at that index; type + `Enter` inserts at that index.
8. Empty insert commit is a no-op.
9. Keyboard: Tab into list, arrow Right traverses gap → chip → gap, `Enter` on focused chip enters edit mode.
10. Keyboard: `Delete` on focused chip removes it.
11. Keyboard: printable key on focused gap opens insert with that character as the draft.
12. Keyboard: `Backspace` on empty trailing input still removes last chip (preserve current behavior).

Use `getByRole` selectors throughout. Factories not needed (chip text is just `string`).

## Out-of-scope follow-ups

- Drag-and-drop reorder. If desired later, the slot model already gives us slot indices; reorder is a state mutation, not a structural change.
- Touch long-press to reveal a remove confirmation for nervous mobile users. Today's × tap target is sufficient.
