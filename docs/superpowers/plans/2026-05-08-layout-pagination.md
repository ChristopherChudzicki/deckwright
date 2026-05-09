# Layout-Driven Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace markdown-source-based pagination with DOM-layout-driven pagination so structural decisions and fit measurement use the same ground truth (rendered DOM). Each card body renders once into an offscreen card-body-width container; the paginator walks the DOM, enumerates break candidates (between block siblings, list items, table rows, line boxes), and slices into N HTML chunks that fit each card's body-height budget. This removes the source/render drift that lets `paginate.ts` misclassify rendered structures (e.g., a 2-col table that renders as `<dl>`) and naturally extends to any future renderable element without paginator changes.

**Architecture:** A new `layoutPaginator.ts` mounts the body's HTML inside a hidden, card-body-width container, recursively collects `BreakCandidate`s annotated with their `y`-offset and a `splitAt` descriptor (deepest splittable container + child index, or text-node + char offset for paragraph line boxes), and returns a list of HTML chunk strings. The measurer (`measurer.ts`) is reduced to two responsibilities: expose the body slot's effective `width`/`firstHeight`/`continuationHeight` and own the offscreen mount point. `Card.tsx` accepts a pre-rendered, pre-sanitized `bodyHtml` chunk and injects it directly; `card.body` (markdown) is still the storage source-of-truth and is rendered by `renderBody` whenever no chunk is provided. `expandCard.ts` and `useExpandedCards.ts` are rewired to the new measurer/paginator. The old source-regex paginator (`paginate.ts`) and its tests are deleted.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + RTL (jsdom env, no real CSS layout), Playwright (real browser layout, primary correctness oracle for this plan).

**Reference docs:**
- Existing pagination plan: `docs/superpowers/plans/2026-05-02-card-overflow-pagination.md`
- Card design system: `CLAUDE.md` § "Design system" + `README.md`

---

## Decisions already made (do not relitigate during execution)

1. **Chunk format**: HTML string. Always sanitized via DOMPurify before crossing module boundaries.
2. **`Card.tsx` API**: replace `bodyOverride?: string` (markdown) with `bodyHtml?: string` (pre-rendered HTML). When set, inject directly. Otherwise call `renderBody(card.body)`.
3. **2-col `<dl>` rendering work**: NOT included in this plan. That work lives intact on `worktree-dl-tables` and will be considered separately on its own merits, post-refactor.
4. **3+ col table header repetition**: Yes. When a `<table>` is split mid-rows, clone its `<thead>` onto the continuation chunk.
5. **Live editor preview**: Re-paginates on every body edit, but debounced via the existing `useDebouncedValue` (300 ms — match the existing editor pattern).
6. **paged.js**: Rejected (heavy, wrong shape — designed for full-document → paper, not single-body → N small cards on a sheet).
7. **Testing strategy**: Lean on Playwright for real-layout correctness (where chunks split, header repeat, editor debouncing). Unit tests cover pure logic only — DOM walks with mocked geometry, slicing algorithms — not "does this real content paginate to N cards."

---

## File map

**Create:**
- `src/cards/layoutPaginator.ts` — DOM-walking paginator: collect candidates, fit-search, slice
- `src/cards/layoutPaginator.test.ts` — unit tests (logic only, mocked geometry)
- `src/cards/breakCandidates.ts` — pure helper: walk a DOM subtree, return `BreakCandidate[]`
- `src/cards/breakCandidates.test.ts` — unit tests with handcrafted DOM + mocked rects
- `src/cards/sliceAt.ts` — pure helper: given a container + cut descriptor, return `{ firstHtml, restHtml }`. Handles header cloning for tables.
- `src/cards/sliceAt.test.ts` — unit tests for slicing edge cases
- `e2e/layout-pagination.spec.ts` — new e2e covering layout-driven behaviors (mid-paragraph line breaks, table row splits + thead repeat, editor debounce)

