# Markdown Card Bodies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `card.body` as markdown (bold, italic, inline code, paragraphs, bullet/numbered lists, GFM tables) with sanitized output and preserved cross-card pagination. Editor stays plain `<textarea>`.

**Architecture:** A single `renderBody(text)` helper runs `marked` then `DOMPurify` with a strict allowlist; both `Card.tsx` and the offscreen `measurer.ts` inject the result identically. The paginator becomes block-aware: it greedy-fits top-level markdown blocks (paragraphs, lists, tables) onto each physical card, falling back to word-fit inside an oversized paragraph and to item-fit inside an oversized list. Tables stay atomic.

**Tech Stack:** `marked` (markdown→HTML), `dompurify` (sanitize), Vitest + jsdom + React Testing Library (existing), Biome (existing).

**Spec:** [`docs/superpowers/specs/2026-05-05-markdown-card-bodies-design.md`](../specs/2026-05-05-markdown-card-bodies-design.md)

**Branch:** `feat/markdown-card-bodies` (already created off `main`)

## File map

- **Create**
  - `src/cards/renderBody.ts` — markdown → sanitized HTML helper. Single source of truth for both `Card` and `measurer`.
  - `src/cards/renderBody.test.ts` — unit tests for the helper, including sanitization.
- **Modify**
  - `src/cards/Card.tsx` — replace `splitParagraphs(...).map(<p>)` with `dangerouslySetInnerHTML`.
  - `src/cards/Card.module.css` — add styles for `ul`, `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `strong`, `em`, `code` inside `.body`. Reset top/bottom margin on `.body`'s first/last child.
  - `src/cards/Card.test.tsx` — add markdown rendering assertions (existing tests should still pass).
  - `src/cards/measurer.ts` — `setBodyContent` switches from manual `<p>` building to `el.innerHTML = renderBody(text)`.
  - `src/cards/measurer.test.ts` — extend with a markdown-table case; existing paragraph-split test still passes.
  - `src/cards/paginate.ts` — block-aware algorithm with paragraph word-fit and list item-fit fallbacks.
  - `src/cards/paginate.test.ts` — add multi-block, list-split, ordered-list-numbering, and nested-list cases.
  - `package.json` / `package-lock.json` — add `marked`, `dompurify`, `@types/dompurify`.

---

## Task 1: Add markdown + sanitizer dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

This task requires user approval (per project convention: ask before `npm install`). The agent must surface the install command and wait for confirmation before running it.

- [ ] **Step 1: Confirm with user before installing**

Surface this prompt to the user verbatim:

> "Ready to install three packages: `marked` (~20kb gzipped, MIT), `dompurify` (~20kb gzipped, MPL/Apache), and `@types/dompurify` (dev). OK to run `npm install`?"

Wait for explicit approval.

- [ ] **Step 2: Install runtime deps**

Run: `npm install marked dompurify`
Expected: exit code 0; `package.json` `dependencies` now lists `marked` and `dompurify`.

- [ ] **Step 3: Install dev type defs**

Run: `npm install --save-dev @types/dompurify`
Expected: exit code 0; `package.json` `devDependencies` lists `@types/dompurify`.

(Note: `marked` ships its own types — no `@types/marked` needed.)

- [ ] **Step 4: Verify the project still builds and tests cleanly**

Run: `npm run typecheck && npm test`
Expected: typecheck passes, all existing tests pass. No new code yet, so this is a safety check that the install didn't disturb anything.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add marked + dompurify for markdown card bodies"
```

---

## Task 2: `renderBody` helper with sanitization (TDD)

**Files:**
- Create: `src/cards/renderBody.ts`
- Create: `src/cards/renderBody.test.ts`

The helper takes a markdown string and returns a sanitized HTML string. This is the only place markdown is parsed — both `Card` and `measurer` will call it.

- [ ] **Step 1: Write the failing test file**

