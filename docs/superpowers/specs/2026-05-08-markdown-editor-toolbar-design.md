# Markdown editor toolbar

## Problem

Card bodies render as Markdown (`renderBody.ts` → `marked` → DOMPurify), but the editor body field is a plain `<textarea>` with no formatting affordances. Authoring `**bold**`, `_italic_`, and `- bullet` lists by hand is fine for power users but a friction tax for everyone else, and the lack of `Cmd+B` / `Cmd+I` is a small but constant surprise.

## Goal

Add a small toolbar above the body field with Bold / Italic / Bullet list / Numbered list buttons, plus `Cmd/Ctrl+B` and `Cmd/Ctrl+I` shortcuts when the textarea is focused. The editor stays a plain textarea — no WYSIWYG, no shortcut-driven inline transforms while typing. Browser-native undo (Cmd+Z) must continue to work one toolbar click at a time.

## Scope

In:

- Toolbar with four buttons: Bold, Italic, Bullet list, Numbered list.
- Keyboard: `Cmd/Ctrl+B` for bold, `Cmd/Ctrl+I` for italic, fired when the body textarea has focus.
- Toggle semantics: clicking a button (or pressing the shortcut) on already-formatted text removes the formatting.
- Multi-line list toggling: list buttons act on every line touched by the selection.
- Native undo preserved via `document.execCommand("insertText", …)`, with a graceful fallback if `insertText` is unsupported.

Out:

- Shortcuts for lists (`Cmd+Shift+8`, `Cmd+Shift+7`).
- Enter-continues-list / Enter-on-empty-list-line-exits behavior.
- Link, table, code-block, heading, checklist, or blockquote affordances.
- A general-purpose `MarkdownEditor` primitive in `src/lib/ui/`. The toolbar lives next to its only consumer for now (per `src/lib/ui/README.md` extraction rules).
- WYSIWYG, live-preview-as-you-type inline transforms, or any rich-text model. The textarea remains plain text.

## UX

- A row of four square `IconButton`s sits directly above the body `Textarea`, aligned with its left edge. Tooltips / `aria-label`s: "Bold", "Italic", "Bullet list", "Numbered list".
- Clicking a button does not steal focus from the textarea (`onMouseDown` `preventDefault`; the action fires on click). After the action, the textarea retains focus and the selection is set to whatever range the helper computed.
- Inline buttons (Bold/Italic) on a selection wrap or unwrap the selection. With no selection they insert empty markers (`****`, `__`) and place the caret between them.
- List buttons (Bullet/Numbered) operate on the lines touched by the selection (or the caret line if collapsed). If any line lacks the prefix, the button adds the prefix to all of them. If every line already has the prefix, it strips them. The post-edit selection spans the same line range so the button is repeatable.
- `Cmd/Ctrl+B` and `Cmd/Ctrl+I` mirror the inline buttons and `preventDefault` on the keyboard event so the browser's default chrome bolding doesn't fire.
- The "Supports Markdown — bold, italic, lists, tables." help line under the textarea is unchanged.

## Architecture

```
src/cards/
  markdown/
    commands.ts          — pure helpers; describe edits, no DOM
    commands.test.ts     — Vitest, exhaustive table per helper
    MarkdownToolbar.tsx  — 4 IconButtons; emits onCommand(name)
    MarkdownToolbar.module.css
    MarkdownToolbar.test.tsx
  CardEditor.tsx         — adds ref, onKeyDown, MarkdownToolbar
src/lib/ui/icons/        — 4 new SVG icons (bold, italic, bullet-list, numbered-list)
e2e/
  editor-markdown.spec.ts — Playwright; real execCommand, undo preservation
```

Two concerns kept separate:

1. **What the edit is** — a pure function over `(value, selectionStart, selectionEnd, kind)` returning a description of the textarea mutation. Lives in `commands.ts`. Trivial to unit-test.
2. **How the edit is applied to the DOM** — preserves browser undo via `execCommand("insertText")`. Lives inside `CardEditor` (or a tiny `applyEdit` helper colocated with it).

### Helper API