**Modify:**
- `src/cards/measurer.ts` — drop `measureFirst`/`measureContinuation` predicates; expose `getBodyDimensions(card)` returning `{ width, firstHeight, continuationHeight }` and a `mountForPagination(html)` helper that returns an offscreen container.
- `src/cards/measurer.test.ts` — rewrite for new shape (mock heights as today; assert dimensions surface, mount works)
- `src/cards/expandCard.ts` — use `layoutPaginator` instead of `paginateBody`, render markdown to HTML once via `renderBody`, return `bodyChunk: string` (HTML)
- `src/cards/expandCard.test.ts` — adjust assertions (chunks are HTML; verify HTML round-trip on simple cases)
- `src/cards/useExpandedCards.ts` — call new measurer; wrap pagination in `useDebouncedValue` for non-print contexts (gated by an opt-in arg so PrintView stays synchronous)
- `src/cards/useExpandedCards.test.tsx` — refresh hook smoke test
- `src/cards/Card.tsx` — `bodyOverride: string` → `bodyHtml?: string`. When set, inject; else fall through to `renderBody(card.body)`.
- `src/cards/Card.test.tsx` — rename test, switch fixtures to HTML strings
- `src/views/EditorView.tsx` — rename prop usage `bodyChunk` (still HTML)
- `src/views/PrintView.tsx` — same
- `e2e/editor-pagination.spec.ts` — refresh assertions if any depended on markdown-shaped chunks
- `e2e/print-pagination.spec.ts` — same
- `vitest.config.ts` — no change expected; flag if jsdom layout-stub teardown causes flakes
- `docs/superpowers/runbooks/*` — none expected

**Delete:**
- `src/cards/paginate.ts` — replaced by `layoutPaginator.ts`
- `src/cards/paginate.test.ts` — replaced by tests above

---

## Core types and contracts

```ts
// src/cards/breakCandidates.ts
export type SplitAt =
  | { kind: "between-children"; parent: Element; childIndex: number }
  | { kind: "between-line-boxes"; textNode: Text; charOffset: number };

export type BreakCandidate = {
  y: number;        // bottom edge of content above this break, relative to container top
  splitAt: SplitAt; // how to actually cut here
};

export function collectBreakCandidates(container: HTMLElement): BreakCandidate[];
```

```ts
// src/cards/sliceAt.ts
// Removes the first chunk from `container` (mutating) and returns it as serialized HTML.
// `splitAt` describes where to cut. For mid-table cuts, the resulting `restHtml` (left
// inside container) gets the original <thead> cloned in.
export function sliceFirstChunk(
  container: HTMLElement,
  splitAt: SplitAt,
): string;
```

```ts
// src/cards/layoutPaginator.ts
export type LayoutPaginateOpts = {
  bodyHtml: string;
  width: number;
  firstHeight: number;
  continuationHeight: number;
  // Mount factory injected for testability (real impl: measurer.mountForPagination)
  mount: (html: string, width: number) => HTMLElement;
};

export function layoutPaginate(opts: LayoutPaginateOpts): string[];
```

```ts
// src/cards/Card.tsx — props change
type Props = {
  card: RenderableCard;
  cardsPerPage: CardsPerPage;
  pagination?: CardPagination;
  bodyHtml?: string;  // was: bodyOverride?: string (markdown)
};
```

```ts
// src/cards/measurer.ts — new surface
export type CardMeasurer = {
  getBodyDimensions(card: RenderableCard): {
    width: number;
    firstHeight: number;
    continuationHeight: number;
  };
  mountForPagination(html: string, width: number): HTMLElement; // caller must remove
};
```

---

## Algorithm summary (informational; details settle during execution)

1. **Render once**: paginator calls `mount(bodyHtml, width)` to get an offscreen `<div>` styled at the body slot's width with `height: auto`. The HTML reflows to its natural multi-line height.
2. **Collect candidates**: recursive walk over child nodes:
   - **Atomic** elements (`<img>`, `<pre>`, `<code>` blocks, fenced code, 1-row tables) → one candidate at the element's `getBoundingClientRect().bottom`.
   - **Splittable** containers (`<ul>`, `<ol>`, `<dl>`, `<table>`) → between every pair of children: one candidate at the gap's `y`. For tables, "children" means tbody rows; thead/tfoot are excluded from break points.
   - **Paragraphs / inline-flow blocks** → one candidate per line box, derived from `Range.getClientRects()` on each text-node descendant. The `splitAt` records `(textNode, charOffset)` of the line's last character.
   - **Top-level body div** → also emits "between-children" candidates between top-level blocks.
