# Markdown Editor Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-button markdown toolbar (Bold / Italic / Bullet list / Numbered list) above the body textarea in `CardEditor`, plus `Cmd/Ctrl+B` and `Cmd/Ctrl+I` keyboard shortcuts when the textarea has focus.

**Architecture:** Drop in `@github/markdown-toolbar-element` — a ~5KB web component library that handles selection wrap/unwrap, multi-line list toggling, and undo preservation via `document.execCommand("insertText")`. We supply icon buttons styled to match `IconButton`, wire ARIA semantics (`role="toolbar"`, roving tabindex, `aria-label`s), and add a small textarea-scoped `onKeyDown` handler that fires the bold/italic buttons via refs.

**Tech Stack:** React 19, TypeScript (`jsx: "react-jsx"`), `@github/markdown-toolbar-element`, `@iconify/react` + `@iconify-icons/lucide`, Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-05-08-markdown-editor-toolbar-design.md`

---

## Sequencing

1. Install the library (Task 1) — gates everything else.
2. JSX intrinsics + Textarea ref forwarding + icons (Tasks 2–4) — independent foundations.
3. `MarkdownToolbar` component, TDD (Task 5).
4. Wire it into `CardEditor` with the keyboard handler, TDD (Task 6).
5. Playwright behavior coverage (Task 7) — the only place we exercise real `execCommand`.

Frequent commits between tasks. Run `npm test` and `npm run typecheck` (and `npm run lint`) before each commit; they're already pre-approved.

---

## Task 1: Install `@github/markdown-toolbar-element`

> **Approval needed.** This task adds a new dependency. Stop and confirm with the user before running `npm install` (per project memory).

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Confirm with the user that adding the dependency is approved.**

The user must say "go ahead" / "approved" / "yes" or equivalent before running install. Do not run install on standing approval — `npm install <new package>` is specifically excluded from the standing dev-loop approval per the user's memory.

- [ ] **Step 2: Install the package.**

Run: `npm install --save @github/markdown-toolbar-element`

Expected: dependency added to `dependencies` (not `devDependencies` — it ships in the runtime bundle).

- [ ] **Step 3: Confirm install.**

Run: `npm ls @github/markdown-toolbar-element`
Expected: prints a single matching version, no peer-dep warnings on react/react-dom.

- [ ] **Step 4: Sanity-check the build still passes.**

Run: `npm run typecheck && npm test`
Expected: PASS. (No source changes yet, so this just verifies the install didn't break anything.)

- [ ] **Step 5: Commit.**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @github/markdown-toolbar-element"
```

---

## Task 2: Declare JSX intrinsics for the web components

**Files:**
- Create: `src/types/jsx-markdown-toolbar.d.ts`

The library registers four custom elements (`<markdown-toolbar>`, `<md-bold>`, `<md-italic>`, `<md-unordered-list>`, `<md-ordered-list>`) but doesn't ship JSX type augmentations. The project's tsconfig is on `"jsx": "react-jsx"`, so intrinsics must be declared on `React.JSX.IntrinsicElements` via module augmentation — the global `JSX` namespace doesn't apply.

- [ ] **Step 1: Create the declaration file.**

```ts
// src/types/jsx-markdown-toolbar.d.ts
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

The `for` attribute is added explicitly because the web component reads the lowercase HTML attribute (React passes unknown lowercase props verbatim on intrinsics). `className`, `ref`, `tabIndex`, and `aria-*` attributes are all type-correct via `DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>`.

- [ ] **Step 2: Verify the types load.**

Run: `npm run typecheck`
Expected: PASS. The new file is under `src/`, which is in `tsconfig.app.json`'s `include`, so it's picked up automatically.

- [ ] **Step 3: Commit.**

```bash
git add src/types/jsx-markdown-toolbar.d.ts
git commit -m "feat(types): JSX intrinsics for @github/markdown-toolbar-element"
```

---

## Task 3: Forward ref on `Textarea`

**Files:**
- Modify: `src/lib/ui/Textarea.tsx`

`CardEditor` will hold a `bodyRef` so future toolbar wiring can reach the textarea's DOM node. No existing call site passes a `ref`, so this change is unobservable to consumers.

- [ ] **Step 1: Replace the function component with a `forwardRef` version.**

Current contents (`src/lib/ui/Textarea.tsx`):

```tsx
import type { TextareaHTMLAttributes } from "react";
import styles from "./Textarea.module.css";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  className?: string;
};

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea {...rest} className={[styles.textarea, className].filter(Boolean).join(" ")} />;
}
```

Replace with:

```tsx
import { type TextareaHTMLAttributes, forwardRef } from "react";
import styles from "./Textarea.module.css";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  className?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      {...rest}
      className={[styles.textarea, className].filter(Boolean).join(" ")}
    />
  ),
);
Textarea.displayName = "Textarea";
```

- [ ] **Step 2: Verify nothing regressed.**

Run: `npm run typecheck && npm test`
Expected: PASS. No call site passes `ref`, so behavior is unchanged. `CardEditor.test.tsx` continues to pass.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/ui/Textarea.tsx
git commit -m "refactor(ui): forward ref on Textarea"
```