Create `src/cards/renderBody.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { renderBody } from "./renderBody";

describe("renderBody", () => {
  test("wraps a single paragraph in <p>", () => {
    expect(renderBody("hello world").trim()).toBe("<p>hello world</p>");
  });

  test("splits paragraphs on blank lines", () => {
    const html = renderBody("one\n\ntwo");
    expect(html).toContain("<p>one</p>");
    expect(html).toContain("<p>two</p>");
  });

  test("renders bold and italic", () => {
    const html = renderBody("**bold** and _italic_");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("renders inline code", () => {
    expect(renderBody("use `const`")).toContain("<code>const</code>");
  });

  test("renders bullet lists", () => {
    const html = renderBody("- alpha\n- beta");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>alpha</li>");
    expect(html).toContain("<li>beta</li>");
  });

  test("renders ordered lists with preserved numbering via start attribute", () => {
    const html = renderBody("4. four\n5. five");
    expect(html).toContain('<ol start="4">');
    expect(html).toContain("<li>four</li>");
  });

  test("renders GFM tables", () => {
    const html = renderBody("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  test("strips <script> tags", () => {
    expect(renderBody("hi <script>alert(1)</script> there")).not.toContain("<script>");
  });

  test("strips javascript: URLs (links not in allowlist anyway)", () => {
    const html = renderBody("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });

  test("strips raw HTML elements not on the allowlist", () => {
    const html = renderBody("<iframe src='x'></iframe>");
    expect(html).not.toContain("<iframe");
  });

  test("preserves allowlisted tags", () => {
    const html = renderBody("**a** _b_ `c`");
    expect(html).toMatch(/<strong>.*<\/strong>/);
    expect(html).toMatch(/<em>.*<\/em>/);
    expect(html).toMatch(/<code>.*<\/code>/);
  });

  test("returns empty string for empty input", () => {
    expect(renderBody("")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npm test -- src/cards/renderBody.test.ts`
Expected: FAIL — module not found / `renderBody` is not a function.

- [ ] **Step 3: Implement the helper**

Create `src/cards/renderBody.ts`:

```ts
import DOMPurify from "dompurify";
import { marked } from "marked";

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "code",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "br",
];

const ALLOWED_ATTR = ["start"];

export function renderBody(text: string): string {
  if (text === "") return "";
  const html = marked.parse(text, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/cards/renderBody.test.ts`