3. **Greedy fit**: track `currentTop = 0` and `budget = firstHeight` (then `continuationHeight`). Binary-search the candidate list for the largest `y` such that `y - currentTop <= budget`. If none fits, accept overflow on the first candidate (matches today's "atomic accepts overflow" behavior).
4. **Slice**: call `sliceFirstChunk(container, candidate.splitAt)` which mutates the container (removes the prefix) and returns it as HTML. For mid-table cuts, the helper clones `<thead>` into the prefix when missing and leaves a fresh `<thead>` on the residual table inside the container.
5. **Repeat** with `currentTop = candidate.y` and `budget = continuationHeight` until the container is empty.
6. **Cleanup**: paginator removes the mount node before returning.

**Edge cases the algorithm must handle:**
- Empty body → `[""]`.
- Body fits entirely on first card → `[bodyHtml]`, no slicing.
- A single atomic element taller than the budget → returned as one chunk (overflow accepted).
- A paragraph with one line that exceeds the budget → returned as one chunk (line-box atomicity).
- Trailing whitespace / empty siblings post-slice → trimmed before serialization.

---

## Tasks

### Task 1: Add `bodyHtml` prop to `Card.tsx` (parallel to existing `bodyOverride`)

This task is pure additive — keeps existing markdown path working — so subsequent tasks can migrate consumers piecemeal.

**Files:**
- Modify: `src/cards/Card.tsx`
- Modify: `src/cards/Card.test.tsx`

- [ ] **Step 1: Write failing test in `Card.test.tsx`**

```tsx
test("renders bodyHtml directly when provided", () => {
  const card = itemCardFactory.build();
  render(<Card card={card} cardsPerPage={4} bodyHtml="<p>pre-rendered</p>" />);
  expect(screen.getByText("pre-rendered")).toBeInTheDocument();
  // Ensure renderBody was NOT called: an asterisk-bold marker would still be
  // visible if the HTML went through markdown.
  render(<Card card={card} cardsPerPage={4} bodyHtml="**not bold**" />);
  expect(screen.getAllByText("**not bold**").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test, expect FAIL** — `bodyHtml` prop does not exist.

`npx vitest run src/cards/Card.test.tsx`

- [ ] **Step 3: Implement minimal pass**

```tsx
type Props = {
  card: RenderableCard;
  cardsPerPage: CardsPerPage;
  pagination?: CardPagination;
  bodyOverride?: string;     // legacy, will be removed in Task 9
  bodyHtml?: string;          // new
};

export function Card({ card, cardsPerPage, pagination, bodyOverride, bodyHtml }: Props) {
  // ...
  const html = bodyHtml ?? renderBody(bodyOverride ?? card.body);
  // ...
  <div
    className={styles.body}
    data-role="card-body"
    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at render boundary
    dangerouslySetInnerHTML={{ __html: html }}
  />
```

- [ ] **Step 4: Run all `Card.test.tsx` tests, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/cards/Card.tsx src/cards/Card.test.tsx
git commit -m "feat(card): accept pre-rendered bodyHtml prop"
```

---

### Task 2: Build `breakCandidates.ts` with mocked-rect unit tests

The walker is the heart of the paginator. Unit-test the pure shape: given a tree with mocked `getBoundingClientRect`/`getClientRects`, the right `BreakCandidate[]` comes out.

**Files:**
- Create: `src/cards/breakCandidates.ts`
- Create: `src/cards/breakCandidates.test.ts`

- [ ] **Step 1: Write failing tests covering the shape contract**

```ts
import { describe, expect, test } from "vitest";
import { collectBreakCandidates } from "./breakCandidates";

const mockRect = (el: Element, top: number, bottom: number) => {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top, bottom, left: 0, right: 0, height: bottom - top, width: 0, x: 0, y: top,
    toJSON: () => ({}),
  } as DOMRect);
};

describe("collectBreakCandidates", () => {
  test("emits a candidate between top-level block siblings", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>one</p><p>two</p>";
    mockRect(root, 0, 100);
    mockRect(root.children[0], 0, 40);
    mockRect(root.children[1], 50, 100);
    const cs = collectBreakCandidates(root);
    expect(cs.map((c) => c.y)).toContain(40);
  });

  test("treats <pre> as atomic (no candidates inside)", () => { /* ... */ });
  test("emits row-level candidates inside <table>", () => { /* ... */ });
  test("emits line-box candidates inside <p> via getClientRects on text nodes", () => { /* ... */ });
});
```

- [ ] **Step 2: Run, expect FAIL** (file does not exist)

- [ ] **Step 3: Implement walker**

Implementation outline (write the code; this is reference, not the final source):

```ts
const ATOMIC_TAGS = new Set(["IMG", "PRE", "CODE", "HR"]);
const SPLITTABLE_BLOCKS = new Set(["UL", "OL", "DL", "TABLE"]);

export function collectBreakCandidates(root: HTMLElement): BreakCandidate[] {
  const out: BreakCandidate[] = [];
  const rootTop = root.getBoundingClientRect().top;
  walk(root, rootTop, out);
  return out.sort((a, b) => a.y - b.y);
}

function walk(parent: HTMLElement, originY: number, out: BreakCandidate[]) {
  const children = Array.from(parent.children);
  children.forEach((child, i) => {
    if (ATOMIC_TAGS.has(child.tagName)) {
      out.push({
        y: child.getBoundingClientRect().bottom - originY,
        splitAt: { kind: "between-children", parent, childIndex: i + 1 },
      });
      return;
    }
    if (SPLITTABLE_BLOCKS.has(child.tagName)) {
      // ... emit between-row / between-item candidates
    }
    if (isInlineFlowBlock(child)) {
      collectLineBoxCandidates(child as HTMLElement, originY, out);
      return;
    }
    walk(child as HTMLElement, originY, out);
  });
}
```

- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit**

```bash
git add src/cards/breakCandidates.ts src/cards/breakCandidates.test.ts
git commit -m "feat(cards): add break-candidate DOM walker"
```

---

### Task 3: Build `sliceAt.ts` with unit tests for each cut shape

`sliceFirstChunk(container, splitAt)` mutates the container — removing the prefix — and returns the prefix as serialized HTML. Header cloning for tables happens here.

**Files:**
- Create: `src/cards/sliceAt.ts`
- Create: `src/cards/sliceAt.test.ts`

- [ ] **Step 1: Failing tests** — cover: (a) between top-level siblings, (b) between list items, (c) between table rows (verifies thead clones into the prefix; verifies thead retained on residual), (d) between line boxes inside a `<p>` (verifies the `<p>` is split into two `<p>` halves).

- [ ] **Step 2: FAIL** (file missing)

- [ ] **Step 3: Implement** using `Range` + `extractContents`. For mid-table cuts, run a post-pass on the prefix fragment: if it contains `<tr>` rows but no `<thead>`, clone the `<thead>` from the original `<table>` into the prefix's table.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/cards/sliceAt.ts src/cards/sliceAt.test.ts
git commit -m "feat(cards): add HTML slicer with table thead cloning"
```

---

### Task 4: Assemble `layoutPaginator.ts`

Composes Tasks 2 and 3 into a chunked output. `mount` is injected for unit testability.

**Files:**
- Create: `src/cards/layoutPaginator.ts`
- Create: `src/cards/layoutPaginator.test.ts`

- [ ] **Step 1: Failing tests** — driven by an injected `mount` that returns a controlled DOM with mocked rects. Cases: (a) full body fits → one chunk equal to input; (b) two top-level blocks split between them; (c) overflow accepted on a single oversized atomic block; (d) empty body → `[""]`.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement** the loop described in "Algorithm summary". Use binary search over `candidates` for each page. Always remove the mount node in a `finally`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/cards/layoutPaginator.ts src/cards/layoutPaginator.test.ts
git commit -m "feat(cards): add layout-driven paginator"
```

---

### Task 5: Refactor `measurer.ts` to expose dimensions + mount factory

**Files:**
- Modify: `src/cards/measurer.ts`
- Modify: `src/cards/measurer.test.ts`

- [ ] **Step 1: Update tests first** — drop the old `measureFirst`/`measureContinuation` assertions; add tests that `getBodyDimensions(card)` returns positive `width`/`firstHeight`/`continuationHeight` (with mocked layout sizes), and that `mountForPagination(html, width)` returns a detached/offscreen `<HTMLElement>` with `outerHTML` containing the input HTML.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement** — keep the lazy module-level scaffold pattern (one container per `cardsPerPage`). Read body slot dimensions via `getBoundingClientRect()` after sentinel insertion (so footer pagination chrome reserves its space, matching today's behavior). `mountForPagination` appends a fresh sibling `<div>` styled at `width:<width>px; position:absolute; left:-99999px; visibility:hidden` and returns it; caller is responsible for `.remove()`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/cards/measurer.ts src/cards/measurer.test.ts
git commit -m "refactor(cards): measurer exposes body dimensions + mount factory"
```

---

### Task 6: Wire `expandCard.ts` to the new paginator

**Files:**
- Modify: `src/cards/expandCard.ts`
- Modify: `src/cards/expandCard.test.ts`

- [ ] **Step 1: Update tests** — `expandCard(card, measurer)` returns `PhysicalCard[]` whose `bodyChunk` is HTML. Assert: (a) trivial body → one card with HTML chunk equal to `renderBody(card.body)`; (b) oversized body (mocked dimensions force split) → multiple chunks, each non-empty HTML.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement**

```ts
import { renderBody } from "./renderBody";
import { layoutPaginate } from "./layoutPaginator";
// ...
export function expandCard(card: RenderableCard, measurer: CardMeasurer): PhysicalCard[] {
  const dims = measurer.getBodyDimensions(card);
  const bodyHtml = renderBody(card.body);
  const chunks = layoutPaginate({
    bodyHtml,
    width: dims.width,
    firstHeight: dims.firstHeight,
    continuationHeight: dims.continuationHeight,
    mount: (html, width) => measurer.mountForPagination(html, width),
  });
  const total = chunks.length;
  return chunks.map((bodyChunk, i) => ({
    card,
    bodyChunk,
    pagination: total > 1 ? { page: i + 1, total } : undefined,
  }));
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/cards/expandCard.ts src/cards/expandCard.test.ts
git commit -m "refactor(cards): expandCard uses layout paginator"
```

---

### Task 7: Switch `Card.tsx` consumer (`useExpandedCards`) and views to `bodyHtml`

**Files:**
- Modify: `src/cards/Card.tsx` (drop `bodyOverride`)
- Modify: `src/cards/Card.test.tsx` (rename test "renders bodyOverride" → "renders bodyHtml")
- Modify: `src/views/EditorView.tsx` (`bodyOverride={visibleChunk?.bodyChunk}` → `bodyHtml={visibleChunk?.bodyChunk}`)
- Modify: `src/views/PrintView.tsx` (same rename)

- [ ] **Step 1: Update tests** for the renames

- [ ] **Step 2: FAIL** (markdown chunk → HTML chunk causes mismatches in current assertions)

- [ ] **Step 3: Implement** the renames; remove the `bodyOverride` prop entirely.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/cards/Card.tsx src/cards/Card.test.tsx src/views/EditorView.tsx src/views/PrintView.tsx
git commit -m "refactor(card): bodyOverride (markdown) -> bodyHtml"
```

---

### Task 8: Add debounced re-pagination to `useExpandedCards` for the editor preview

`PrintView` should remain synchronous (correct first paint at print time). Editor's preview should debounce.

**Files:**
- Modify: `src/cards/useExpandedCards.ts`
- Modify: `src/cards/useExpandedCards.test.tsx`
- Modify: `src/views/EditorView.tsx` (pass debounce flag)

- [ ] **Step 1: Update tests** — verify hook accepts `{ debounceMs?: number }` option; with `debounceMs: 300` and rapid input changes, only the latest `items` triggers a re-paginate after the delay.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement** — wrap `items` in `useDebouncedValue(items, debounceMs ?? 0)`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/cards/useExpandedCards.ts src/cards/useExpandedCards.test.tsx src/views/EditorView.tsx
git commit -m "feat(cards): debounce editor pagination"
```

---

### Task 9: Delete `paginate.ts` and its tests

**Files:**
- Delete: `src/cards/paginate.ts`
- Delete: `src/cards/paginate.test.ts`

- [ ] **Step 1: Confirm no remaining imports**

```bash
grep -rn "from.*paginate\b\|paginateBody" src/ e2e/
```

Expected: empty.

- [ ] **Step 2: Delete**

```bash
rm src/cards/paginate.ts src/cards/paginate.test.ts
```

- [ ] **Step 3: Run full test suite, expect PASS**

```bash
npm test -- --run
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(cards): remove markdown-source paginator"
```

---

### Task 10: Playwright e2e for layout-driven behaviors

This is where the *real* correctness lives. jsdom can't validate that real CSS pagination works.

**Files:**
- Create: `e2e/layout-pagination.spec.ts`
- Modify: `e2e/fixtures.ts` (add fixtures for: long-paragraph card, 3+ col table card, 2-col table card)
- Modify: `e2e/editor-pagination.spec.ts`, `e2e/print-pagination.spec.ts` (refresh expectations)

- [ ] **Step 1: Write specs**

```ts
test("a long paragraph splits between line boxes, not mid-word", async ({ page }) => {
  // Seed a card with a single long paragraph that overflows one card.
  // Assert: page 1's body has no trailing partial word; page 1 + page 2 visible
  // text concatenated equals the original body.
});

test("a 5-row 4-col table splits at row boundaries with thead repeated", async ({ page }) => {
  // Seed a card whose only block is a 4-col table with enough rows to overflow.
  // Assert: each card chunk shows the column headers; row sets are disjoint and
  // their union equals the original table.
});

test("editor preview re-paginates after debounce on rapid edits", async ({ page }) => {
  // Type repeatedly into the body field; assert preview-counts label only
  // updates ~once after the debounce window elapses.
});
```

- [ ] **Step 2: Run** — `npm run test:e2e -- layout-pagination.spec.ts`

- [ ] **Step 3: Iterate** until green

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test(e2e): cover layout-driven pagination invariants"
```

---

### Task 11: Visual smoke check + final verification

- [ ] **Step 1: `npm run dev`** in this worktree, open editor, verify:
  - Long-paragraph card paginates at line boxes (no mid-word break)
  - Multi-row table paginates with header repeated on each card
  - Live preview pager shows correct counts after edits

- [ ] **Step 2: Full unit + e2e**

```bash
npm test -- --run
npx tsc --noEmit
npx biome check src/ e2e/
npm run test:e2e
```

- [ ] **Step 3: Final commit (if cleanup needed)**

---

## Risks and unknowns

1. **JSDOM rect mocking robustness.** `getClientRects` on Range objects in jsdom is partially implemented. Some unit tests may need a small `Range`-shim helper. Mitigation: extract a `geometry.ts` indirection that the walker calls, easy to replace in tests.
2. **Slicing cost on long bodies.** Re-running the full DOM walk on every editor keystroke is the perf concern. Debounce (Task 8) mitigates it; if still slow on huge bodies, memoize candidates by an HTML hash.
3. **Header repetition + 2-col `<dl>` interaction.** When the dl-rendering work is brought back, table-shape rendering decisions have to coexist with this paginator's "split between siblings" logic. Should be a no-op (a `<dl>` with `<dt>/<dd>` children splits between pairs naturally), but worth re-verifying.
4. **`renderBody` called once vs. per-chunk.** `expandCard` now renders markdown once and slices the rendered HTML. Sanitization is unchanged (DOMPurify runs once on the full body). Slices are HTML substrings of already-sanitized HTML, so no re-sanitize needed when `Card.tsx` injects them.

---

## Self-review checklist

- [x] Spec coverage: every "decision already made" maps to one or more tasks (chunk format → Tasks 1, 7; dl revert → not in scope, called out; thead repeat → Tasks 3, 10; debounce → Task 8; paged.js → addressed in Architecture).
- [x] No placeholders in code blocks (representative test/impl code given; minor "/* ... */" only in test scaffolding where the structure is clear).
- [x] Type consistency: `BreakCandidate`, `SplitAt`, `LayoutPaginateOpts`, `CardMeasurer` defined once and referenced consistently.