---

## Task 4: Add four toolbar icons

**Files:**
- Create: `src/lib/ui/icons/BoldIcon.tsx`
- Create: `src/lib/ui/icons/ItalicIcon.tsx`
- Create: `src/lib/ui/icons/BulletListIcon.tsx`
- Create: `src/lib/ui/icons/NumberedListIcon.tsx`

All four follow the existing pattern (see `src/lib/ui/icons/PencilIcon.tsx`): `@iconify/react` + a Lucide icon datafile from `@iconify-icons/lucide`, default `size={16}`, baked-in `aria-hidden="true"`. The Lucide set is already a project dependency — no new packages.

- [ ] **Step 1: Create `BoldIcon.tsx`.**

```tsx
// src/lib/ui/icons/BoldIcon.tsx
import { Icon } from "@iconify/react";
import boldIcon from "@iconify-icons/lucide/bold";

export function BoldIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={boldIcon} width={size} height={size} aria-hidden="true" />;
}
```

- [ ] **Step 2: Create `ItalicIcon.tsx`.**

```tsx
// src/lib/ui/icons/ItalicIcon.tsx
import { Icon } from "@iconify/react";
import italicIcon from "@iconify-icons/lucide/italic";

export function ItalicIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={italicIcon} width={size} height={size} aria-hidden="true" />;
}
```

- [ ] **Step 3: Create `BulletListIcon.tsx`.**

```tsx
// src/lib/ui/icons/BulletListIcon.tsx
import { Icon } from "@iconify/react";
import listIcon from "@iconify-icons/lucide/list";

export function BulletListIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={listIcon} width={size} height={size} aria-hidden="true" />;
}
```

- [ ] **Step 4: Create `NumberedListIcon.tsx`.**

```tsx
// src/lib/ui/icons/NumberedListIcon.tsx
import { Icon } from "@iconify/react";
import listOrderedIcon from "@iconify-icons/lucide/list-ordered";

export function NumberedListIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={listOrderedIcon} width={size} height={size} aria-hidden="true" />;
}
```

- [ ] **Step 5: Confirm the icons resolve and typecheck.**

Run: `npm run typecheck`
Expected: PASS. (Trust that lucide ships these four — `bold`, `italic`, `list`, `list-ordered` are standard Lucide icon names. If a typecheck error mentions a missing module, the icon name is wrong; correct it before continuing.)

- [ ] **Step 6: Commit.**

```bash
git add src/lib/ui/icons/BoldIcon.tsx src/lib/ui/icons/ItalicIcon.tsx \
        src/lib/ui/icons/BulletListIcon.tsx src/lib/ui/icons/NumberedListIcon.tsx
git commit -m "feat(ui): bold/italic/list icons for markdown toolbar"
```

---

## Task 5: `MarkdownToolbar` component (TDD)

**Files:**
- Create: `src/cards/MarkdownToolbar.tsx`
- Create: `src/cards/MarkdownToolbar.module.css`
- Create: `src/cards/MarkdownToolbar.test.tsx`

### What the tests assert (and what they don't)

Unit tests stay structural: roles, labels, the `for=`-to-`id` link, roving-tabindex initialization. They do **not** click the buttons — `<md-*>` calls `document.execCommand("insertText")` whose return-value semantics are inconsistent in jsdom across versions, so behavior assertions live in Playwright (Task 7).