Expected: all 11 tests pass.

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/cards/renderBody.ts src/cards/renderBody.test.ts
git commit -m "feat(cards): add renderBody helper (marked + DOMPurify)"
```

---

## Task 3: Render markdown in `Card.tsx`

**Files:**
- Modify: `src/cards/Card.tsx`
- Modify: `src/cards/Card.test.tsx`

Replace the paragraph-splitting renderer in `Card.tsx` with a single `dangerouslySetInnerHTML` block fed by `renderBody`. Existing tests that assert paragraph splitting still pass because `marked` produces the same `<p>`-per-paragraph DOM for plain prose.

- [ ] **Step 1: Add a failing markdown-rendering test**

In `src/cards/Card.test.tsx`, append a new `describe` block at the bottom (above the `<Card> with title autofit` block, or as a sibling):

```tsx
describe("<Card> with markdown body", () => {
  test("renders bold and italic", () => {
    const card = itemCardFactory.build({ body: "**Curse**. _italic_ text." });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByText("Curse")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByText("italic")).toHaveProperty("tagName", "EM");
  });

  test("renders bullet lists", () => {
    const card = itemCardFactory.build({ body: "- alpha\n- beta" });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("renders GFM tables", () => {
    const card = itemCardFactory.build({
      body: "| a | b |\n|---|---|\n| 1 | 2 |",
    });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- src/cards/Card.test.tsx`
Expected: the three new tests fail (current renderer outputs literal `**`, `_`, `|` inside `<p>` tags).

- [ ] **Step 3: Replace paragraph rendering with markdown injection**

Edit `src/cards/Card.tsx`:

1. Add the import at the top with the other imports:

```tsx
import { renderBody } from "./renderBody";
```

2. Remove the `splitParagraphs` helper at the top of the file (the `const splitParagraphs = ...` declaration).

3. Replace the body-rendering JSX:

```tsx
<div className={styles.body} data-role="card-body">
  {splitParagraphs(bodyText).map((p) => (
    <p key={p}>{p}</p>
  ))}
</div>
```

with:

```tsx
<div
  className={styles.body}
  data-role="card-body"
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify in renderBody
  dangerouslySetInnerHTML={{ __html: renderBody(bodyText) }}
/>
```

- [ ] **Step 4: Run all card tests to verify the new tests pass and old ones still pass**

Run: `npm test -- src/cards/Card.test.tsx`
Expected: all tests pass, including the existing paragraph-split test (`splits body on blank lines into paragraphs`) — `marked` still emits one `<p>` per paragraph.

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass. (If Biome flags the `noDangerouslySetInnerHtml` rule, the inline ignore comment above suppresses it.)

- [ ] **Step 6: Commit**

```bash
git add src/cards/Card.tsx src/cards/Card.test.tsx
git commit -m "feat(cards): render Card body as sanitized markdown"
```

---

## Task 4: Style markdown elements in `Card.module.css`

**Files:**
- Modify: `src/cards/Card.module.css`

Add typography rules for the new block/inline elements, all using `--print-*` tokens. CSS isn't unit-tested; visual confirmation lives in Task 8's manual smoke pass.

- [ ] **Step 1: Add the new rules**

In `src/cards/Card.module.css`, **delete** these existing rules (they'll be replaced by the broader `.body > :first/last-child` reset plus the new typography section):

```css
.body p {
  margin: 0 0 0.5em;
}

.body p:last-child {
  margin-bottom: 0;
}
```

Then **append** the following block at the end of the file:

```css
.body > :first-child {
  margin-top: 0;
}

.body > :last-child {
  margin-bottom: 0;
}

.body p {
  margin: 0 0 0.5em;
}

.body ul,
.body ol {
  margin: 0 0 0.5em;
  padding-left: 1.25em;
}

.body li {
  margin: 0 0 0.15em;
}

.body li:last-child {
  margin-bottom: 0;
}

.body strong {
  font-weight: 700;
}

.body em {
  font-style: italic;
}

.body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}

.body table {
  border-collapse: collapse;
  width: 100%;
  margin: 0 0 0.5em;
  font-size: 0.92em;
}

.body th,
.body td {
  border: 1px solid var(--print-color-border);
  padding: 0.15em 0.35em;
  text-align: left;
}

.body th {
  font-weight: 600;
}
```

- [ ] **Step 2: Run all tests to make sure CSS module class hashes didn't break anything**

Run: `npm test`
Expected: all pass.

- [ ] **Step 3: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/cards/Card.module.css
git commit -m "feat(cards): style markdown lists, tables, and emphasis on cards"
```

---

## Task 5: Render markdown in the offscreen `measurer.ts`

**Files:**
- Modify: `src/cards/measurer.ts`
- Modify: `src/cards/measurer.test.ts`

The offscreen measurer must produce identical body DOM to `Card`, otherwise pagination over-/under-counts. Switching `setBodyContent` to use `renderBody` guarantees parity by construction.

- [ ] **Step 1: Add a failing test for markdown rendering in the measurer**

In `src/cards/measurer.test.ts`, append inside the `describe("measurer", ...)` block:

```ts
test("renders bold/italic markdown into the body slot", () => {
  const measurer = getMeasurer(4);
  const card = itemCardFactory.build();
  measurer.measureFirst(card, "**bold** and _italic_");

  const bodyEl = document.querySelector<HTMLElement>(
    '[data-shape="first"] [data-slot="body"]',
  );
  expect(bodyEl?.querySelector("strong")?.textContent).toBe("bold");
  expect(bodyEl?.querySelector("em")?.textContent).toBe("italic");
});

test("renders GFM tables into the body slot", () => {
  const measurer = getMeasurer(4);
  const card = itemCardFactory.build();
  measurer.measureFirst(card, "| a | b |\n|---|---|\n| 1 | 2 |");

  const bodyEl = document.querySelector<HTMLElement>(
    '[data-shape="first"] [data-slot="body"]',
  );
  expect(bodyEl?.querySelector("table")).not.toBeNull();
  expect(bodyEl?.querySelector("th")?.textContent).toBe("a");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/cards/measurer.test.ts`
Expected: the two new tests fail (the manual `<p>` builder treats markdown as literal text).

- [ ] **Step 3: Replace the manual paragraph-builder with `renderBody`**

In `src/cards/measurer.ts`:

1. Add the import at the top with the existing imports:

```ts
import { renderBody } from "./renderBody";
```

2. Replace the existing `setBodyContent` helper:

```ts
const setBodyContent = (el: HTMLElement, text: string) => {
  el.replaceChildren(
    ...text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const node = document.createElement("p");
        node.textContent = p;
        return node;
      }),
  );
};
```

with:

```ts
const setBodyContent = (el: HTMLElement, text: string) => {
  el.innerHTML = renderBody(text);
};
```

- [ ] **Step 4: Run all measurer tests**

Run: `npm test -- src/cards/measurer.test.ts`
Expected: all tests pass, including the existing `body chunk splits into <p> elements on blank-line paragraph breaks` test (markdown still produces one `<p>` per paragraph).

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/cards/measurer.ts src/cards/measurer.test.ts
git commit -m "feat(cards): use renderBody in offscreen measurer"
```

---

## Task 6: Block-aware pagination (paragraphs split, lists/tables atomic)

**Files:**
- Modify: `src/cards/paginate.ts`
- Modify: `src/cards/paginate.test.ts`

The current paginator does word-boundary fitting on the raw body string. With markdown, that can cut inside `**bold**` or across a table row. Restructure into:

1. Split the body into top-level blocks on blank-line boundaries; classify each as `paragraph`, `list`, or `table`.
2. Greedy-fit blocks (joined with `\n\n`) onto each physical card.
3. If even the first block alone doesn't fit, sub-paginate that block:
   - Paragraph → existing word-boundary fit (becomes the fallback).
   - List → atomic for now (Task 7 adds item-fit).
   - Table → atomic.

Existing tests use single-paragraph bodies, so the old behavior is preserved as the paragraph-fallback path.

- [ ] **Step 1: Add failing tests for the new behaviors**

Append to `src/cards/paginate.test.ts` (inside the existing `describe("paginateBody", ...)` block):

```ts
test("splits at block boundary before falling back to word-fit", () => {
  // Three paragraph blocks; budget fits exactly one block.
  expect(
    paginateBody({
      body: "alpha\n\nbeta\n\ngamma",
      measureFirst: fitsUpTo(5),
      measureContinuation: fitsUpTo(5),
    }),
  ).toEqual(["alpha", "beta", "gamma"]);
});

test("packs as many blocks as fit per card", () => {
  // Joined text "alpha\n\nbeta" length 11; "alpha\n\nbeta\n\ngamma" length 18.
  expect(
    paginateBody({
      body: "alpha\n\nbeta\n\ngamma",
      measureFirst: fitsUpTo(11),
      measureContinuation: fitsUpTo(11),
    }),
  ).toEqual(["alpha\n\nbeta", "gamma"]);
});

test("treats a list block as atomic when it cannot share a card", () => {
  // List block "- a\n- b\n- c" length 11; fits if measured alone, doesn't share with the paragraph.
  expect(
    paginateBody({
      body: "intro\n\n- a\n- b\n- c",
      measureFirst: fitsUpTo(11),
      measureContinuation: fitsUpTo(11),
    }),
  ).toEqual(["intro", "- a\n- b\n- c"]);
});

test("treats a table block as atomic and accepts overflow", () => {
  const table = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |";
  // Budget too small for the whole table, but it's atomic.
  const result = paginateBody({
    body: table,
    measureFirst: fitsUpTo(5),
    measureContinuation: fitsUpTo(5),
  });
  expect(result).toEqual([table]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/cards/paginate.test.ts`
Expected: the four new tests fail. Existing tests should still pass at this point — they will continue to pass after the refactor.

- [ ] **Step 3: Replace `paginate.ts` with the block-aware implementation**

Replace the entire contents of `src/cards/paginate.ts` with:

```ts
export type PaginateMeasurer = (prefix: string) => boolean;

type BlockKind = "paragraph" | "list" | "table";
type Block = { kind: BlockKind; text: string };

const BLANK_LINE = /\n\s*\n/;
const TABLE_LINE = /^\s*\|/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;

function classify(text: string): BlockKind {
  const firstLine = text.split("\n", 1)[0] ?? "";
  if (TABLE_LINE.test(firstLine)) return "table";
  if (LIST_ITEM.test(firstLine)) return "list";
  return "paragraph";
}

export function splitTopLevelBlocks(body: string): Block[] {
  return body
    .split(BLANK_LINE)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ kind: classify(text), text }));
}

export function paginateBody(opts: {
  body: string;
  measureFirst: PaginateMeasurer;
  measureContinuation: PaginateMeasurer;
}): string[] {
  const { body, measureFirst, measureContinuation } = opts;

  if (body === "") return [""];
  if (measureFirst(body)) return [body];

  const blocks = splitTopLevelBlocks(body);
  if (blocks.length === 0) {
    // All-whitespace body: degrade to character fallback over the raw string
    // so we make forward progress (matches pre-refactor behavior).
    return [characterFit(body, measureFirst)];
  }

  const chunks: string[] = [];
  let remaining = blocks;
  let measure = measureFirst;

  while (remaining.length > 0) {
    const fittedCount = greedyFitBlocks(remaining, measure);
    if (fittedCount > 0) {
      chunks.push(joinBlocks(remaining.slice(0, fittedCount)));
      remaining = remaining.slice(fittedCount);
    } else {
      // Even the first block alone doesn't fit — sub-paginate it.
      const head = remaining[0];
      if (!head) break;
      const { fitted, rest } = subPaginateBlock(head, measure);
      chunks.push(fitted);
      remaining = rest === "" ? remaining.slice(1) : [{ kind: head.kind, text: rest }, ...remaining.slice(1)];
    }
    measure = measureContinuation;
  }

  return chunks;
}

function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.text).join("\n\n");
}

function greedyFitBlocks(blocks: Block[], measure: PaginateMeasurer): number {
  // Largest n in [1, blocks.length] whose joined text passes measure.
  let lo = 1;
  let hi = blocks.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(joinBlocks(blocks.slice(0, mid)))) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function subPaginateBlock(
  block: Block,
  measure: PaginateMeasurer,
): { fitted: string; rest: string } {
  if (block.kind === "paragraph") {
    const fitted = greedyFit(block.text, measure);
    const rest = block.text.slice(fitted.length).replace(/^\s+/, "");
    return { fitted, rest };
  }
  // list / table: atomic — emit the whole block and accept overflow.
  return { fitted: block.text, rest: "" };
}

function greedyFit(text: string, measure: PaginateMeasurer): string {
  const wordEnds = wordEndIndices(text);
  if (wordEnds.length === 0) return characterFit(text, measure);

  let lo = 0;
  let hi = wordEnds.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(text.slice(0, wordEnds[mid]))) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === -1) return characterFit(text, measure);
  return text.slice(0, wordEnds[best]);
}