```ts
// src/cards/markdown/commands.ts

export type EditorState = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export type Edit = {
  // Range of `state.value` to replace (`[replaceStart, replaceEnd)`).
  replaceStart: number;
  replaceEnd: number;
  // Text to insert in that range.
  replacement: string;
  // Selection on the post-edit value. (i.e. on
  // value.slice(0, replaceStart) + replacement + value.slice(replaceEnd))
  selectionStart: number;
  selectionEnd: number;
};

export function toggleWrap(state: EditorState, marker: "**" | "_"): Edit;
export function togglePrefix(state: EditorState, kind: "bullet" | "numbered"): Edit;

// Test helper. Component code does not call this on the happy path —
// it's only used by the fallback when execCommand is unavailable.
export function applyEdit(value: string, edit: Edit): string;
```

#### `toggleWrap` rules

Let `m` = the marker (`**` or `_`). Let `[s, e)` be the current selection on `value`.

1. **Selection wrapped (markers inside selection):** `e - s >= 2 * m.length`, `value.slice(s, e)` starts with `m`, and ends with `m`. Strip both — emit an `Edit` that replaces `[s, e)` with `value.slice(s + m.length, e - m.length)` and sets the post-edit selection to `[s, s + (e - s) - 2 * m.length]`. (The length guard prevents `**` selected → no-op.)
2. **Selection wrapped (markers outside selection):** `value.slice(s - m.length, s) === m && value.slice(e, e + m.length) === m`. Strip — emit an `Edit` that replaces `[s - m.length, e + m.length)` with `value.slice(s, e)` and sets the post-edit selection to `[s - m.length, e - m.length]`.
3. **Empty selection (`s === e`):** insert `m + m` at `s`; place caret between markers. `replaceStart = replaceEnd = s`, `replacement = m + m`, post-edit selection `[s + m.length, s + m.length]`.
4. **Otherwise:** wrap. Replace `[s, e)` with `m + value.slice(s, e) + m`; selection covers the inner text on the post-edit value.

Case 1 takes precedence over case 2 when both match (defensive — should not normally co-occur).

#### `togglePrefix` rules

1. Determine the line range touched by `[s, e)`: line `L1` is the line containing `s`, line `L2` is the line containing `e`. (If `s === e` and the caret sits at the end of a line, that's the line.) Edge case: if the selection ends exactly on a line break (`e` is at column 0 of `L2`) and `L2 > L1`, treat the range as `[L1, L2 - 1]` (don't include the empty line below the selection).
2. For each line in the range, check whether it already has the prefix:
   - Bullet: `^- ` (literal hyphen + space at start of line, ignoring leading whitespace).
   - Numbered: `^\d+\.\s+`.
3. **Strip mode:** if every line in the range matches its prefix pattern, strip the prefix from each. The replacement string is the lines, each with its prefix removed, rejoined with `\n`.
4. **Add mode:** otherwise, prefix each line:
   - Bullet: `- ` prepended.
   - Numbered: `1. `, `2. `, `3. `, … in order.
5. Replace the full block (`[startOfL1, endOfL2)`) with the new text. Post-edit selection covers the same line block (`[startOfL1, startOfL1 + replacement.length]`).

Mixed input (some lines bulleted, some not) follows case 4 — adds the prefix to all of them. This matches the standard editor convention and is what Google Docs / Notion / VS Code's markdown-list toggle do.

Numbered toggle does **not** attempt to stitch into surrounding numbered lists. If the user toggles `1. 2. 3.` next to an existing `4. 5.` block, the result is two separate lists; that's `marked`'s problem, not ours, and the rendered card will still order correctly per the source numbers.

#### `applyEdit` (fallback / test helper)

```ts
export function applyEdit(value: string, edit: Edit): string {
  return value.slice(0, edit.replaceStart) + edit.replacement + value.slice(edit.replaceEnd);
}
```

Used by `commands.test.ts` to assert resulting strings, and by the runtime fallback path described below.

### DOM application — `applyEditToTextarea`

```ts
export function applyEditToTextarea(
  textarea: HTMLTextAreaElement,
  edit: Edit,
  fallback: (nextValue: string) => void,
): void {
  textarea.focus();
  textarea.setSelectionRange(edit.replaceStart, edit.replaceEnd);

  const supported =
    typeof document.queryCommandSupported === "function" &&
    document.queryCommandSupported("insertText");

  let ok = false;
  if (supported) {
    ok = document.execCommand("insertText", false, edit.replacement);
  }
  if (!ok) {
    fallback(applyEdit(textarea.value, edit));
  }
  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}
```

`execCommand("insertText")` on a focused textarea dispatches a real `input` event. React's `onChange` runs against that event, so `card.body` flows through the existing `onChange` path with no special handling. The browser also records the edit on its native undo stack — Cmd+Z reverses one toolbar click at a time.