- [ ] **Step 1: Write the failing test file.**

```tsx
// src/cards/MarkdownToolbar.test.tsx
import { render, screen } from "@testing-library/react";
import { useId } from "react";
import { describe, expect, test } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

function Harness() {
  const id = useId();
  return (
    <>
      <MarkdownToolbar htmlFor={id} />
      <textarea id={id} aria-label="body" defaultValue="" />
    </>
  );
}

describe("<MarkdownToolbar>", () => {
  test("renders four buttons with accessible labels", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /italic/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bullet list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /numbered list/i })).toBeInTheDocument();
  });

  test("bold and italic buttons advertise their keyboard shortcut", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /bold/i })).toHaveAccessibleName(/⌘B/);
    expect(screen.getByRole("button", { name: /italic/i })).toHaveAccessibleName(/⌘I/);
  });

  test("toolbar is labelled and has role=toolbar", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: /formatting/i });
    expect(toolbar.tagName.toLowerCase()).toBe("markdown-toolbar");
  });

  test("toolbar's for= matches a real textarea id (the library targets that field)", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: /formatting/i });
    const targetId = toolbar.getAttribute("for");
    expect(targetId).toBeTruthy();
    expect(document.getElementById(targetId as string)?.tagName.toLowerCase()).toBe("textarea");
  });

  test("first button has tabindex=0, others tabindex=-1 (roving-tabindex init)", () => {
    render(<Harness />);
    const bold = screen.getByRole("button", { name: /bold/i });
    const italic = screen.getByRole("button", { name: /italic/i });
    const bullet = screen.getByRole("button", { name: /bullet list/i });
    const numbered = screen.getByRole("button", { name: /numbered list/i });
    expect(bold).toHaveAttribute("tabindex", "0");
    expect(italic).toHaveAttribute("tabindex", "-1");
    expect(bullet).toHaveAttribute("tabindex", "-1");
    expect(numbered).toHaveAttribute("tabindex", "-1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npm test -- MarkdownToolbar`
Expected: FAIL — module not found (`./MarkdownToolbar`).

- [ ] **Step 3: Create the CSS module.**

```css
/* src/cards/MarkdownToolbar.module.css */
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

These tokens already exist in `src/index.css` (verified against `IconButton.module.css`, which uses the same set). No new tokens.

- [ ] **Step 4: Create the component.**

```tsx
// src/cards/MarkdownToolbar.tsx
import "@github/markdown-toolbar-element";
import type { RefObject } from "react";
import { BoldIcon } from "../lib/ui/icons/BoldIcon";
import { BulletListIcon } from "../lib/ui/icons/BulletListIcon";
import { ItalicIcon } from "../lib/ui/icons/ItalicIcon";
import { NumberedListIcon } from "../lib/ui/icons/NumberedListIcon";
import styles from "./MarkdownToolbar.module.css";

type Props = {
  htmlFor: string;
  boldRef?: RefObject<HTMLElement | null>;
  italicRef?: RefObject<HTMLElement | null>;
};

export function MarkdownToolbar({ htmlFor, boldRef, italicRef }: Props) {
  return (
    <markdown-toolbar
      for={htmlFor}
      role="toolbar"
      aria-label="Formatting"
      className={styles.toolbar}
    >
      <md-bold
        ref={boldRef}
        tabIndex={0}
        className={styles.button}
        aria-label="Bold (⌘B)"
      >
        <BoldIcon />
      </md-bold>
      <md-italic
        ref={italicRef}
        tabIndex={-1}
        className={styles.button}
        aria-label="Italic (⌘I)"
      >
        <ItalicIcon />
      </md-italic>
      <md-unordered-list
        tabIndex={-1}
        className={styles.button}
        aria-label="Bullet list"
      >
        <BulletListIcon />
      </md-unordered-list>
      <md-ordered-list
        tabIndex={-1}
        className={styles.button}
        aria-label="Numbered list"
      >
        <NumberedListIcon />
      </md-ordered-list>
    </markdown-toolbar>
  );
}
```

Notes for the implementer:
- `import "@github/markdown-toolbar-element"` is a side-effect import; it registers the custom elements on the global `customElements` registry. Importing it once anywhere in the app is enough, but co-locating the import with the only consumer keeps the dependency surface explicit.
- Each `BoldIcon` / `ItalicIcon` / etc. already sets `aria-hidden="true"` internally (see existing `PencilIcon`), so we don't repeat it at the call site.
- `<md-bold>` and friends register themselves with `role="button"`. Do **not** wrap them with a real `<button>` — that produces nested interactives (an a11y violation) and `<md-bold>` already exposes the right semantics on its own.
- `tabIndex={0}` on the first button, `tabIndex={-1}` on the others — without these, the library's roving-tabindex behavior never gets a starting point and the toolbar is unreachable by keyboard.

- [ ] **Step 5: Run the tests; verify they pass.**

Run: `npm test -- MarkdownToolbar`
Expected: PASS — all five tests green.

- [ ] **Step 6: Lint and typecheck.**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/cards/MarkdownToolbar.tsx src/cards/MarkdownToolbar.module.css \
        src/cards/MarkdownToolbar.test.tsx
git commit -m "feat(cards): MarkdownToolbar component"
```