function wordEndIndices(text: string): number[] {
  const ends: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(text)) !== null) {
    ends.push(m.index + m[0].length);
  }
  return ends;
}

function characterFit(text: string, measure: PaginateMeasurer): string {
  let lo = 0;
  let hi = text.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(text.slice(0, mid))) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, Math.max(best, 1));
}
```

Note the public function signature is unchanged — callers (`expandCard.ts`) need no edits.

- [ ] **Step 4: Run all paginate tests**

Run: `npm test -- src/cards/paginate.test.ts`
Expected: all tests pass — the four new ones plus all existing single-paragraph tests (they exercise the paragraph-fallback word-fit path, identical behavior to before).

- [ ] **Step 5: Run the full test suite to catch downstream effects**

Run: `npm test`
Expected: all pass. `expandCard.test.ts` and `useExpandedCards.test.tsx` use `paginateBody` indirectly and should be unaffected.

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/cards/paginate.ts src/cards/paginate.test.ts
git commit -m "feat(cards): block-aware pagination for markdown bodies"
```

---

## Task 7: List-item splitting fallback

**Files:**
- Modify: `src/cards/paginate.ts`
- Modify: `src/cards/paginate.test.ts`

Adds a sub-paginator for list blocks that don't fit on a single card. Splits at top-level item boundaries, keeping nested items glued to their parent. Each chunk is still valid markdown; ordered-list numbers in the source are preserved across chunks (`marked` reads the leading number to set the continuation list's `start`, which is allowlisted in `renderBody`).