The fallback path (`document.execCommand` missing or returning false) calls the parent's `onChange` directly with the post-edit value. Native undo collapses to one entry across the click in that path; that's the documented degradation.

`execCommand` is deprecated, but MDN explicitly carves out the undo-buffer use case and recommends `queryCommandSupported` for feature detection (which is what we do). Every shipping browser still implements `insertText` for `<textarea>`s; this is the same approach used by GitHub, GitLab, Reddit, Slack's compose box, etc.

### `MarkdownToolbar`

```tsx
type Command = "bold" | "italic" | "bullet" | "numbered";

type Props = {
  onCommand: (cmd: Command) => void;
};
```

Renders four `IconButton`s in a row. Each button:

- Has an explicit `aria-label` ("Bold", "Italic", "Bullet list", "Numbered list").
- Calls `onMouseDown` with `e.preventDefault()` so clicking does not move focus off the textarea.
- Calls `onCommand(cmd)` on `onPress` (RAC convention).

The component knows nothing about the textarea, the value, or the command helpers. It only emits an event.

### `CardEditor` wiring

```tsx
const bodyRef = useRef<HTMLTextAreaElement>(null);

const runCommand = (cmd: Command) => {
  const ta = bodyRef.current;
  if (!ta) return;
  const state: EditorState = {
    value: ta.value,
    selectionStart: ta.selectionStart,
    selectionEnd: ta.selectionEnd,
  };
  const edit =
    cmd === "bold"     ? toggleWrap(state, "**")
  : cmd === "italic"   ? toggleWrap(state, "_")
  : cmd === "bullet"   ? togglePrefix(state, "bullet")
  :                      togglePrefix(state, "numbered");
  applyEditToTextarea(ta, edit, (nextValue) =>
    onChange({ ...card, body: nextValue, updatedAt: nowIso() }),
  );
};

const onBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
  if (e.key === "b" || e.key === "B") {
    e.preventDefault();
    runCommand("bold");
  } else if (e.key === "i" || e.key === "I") {
    e.preventDefault();
    runCommand("italic");
  }
};
```

`onKeyDown` flows through the existing `...rest` spread on the `Textarea` primitive. `ref` does not — the primitive is a plain function component today (`src/lib/ui/Textarea.tsx`). Wrap it in `forwardRef<HTMLTextAreaElement, TextareaProps>` so `bodyRef` reaches the underlying `<textarea>`. No other call site is affected.

The toolbar sits above the textarea inside the body field's `<label>`:

```tsx
<label className={styles.field} htmlFor={ids.body}>
  <span className={styles.label}>Body</span>
  <MarkdownToolbar onCommand={runCommand} />
  <Textarea
    ref={bodyRef}
    id={ids.body}
    aria-describedby={ids.bodyHelp}
    value={card.body}
    onChange={handle("body")}
    onKeyDown={onBodyKeyDown}
    rows={8}
  />
  <span id={ids.bodyHelp} className={styles.help}>…</span>
</label>
```

### Icons

Four new SVGs under `src/lib/ui/icons/` — `bold.tsx`, `italic.tsx`, `bullet-list.tsx`, `numbered-list.tsx` — matching the existing icon pattern (24×24 stroke icons). Sourced from the same set as the other editor icons; final visual choice tuned during implementation.

### Styling

`MarkdownToolbar.module.css` is short:

```css
.toolbar {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-1);
}
```

No new tokens required. Buttons inherit `IconButton`'s focus ring, hover state, and disabled state.

## Testing

### Vitest (jsdom)

- **`commands.test.ts`** — the bulk of the coverage. Table-driven tests for every branch of `toggleWrap` and `togglePrefix`:
  - `toggleWrap`:
    - Empty value, empty selection → `****`, caret between.
    - Selection plain text → wrap.
    - Selection includes markers (`**foo**`) → strip.
    - Selection between markers (`foo` with `**` immediately around) → strip.
    - Multi-line selection wraps the whole range as one (single pair of markers).
    - Selection at start / end of value (no out-of-bounds when probing for outer markers).
    - `_` italic marker behaves identically to `**`.
  - `togglePrefix`:
    - Single-line caret, no prefix → adds prefix.
    - Single-line caret, has prefix → strips.
    - Multi-line selection, none prefixed → adds to all.
    - Multi-line selection, all prefixed → strips from all.
    - Multi-line selection, mixed → adds to all.
    - Numbered renumbers from `1.` regardless of any source numbering.
    - Selection ending exactly on a newline doesn't pull in the next line.
    - Empty value (caret at 0) — adds prefix on the current empty line, no crash.