---

## Task 6: Wire `MarkdownToolbar` into `CardEditor` with `Cmd+B/I` shortcuts (TDD)

**Files:**
- Modify: `src/cards/CardEditor.tsx`
- Modify: `src/cards/CardEditor.test.tsx`

### Test-first: extend `CardEditor.test.tsx`

The existing tests (`Type, Name, and Icon controls share a row container`, etc.) keep passing. New tests cover the keyboard handler and toolbar presence in the editor.

- [ ] **Step 1: Add new tests to `src/cards/CardEditor.test.tsx`.**

Add this block inside the existing `describe("<CardEditor>", () => { ... })` (alongside the other tests, before the closing `})`):

```tsx
  test("renders the markdown toolbar above the body field", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const toolbar = screen.getByRole("toolbar", { name: /formatting/i });
    const body = screen.getByLabelText(/body/i);

    // Toolbar's for= attribute targets the body textarea.
    expect(toolbar.getAttribute("for")).toBe(body.getAttribute("id"));
  });

  test("Cmd+B on the body textarea clicks the Bold toolbar button", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const bold = screen.getByRole("button", { name: /bold/i });
    const clickSpy = vi.spyOn(bold, "click");

    body.focus();
    await userEvent.keyboard("{Meta>}b{/Meta}");

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("Ctrl+B on the body textarea clicks the Bold toolbar button (non-mac)", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const bold = screen.getByRole("button", { name: /bold/i });
    const clickSpy = vi.spyOn(bold, "click");

    body.focus();
    await userEvent.keyboard("{Control>}b{/Control}");

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("Cmd+I on the body textarea clicks the Italic toolbar button", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const italic = screen.getByRole("button", { name: /italic/i });
    const clickSpy = vi.spyOn(italic, "click");

    body.focus();
    await userEvent.keyboard("{Meta>}i{/Meta}");

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("Cmd+Shift+B does not trigger Bold (modifier guard)", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const bold = screen.getByRole("button", { name: /bold/i });
    const clickSpy = vi.spyOn(bold, "click");

    body.focus();
    await userEvent.keyboard("{Meta>}{Shift>}b{/Shift}{/Meta}");

    expect(clickSpy).not.toHaveBeenCalled();
  });

  test("Cmd+B on the body textarea calls preventDefault", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    body.focus();

    // Use a raw KeyboardEvent so we can inspect defaultPrevented after dispatch.
    const event = new KeyboardEvent("keydown", {
      key: "b",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
```

The `userEvent.keyboard` `{Meta>}…{/Meta}` syntax sets `metaKey` on the dispatched events. `userEvent`'s click spy on the toolbar button proves the keyboard handler reached the right ref; the integration with the library itself is covered by Playwright in Task 7.

- [ ] **Step 2: Run the new tests; verify they fail.**

Run: `npm test -- CardEditor`
Expected: FAIL — `screen.getByRole("toolbar", …)` not found, plus the Cmd+B tests fail because the handler doesn't exist yet.

- [ ] **Step 3: Wire up `CardEditor.tsx`.**

Apply these edits to `src/cards/CardEditor.tsx`:

**Imports** — add `useRef` to the existing `react` import and add the `MarkdownToolbar` import:

```tsx
import { type ChangeEvent, type KeyboardEvent, useId, useRef } from "react";
```