- [ ] **Step 1: Add failing tests for list splitting**

Append to `src/cards/paginate.test.ts`:

```ts
test("splits a too-tall list at item boundaries", () => {
  // Five items, ~6 chars each ("- alpha"=7, "- beta"=6, ...). Budget 14 fits ~2 items per card.
  const body = "- alpha\n- beta\n- gamma\n- delta\n- eps";
  const result = paginateBody({
    body,
    measureFirst: fitsUpTo(14),
    measureContinuation: fitsUpTo(14),
  });
  // Each chunk must start at an item boundary and contain only whole items.
  for (const chunk of result) {
    expect(chunk.startsWith("- ") || chunk.startsWith("* ") || /^\d+\.\s/.test(chunk)).toBe(true);
  }
  expect(result.join("\n")).toBe(body);
});

test("preserves ordered-list numbering across a split", () => {
  // 1.-5. items; budget forces a split partway through.
  const body = "1. one\n2. two\n3. three\n4. four\n5. five";
  const result = paginateBody({
    body,
    measureFirst: fitsUpTo(14),
    measureContinuation: fitsUpTo(40),
  });
  // First chunk starts at "1.", continuation chunk starts at the next un-fit number ("3." here, given the budget).
  expect(result[0]?.startsWith("1.")).toBe(true);
  expect(result.length).toBeGreaterThan(1);
  const second = result[1] ?? "";
  expect(/^\d+\.\s/.test(second)).toBe(true);
  // Numbers in source are preserved (we don't re-emit from 1).
  expect(second).toMatch(/^[2-9]\./);
});

test("does not split between a parent item and its nested children", () => {
  // Item 1 has a nested bullet that must travel with it.
  const body = "- parent one\n  - nested\n- parent two\n- parent three";
  const result = paginateBody({
    body,
    measureFirst: fitsUpTo(25),
    measureContinuation: fitsUpTo(25),
  });
  // Reconstruction (joined with \n) must equal the original.
  expect(result.join("\n")).toBe(body);
  // The nested line must appear in the same chunk as its parent.
  const chunkWithParent = result.find((c) => c.includes("parent one"));
  expect(chunkWithParent).toBeDefined();
  expect(chunkWithParent).toContain("nested");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/cards/paginate.test.ts`