- **`MarkdownToolbar.test.tsx`** — renders, `getByRole("button", { name: "Bold" })` etc. exist, `userEvent.click(boldButton)` calls `onCommand` with `"bold"`. `onMouseDown.preventDefault` is exercised implicitly by `userEvent`.
- **`CardEditor.test.tsx`** — extend. `Cmd+B` keystroke on the body textarea triggers the bold command path; assert via the `onChange` it receives. Does **not** assert on the result of DOM mutation (that's Playwright's job — execCommand isn't real here).

### Playwright (`e2e/editor-markdown.spec.ts`)

Real Chromium; this is where the DOM-mutating behavior is verified end-to-end.

- Load the editor for a card.
- **Toolbar bold:** type "hello world", select "hello", click Bold. Textarea reads `**hello** world`. Click Bold again — back to `hello world`.
- **Keyboard bold:** type "abc", select "abc", press Cmd+B. Reads `**abc**`.
- **Italic:** same pair of cases for `Cmd+I` / italic button.
- **Bullet multi-line:** type three lines, select all, click Bullet. All three lines get `- ` prefix. Click again — prefixes gone.
- **Numbered multi-line:** same setup, click Numbered. Lines read `1. one\n2. two\n3. three`.
- **Undo preservation:** type "hello world", select "world", click Bold (now `hello **world**`). Press Cmd+Z (or `keyboard.press("Meta+z")` / `Control+z` per platform). Textarea reverts to `hello world`. Press Cmd+Z again — typed text begins to undo character by character.
- **Focus retention:** click a toolbar button; `document.activeElement` is still the textarea.

## Edge cases

- **execCommand returns false / unsupported.** Fallback path (`onChange` with computed value); Cmd+Z then collapses the toolbar click into one undo entry. Documented behavior.
- **Selection at value boundary** when checking for outer markers (case 2 of `toggleWrap`). Helper guards `s - m.length >= 0` and `e + m.length <= value.length` before slicing.
- **Multi-byte characters in selection.** JS string indices are UTF-16 code units, which is what `selectionStart`/`selectionEnd` already use. No special handling needed.
- **Numbered list >9 items.** `1. … 10. … 11.` — works fine; helper just counts.
- **Caret at end of an empty line** when toggling a list. Treated as a line of zero characters; gets `- ` (or `1. `) prepended; caret remains after the prefix. (The `replacement` ends with the prefix, and post-edit selection is at `replaceStart + replacement.length`.)
- **A line that is whitespace-only** (e.g., spaces). Gets prefixed in add mode; the prefix-detection regex on strip mode requires the prefix at the start of the line content (not before the leading whitespace), so a line like `   - foo` strips to `   foo`. We anchor the strip regex to `^[ \t]*(- |\d+\.\s+)?` and re-emit the leading whitespace.
- **Selection of just the marker characters** (e.g., user selects `**` and presses Cmd+B). `e - s === 2` fails the case-1 length guard, so the helper falls through to case 4 (wrap), producing `****`. Acceptable and matches what GitHub does.

## Risks

- **`execCommand` removal in some future browser.** Mitigated by feature detection + fallback. The fallback is functionally correct; only the granularity of native undo degrades.
- **`Textarea` `forwardRef` change.** Shared primitive change, but unobservable to existing call sites — they pass no `ref`, and `forwardRef` is type-compatible with the current `(props) => JSX` shape.
- **Keyboard shortcut conflict with browser bookmarks bar (`Cmd+B`).** `preventDefault` on the textarea-scoped handler is sufficient; Chrome/Firefox/Safari all let the page swallow `Cmd+B` when fired on a focused editable element.
- **Toolbar icons not yet picked.** Visual choice is small but real; expect a brief tuning step during implementation. Spec doesn't gate on it.

## Out of scope

- Cmd+Shift+8 / Cmd+Shift+7 list shortcuts.
- Enter-continues-list / Enter-on-empty-list-line-exits.
- Live preview, WYSIWYG, or any rich-text model.
- Link, table, code-block, heading, checklist, blockquote affordances.
- A `MarkdownEditor` primitive in `src/lib/ui/`. Re-evaluate if a second consumer ever appears.
- A migration that auto-formats existing cards.