```tsx
import { MarkdownToolbar } from "./MarkdownToolbar";
```

**Inside `CardEditor`**, after the existing `idBase`/`ids` block, add:

```tsx
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const boldRef = useRef<HTMLElement>(null);
  const italicRef = useRef<HTMLElement>(null);

  const onBodyKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
```

**Replace the existing body `<label>`** (currently around lines 125–145, the block starting `<label className={styles.field} htmlFor={ids.body}>`) with:

```tsx
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
        <span id={ids.bodyHelp} className={styles.help}>
          Supports{" "}
          <Link
            href="https://www.markdownguide.org/cheat-sheet/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Markdown
          </Link>{" "}
          — bold, italic, lists, tables.
        </span>
      </label>
```

The only differences from the existing block: `<MarkdownToolbar>` inserted between the label `<span>` and the `<Textarea>`, plus `ref={bodyRef}` and `onKeyDown={onBodyKeyDown}` on the `<Textarea>`. The help text is unchanged.

- [ ] **Step 4: Run all CardEditor tests.**

Run: `npm test -- CardEditor`
Expected: PASS — both the new tests and the existing tests (including `"Type, Name, and Icon controls share a row container"`) all green.

- [ ] **Step 5: Sanity-check the broader suite.**

Run: `npm test`
Expected: PASS — full unit suite green.

- [ ] **Step 6: Lint and typecheck.**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Manual smoke test in the dev server.**

Run `npm run dev`, open a card editor, and verify:
- The toolbar row appears above the body textarea, aligned with its left edge.
- Hover over each button shows the focus/hover state from the CSS.
- `Cmd+B` (or `Ctrl+B` on non-mac) with text selected wraps it in `**…**`.
- `Cmd+I` wraps it in `_…_`.
- Clicking each button does not steal focus from the textarea.
- Browser-native `Cmd+Z` undoes a single toolbar action in one keystroke.

If any of these fail, fix before committing. (Visual nits like icon size, gap, or button color can be tuned now — this is the "tune against the existing editor visuals" beat from the spec.)

- [ ] **Step 8: Commit.**

```bash
git add src/cards/CardEditor.tsx src/cards/CardEditor.test.tsx
git commit -m "feat(cards): wire markdown toolbar + Cmd/Ctrl+B/I into CardEditor"
```

---

## Task 7: Playwright behavior coverage

**Files:**
- Create: `e2e/editor-markdown.spec.ts`

This is the only place we exercise `document.execCommand` for real. The existing pattern (`e2e/editor-pagination.spec.ts`) shows how to stand up a deck with `seedDeck` and navigate to the editor route.

- [ ] **Step 1: Create the spec file.**

```ts
// e2e/editor-markdown.spec.ts
import { expect, test } from "@playwright/test";
import { seedDeck, TEST_DECK_ID } from "./fixtures";

const cardId = "00000000-0000-4000-8000-200000000001";

test.beforeEach(async ({ page }) => {
  await seedDeck(page, [
    {
      id: cardId,
      name: "Markdown Test Item",
      body: "",
      headerTags: ["Wondrous item"],
      footerTags: [],
    },
  ]);
  await page.goto(`/deck/${TEST_DECK_ID}/edit/${cardId}`);
});

test("toolbar Bold wraps and unwraps the selection", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("hello world");

  // Select "hello".
  await body.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(0, "hello".length);
  });

  await page.getByRole("button", { name: /bold/i }).click();
  await expect(body).toHaveValue("**hello** world");

  // Re-select "hello" (now inside the **…** wrapper, offsets shifted by 2).
  await body.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(2, 2 + "hello".length);
  });
  await page.getByRole("button", { name: /bold/i }).click();
  await expect(body).toHaveValue("hello world");
});

test("Cmd/Meta+B wraps the selection in bold", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("abc");
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 3));

  await body.focus();
  await page.keyboard.press("Meta+b");

  await expect(body).toHaveValue("**abc**");
});

test("Cmd/Meta+I wraps the selection in italics", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("abc");
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 3));

  await body.focus();
  await page.keyboard.press("Meta+i");

  // The library uses `_` for italics by default.
  await expect(body).toHaveValue("_abc_");
});

test("Bullet list toggles a `- ` prefix on each selected line", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("one\ntwo\nthree");
  await body.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(0, el.value.length),
  );

  await page.getByRole("button", { name: /bullet list/i }).click();
  await expect(body).toHaveValue("- one\n- two\n- three");

  // Re-select the whole value (its length grew by 6) and toggle off.
  await body.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(0, el.value.length),
  );
  await page.getByRole("button", { name: /bullet list/i }).click();
  await expect(body).toHaveValue("one\ntwo\nthree");
});

test("Numbered list toggles `1. `/`2. `/`3. ` prefixes on selected lines", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("one\ntwo\nthree");
  await body.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(0, el.value.length),
  );

  await page.getByRole("button", { name: /numbered list/i }).click();
  await expect(body).toHaveValue("1. one\n2. two\n3. three");
});

test("undo collapses a toolbar action into a single Cmd+Z", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("hello world");
  await body.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange("hello ".length, "hello ".length + "world".length),
  );

  await page.getByRole("button", { name: /bold/i }).click();
  await expect(body).toHaveValue("hello **world**");

  await body.focus();
  await page.keyboard.press("Meta+z");
  await expect(body).toHaveValue("hello world");

  // One more undo begins peeling the typed text.
  await page.keyboard.press("Meta+z");
  await expect(body).not.toHaveValue("hello world");
});

test("clicking a toolbar button keeps focus on the textarea", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("abc");
  await body.focus();

  await page.getByRole("button", { name: /bold/i }).click();

  const focused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
  expect(focused).toBe("textarea");
});
```