Expected: the three new list tests fail (lists are still atomic from Task 6 — the whole list is emitted as a single chunk that may overflow).

- [ ] **Step 3: Implement list-item sub-pagination**

In `src/cards/paginate.ts`, replace the `subPaginateBlock` function with:

```ts
function subPaginateBlock(
  block: Block,
  measure: PaginateMeasurer,
): { fitted: string; rest: string } {
  if (block.kind === "paragraph") {
    const fitted = greedyFit(block.text, measure);
    const rest = block.text.slice(fitted.length).replace(/^\s+/, "");
    return { fitted, rest };
  }
  if (block.kind === "list") {
    return splitListAtItem(block.text, measure);
  }
  // table: atomic.
  return { fitted: block.text, rest: "" };
}
```

Then add these two new helpers at the bottom of the file (after `characterFit`):

```ts
function splitListAtItem(
  text: string,
  measure: PaginateMeasurer,
): { fitted: string; rest: string } {
  const itemStarts = topLevelItemStarts(text);
  // Single item (possibly with nested children) — atomic fallback.
  if (itemStarts.length <= 1) return { fitted: text, rest: "" };

  const cutAt = (k: number): number =>
    k >= itemStarts.length ? text.length : (itemStarts[k] ?? text.length);

  // Largest k in [1, itemStarts.length] whose prefix (items 0..k-1) fits.
  let lo = 1;
  let hi = itemStarts.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, cutAt(mid)).replace(/\n+$/, "");
    if (measure(candidate)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // If nothing fits, accept overflow of the first item alone (rare).
  const k = best === 0 ? 1 : best;
  const cut = cutAt(k);
  return {
    fitted: text.slice(0, cut).replace(/\n+$/, ""),
    rest: text.slice(cut).replace(/^\n+/, ""),
  };
}

function topLevelItemStarts(text: string): number[] {
  // Indices in `text` where a top-level list item begins.
  // A top-level item starts at the beginning of a line whose leading whitespace
  // matches the leading whitespace of the very first item.
  const lines = text.split("\n");
  if (lines.length === 0) return [];
  const firstMatch = LIST_ITEM.exec(lines[0] ?? "");
  if (!firstMatch) return [0];
  const baseIndent = (firstMatch[0].match(/^\s*/)?.[0] ?? "").length;

  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    const m = LIST_ITEM.exec(line);
    if (m) {
      const indent = (m[0].match(/^\s*/)?.[0] ?? "").length;
      if (indent === baseIndent) starts.push(offset);
    }
    offset += line.length + 1; // +1 for the consumed "\n"
  }
  return starts;
}
```

