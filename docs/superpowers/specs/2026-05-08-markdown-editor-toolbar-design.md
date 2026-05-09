# Markdown editor toolbar

## Problem

Card bodies render as Markdown (`renderBody.ts` → `marked` → DOMPurify), but the editor body field is a plain `<textarea>` with no formatting affordances. Authoring `**bold**`, `_italic_`, and `- bullet` lists by hand is fine for power users but a friction tax for everyone else, and the lack of `Cmd+B` / `Cmd+I` is a small but constant surprise.

## Goal

Add a small toolbar above the body field with Bold / Italic / Bullet list / Numbered list buttons, plus `Cmd/Ctrl+B` and `Cmd/Ctrl+I` shortcuts when the textarea is focused. The editor stays a plain textarea — no WYSIWYG, no shortcut-driven inline transforms while typing. Browser-native undo (Cmd+Z) must continue to work one toolbar action at a time.

## Approach

Use [`@github/markdown-toolbar-element`](https://github.com/github/markdown-toolbar-element), the ~5KB web component GitHub uses on its own PR/issue textareas. It handles the parts that are easy to get wrong: selection wrap/unwrap, multi-line list toggling, mixed-prefix renumbering, edge cases around line boundaries, and undo preservation via `document.execCommand("insertText")`. We supply the icon buttons, the styling, and a small textarea-scoped keyboard handler for `Cmd/Ctrl+B/I`.

This collapses what would have been ~300 lines of helper logic + tests into a thin styling and wiring layer, and outsources the edge cases to a battle-tested implementation.

## Scope

In:

- Toolbar above the body field with four buttons: Bold, Italic, Bullet list, Numbered list.
- Keyboard: `Cmd/Ctrl+B` for bold, `Cmd/Ctrl+I` for italic, fired when the body textarea has focus.
- Toggle semantics, multi-line list handling, undo preservation: inherited from the library.
- Styling matches the rest of the editor (focus ring, hover state, screen tokens).

Out:

- Shortcuts for lists (`Cmd+Shift+8/7`).
- Active-state highlighting on toolbar buttons (e.g., Bold lights up when caret is inside `**…**`).
- Buttons for link, image, code, header, quote, task list, mention, ref. The library supports them; we don't render them.
- Live preview, WYSIWYG, or any rich-text model. The textarea stays plain text.
- A general-purpose `MarkdownEditor` primitive in `src/lib/ui/`. The toolbar lives next to its only consumer for now.

## UX

- A row of four buttons sits directly above the body `Textarea`, aligned with its left edge.
- Each button shows an icon (24×24 stroke icons matching the existing `src/lib/ui/icons/` set) and has an explicit `aria-label` that includes the shortcut where applicable: "Bold (⌘B)", "Italic (⌘I)", "Bullet list", "Numbered list".
- Clicking a button does not steal focus from the textarea (the library handles this internally).
- Inline buttons (Bold/Italic) on a selection wrap or unwrap; on no selection, insert empty markers and place the caret between them. List buttons toggle the line(s) the selection touches.
- `Cmd/Ctrl+B` and `Cmd/Ctrl+I` mirror the inline buttons.
- The "Supports Markdown — bold, italic, lists, tables." help line under the textarea is unchanged.

## Architecture

```
src/cards/
  MarkdownToolbar.tsx        — renders <markdown-toolbar> + four <md-*> children
  MarkdownToolbar.module.css — styles for <md-bold>, <md-italic>, etc.
  MarkdownToolbar.test.tsx
  CardEditor.tsx             — renders <MarkdownToolbar>; adds Cmd+B/I handler on textarea
src/lib/ui/
  Textarea.tsx               — wrap in forwardRef so CardEditor can hold a ref
  icons/                     — 4 new SVG icons (bold, italic, bullet-list, numbered-list)
src/types/
  jsx-markdown-toolbar.d.ts  — JSX intrinsic declarations for the web components
e2e/
  editor-markdown.spec.ts    — Playwright; real execCommand, undo preservation
```

### Dependency

```
npm install --save @github/markdown-toolbar-element
```

The package registers four custom elements as a side effect on import: `markdown-toolbar`, `md-bold`, `md-italic`, `md-unordered-list`, `md-ordered-list` (and others we don't render). Import once at the top of `MarkdownToolbar.tsx`:

```tsx
import "@github/markdown-toolbar-element";
```

The library uses `document.execCommand("insertText")` internally with a fallback to direct `value` assignment, so native undo is preserved without us doing anything.

### TypeScript intrinsics

The package doesn't ship JSX type augmentations. We declare them once in `src/types/jsx-markdown-toolbar.d.ts`. Project tsconfig is on `"jsx": "react-jsx"`, so intrinsics resolve from `React.JSX.IntrinsicElements`, not the global `JSX.IntrinsicElements`. Augment via module declaration on `react`:

```ts
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MarkdownToolbarAttrs = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  for?: string;
};
type MdButtonAttrs = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "markdown-toolbar": MarkdownToolbarAttrs;
      "md-bold": MdButtonAttrs;
      "md-italic": MdButtonAttrs;
      "md-unordered-list": MdButtonAttrs;
      "md-ordered-list": MdButtonAttrs;
    }
  }
}
```

`for` is added explicitly (the web component reads the lowercase attribute; React passes unknown lowercase props verbatim on intrinsics). `className` is type-correct on these declarations and React 18 translates it to `class` on the DOM. `ref` typed as `RefObject<HTMLElement>` works — React attaches it to the underlying DOM node.

### `MarkdownToolbar.tsx`

```tsx
import "@github/markdown-toolbar-element";
import { forwardRef } from "react";
import { BoldIcon } from "../lib/ui/icons/bold";
import { ItalicIcon } from "../lib/ui/icons/italic";
import { BulletListIcon } from "../lib/ui/icons/bullet-list";
import { NumberedListIcon } from "../lib/ui/icons/numbered-list";
import styles from "./MarkdownToolbar.module.css";

type Props = {
  htmlFor: string;
  boldRef?: React.RefObject<HTMLElement>;
  italicRef?: React.RefObject<HTMLElement>;
};

export function MarkdownToolbar({ htmlFor, boldRef, italicRef }: Props) {
  return (
    <markdown-toolbar
      for={htmlFor}
      role="toolbar"
      aria-label="Formatting"
      className={styles.toolbar}
    >
      <md-bold ref={boldRef} tabIndex={0} className={styles.button} aria-label="Bold (⌘B)">
        <BoldIcon aria-hidden="true" />
      </md-bold>
      <md-italic ref={italicRef} tabIndex={-1} className={styles.button} aria-label="Italic (⌘I)">
        <ItalicIcon aria-hidden="true" />
      </md-italic>
      <md-unordered-list tabIndex={-1} className={styles.button} aria-label="Bullet list">
        <BulletListIcon aria-hidden="true" />
      </md-unordered-list>
      <md-ordered-list tabIndex={-1} className={styles.button} aria-label="Numbered list">
        <NumberedListIcon aria-hidden="true" />
      </md-ordered-list>
    </markdown-toolbar>
  );
}
```

A few details worth calling out:

- **`tabIndex={0}` on the first button, `tabIndex={-1}` on the rest.** The library implements roving tabindex (arrow keys move focus among buttons it sees as part of the toolbar) but it does *not* initialize the first button into the tab order. Without these explicit attributes, a keyboard-only user cannot reach the toolbar at all.
- **`role="toolbar"` + `aria-label="Formatting"` on `<markdown-toolbar>`.** Required by WAI-ARIA's Toolbar pattern; the library doesn't set them.
- **`aria-hidden="true"` on each icon `<svg>`.** Prevents double-announcement alongside the button's `aria-label`.
- **`className`, not `class`.** React 18 translates `className` → `class` on the DOM for custom-element JSX intrinsics typed as `HTMLElement`.

### `MarkdownToolbar.module.css`

`<md-bold>` and friends register themselves with `role="button"` but ship with no default styling — they render as inline elements with no border, padding, or focus ring. Our CSS gives them the same look as `IconButton`, using existing screen tokens. Sketch:

```css
.toolbar {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  user-select: none;
  transition:
    background 0.12s,
    color 0.12s;
}

.button:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.button:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.button > svg {
  width: 1rem;
  height: 1rem;
}
```

Final tuning during implementation against the existing editor visuals. No new tokens needed.

### `CardEditor.tsx` wiring

The body field section becomes:

```tsx
const bodyRef = useRef<HTMLTextAreaElement>(null);
const boldRef = useRef<HTMLElement>(null);
const italicRef = useRef<HTMLElement>(null);

const onBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "b") {
    e.preventDefault();
    boldRef.current?.click();
  } else if (k === "i") {
    e.preventDefault();
    italicRef.current?.click();
  }
};

// …

<label className={styles.field} htmlFor={ids.body}>
  <span className={styles.label}>Body</span>
  <MarkdownToolbar htmlFor={ids.body} boldRef={boldRef} italicRef={italicRef} />
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

Why click the `<md-*>` element instead of dispatching directly: the library reads the textarea state on every click event it receives. Triggering a click is the public API; reaching past it isn't.

`bodyRef` is included for completeness (a focused textarea is what the library targets, located via the `for=` attribute on `<markdown-toolbar>`). It also lets future features hook in without re-plumbing.

### `Textarea` ref forwarding

`src/lib/ui/Textarea.tsx` is a plain function component today and doesn't forward `ref`. Wrap it in `forwardRef<HTMLTextAreaElement, TextareaProps>` so `bodyRef` reaches the underlying `<textarea>`. No call site is affected — none currently pass a ref.

### Icons

Four new SVGs under `src/lib/ui/icons/` matching the existing 24×24 stroke style: `bold.tsx`, `italic.tsx`, `bullet-list.tsx`, `numbered-list.tsx`. Visual choice tuned during implementation against representative cards.

## Testing

### Vitest (jsdom)

Web components register via the `customElements` registry, which jsdom supports.

- **`MarkdownToolbar.test.tsx`** —
  - Renders four buttons; each has the expected `aria-label` (`getByRole("button", { name: /bold/i })`, etc.).
  - The `<markdown-toolbar>` element has the right `for` attribute, and the value matches a textarea `id` rendered in the same harness — easy to regress when `useId` is rewired.
  - The first `md-*` button has `tabIndex="0"`, the others `"-1"` (roving-tabindex initialization).
  - **Do not click the buttons in unit tests.** The library calls `document.execCommand`, whose return-value semantics in jsdom are inconsistent across versions. Behavior assertions live in Playwright; unit tests assert structure and DOM glue only.

- **`CardEditor.test.tsx`** — extend.
  - `Cmd+B` keystroke on the body textarea calls the bold button's click. Spy by replacing `boldRef.current.click` with a `vi.fn()` (or attaching a listener directly to the ref'd node), assert called once.
  - The handler calls `event.preventDefault()` (assert via the synthetic event spy) — without it, the browser may swallow the keystroke for its own bookmarks/menu actions.
  - `Cmd+I` similarly.
  - `Cmd+Shift+B` does not trigger bold (modifier guard).

The pure-helper tests from the previous design are gone — the helpers no longer exist.

### Playwright (`e2e/editor-markdown.spec.ts`)

Real Chromium; the only place we verify formatting actually happens.

- **Toolbar bold:** type "hello world", select "hello", click Bold. Textarea reads `**hello** world`. Click Bold again — back to `hello world`.
- **Keyboard bold:** type "abc", select "abc", press Cmd/Meta+B. Reads `**abc**`.
- **Italic:** same pair of cases for `Cmd+I` / italic button.
- **Bullet multi-line:** type three lines, select all, click Bullet. All three lines get `- ` prefix. Click again — prefixes gone.
- **Numbered multi-line:** same setup, click Numbered. Lines read `1. one\n2. two\n3. three` (or whatever the library produces — assert on the actual library behavior, not a guess).
- **Undo preservation:** type "hello world", select "world", click Bold (now `hello **world**`). Press Cmd/Meta+Z. Textarea reverts to `hello world`. Press Cmd/Meta+Z again — typed text begins to undo character by character.
- **Focus retention:** click a toolbar button; `document.activeElement` is still the textarea.

## Edge cases

- **`execCommand` unsupported.** The library falls back to direct `value` assignment with `ms-beginUndoUnit`/`ms-endUndoUnit` wrapping (its existing fallback). Cmd+Z then collapses the toolbar action into one undo entry. Documented degradation; no work for us.
- **`<markdown-toolbar>` rendered without a matching textarea id.** The library's click handlers no-op; nothing else breaks. Not a real failure mode in our app — `htmlFor` always matches a real id from `useId`.
- **Form submission.** `<md-bold>` etc. set `role="button"` but are not `<button type=…>` elements; they will not submit a parent form. The card editor's `<form>` already has `onSubmit={(e) => e.preventDefault()}`, so this is a non-issue.
- **Keyboard layout.** `e.key` reads the produced character, which on most layouts gives `b`/`i` as expected. On non-Latin layouts where Cmd+B types something else, the shortcut won't fire — same behavior as Google Docs and similar editors. Not worth complicating with `e.code`.

## Risks

- **Library maintenance / removal.** GitHub uses the library on github.com daily; archival risk is low. If it ever happens, the library is small enough to vendor.
- **Web-component lifecycle in tests.** jsdom supports custom elements but quirks exist. Mitigated by keeping Vitest assertions DOM-shaped (aria-labels, attributes) rather than formatting-shaped, and pushing real-behavior assertions into Playwright.
- **TypeScript intrinsic drift.** If the project's tsconfig flips to `react-jsx`, the JSX namespace declaration moves from `JSX.IntrinsicElements` to `React.JSX.IntrinsicElements`. One-line fix when it happens.
- **Visual drift from `IconButton`.** The toolbar buttons replicate IconButton's appearance via a separate CSS module rather than reusing the React primitive (we can't nest a real `<button>` inside `role="button"`). If IconButton's styling evolves, MarkdownToolbar's CSS may lag. Mitigated by referencing the same screen tokens; flagged here so a future design-system pass knows to check both.

## Out of scope

- Cmd+Shift+8 / Cmd+Shift+7 list shortcuts.
- Enter-continues-list / Enter-on-empty-list-line-exits — not provided by the library.
- Active-state highlighting on toolbar buttons.
- Live preview, WYSIWYG, or any rich-text model.
- Link, table, code-block, heading, checklist, blockquote, mention, or ref affordances.
- A `MarkdownEditor` primitive in `src/lib/ui/`. Re-evaluate if a second consumer ever appears.
- A migration that auto-formats existing cards.