A few things worth knowing:
- `seedDeck` from `e2e/fixtures.ts` mocks the Supabase REST routes, sets a fake auth session in `localStorage`, and accepts `id` on each item — using a stable `id` here lets us address the editor route directly via `/deck/${TEST_DECK_ID}/edit/${cardId}`.
- `seedDeck` mocks reads only. These tests never hit a write path: every assertion uses the textarea's local React state via `toHaveValue(...)`, never an API write. The fixture would throw if a write was attempted, which is the correct guardrail.
- `page.keyboard.press("Meta+b")` issues the modifier; on the project's existing Playwright config (default Chromium), Meta is the right key to test. Adding Control coverage is overkill for e2e — the unit test in Task 6 already proves the handler accepts both.
- The library uses `**…**` for bold and `_…_` for italics by default (these defaults come straight from the published web component; verify the italic value during implementation if needed and adjust if the library's output differs).

- [ ] **Step 2: Run the e2e suite.**

Run: `npm run test:e2e -- editor-markdown`
Expected: PASS — all seven tests green. If italic output differs from `_abc_`, replace the expected value with whatever the library actually emits — assert on real behavior, not a guess.

- [ ] **Step 3: Run the full e2e suite to confirm nothing else regressed.**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add e2e/editor-markdown.spec.ts
git commit -m "test(e2e): markdown toolbar formatting + Cmd-B/I shortcuts"
```

---

## Wrap-up checklist

After Task 7 completes, the worktree should contain seven commits, in order:

1. `chore(deps): add @github/markdown-toolbar-element`
2. `feat(types): JSX intrinsics for @github/markdown-toolbar-element`
3. `refactor(ui): forward ref on Textarea`
4. `feat(ui): bold/italic/list icons for markdown toolbar`
5. `feat(cards): MarkdownToolbar component`
6. `feat(cards): wire markdown toolbar + Cmd/Ctrl+B/I into CardEditor`
7. `test(e2e): markdown toolbar formatting + Cmd-B/I shortcuts`

Run a final `npm run lint && npm run typecheck && npm test && npm run test:e2e` before declaring done. The PR description should link to the spec at `docs/superpowers/specs/2026-05-08-markdown-editor-toolbar-design.md`.

---

## Out of scope (do not implement)

Same as the spec — re-stated here so the implementer doesn't drift:

- `Cmd+Shift+8` / `Cmd+Shift+7` list shortcuts.
- Active-state highlighting on toolbar buttons (e.g., Bold lights up when the caret is inside `**…**`).
- Buttons for link, image, code, header, quote, task list, mention, ref. The library supports them; we don't render them.
- Live preview, WYSIWYG, or any rich-text model.
- A general-purpose `MarkdownEditor` primitive in `src/lib/ui/`.