- [ ] **Step 4: Run all paginate tests**

Run: `npm test -- src/cards/paginate.test.ts`
Expected: all tests pass — the three new list tests plus everything from Task 6.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/cards/paginate.ts src/cards/paginate.test.ts
git commit -m "feat(cards): split oversized lists at item boundaries"
```

---

## Task 8: Final verification

**Files:** none (manual checks)

End-to-end smoke. The agent runs the full battery, then walks the user through a manual visual check before reporting done.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass, no skipped suites.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: production build succeeds.

- [ ] **Step 5: Manual smoke — surface to the user**

Tell the user:

> "All automated checks pass. Please run `npm run dev`, open the editor, and paste the body of an SRD item like *Bag of Holding*, *Armor of Resistance (Plate)*, or *Belt of Cloud Giant Strength* into the body field. Confirm:
> - Italics (`_plane shift_`) and bold (`**Curse**`) render correctly.
> - The damage-type table on *Armor of Resistance* renders as a real `<table>`.
> - The bullet list in *Belt of Dwarvenkind* renders as a real `<ul>`.
> - Long bodies still paginate across multiple cards in the print preview at `/print`.
> - Pre-existing plain-text cards look unchanged."

Wait for confirmation. If the user reports an issue, debug before merging.

- [ ] **Step 6: Branch is ready for PR**

After user confirms the smoke check, the branch `feat/markdown-card-bodies` is ready for code review / PR. Do not push or open the PR without explicit user instruction (per project conventions in `CLAUDE.md`).
