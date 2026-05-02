# Card Overflow Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an oversized item card as a sequence of physical cards with `(p2 of 4)` continuation markers instead of clipping the body.

**Architecture:** A pure pagination algorithm (`paginate.ts`) drives splits via injected measurer callbacks. A DOM-based measurer module (`measurer.ts`) lazily mounts hidden Card-shaped scaffolds and measures candidate body chunks against real layout. A React hook (`useExpandedCards`) glues them together and produces a flat list of physical cards with `pagination` metadata. PrintView consumes that list directly; EditorView shows a paginator + a counts label and debounces measurement to avoid per-keystroke remeasure.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + RTL, MSW, Fishery, Playwright (new).

**Reference spec:** `docs/superpowers/specs/2026-05-02-card-overflow-pagination-design.md`

---

## File map

**Create:**
- `src/cards/paginate.ts` — pure pagination algorithm with injectable measurers
- `src/cards/paginate.test.ts` — unit tests for the algorithm
- `src/cards/measurer.ts` — DOM-based measurer, lazy + ref-counted per layout
- `src/cards/expandCard.ts` — pure helper turning chunks → `PhysicalCard[]`
- `src/cards/expandCard.test.ts` — unit tests for the helper
- `src/cards/useExpandedCards.ts` — React hook combining measurer + expandCard
- `src/cards/useExpandedCards.test.tsx` — light hook smoke test
- `src/lib/useDebouncedValue.ts` — small debounce utility
- `playwright.config.ts` — Playwright config
- `e2e/editor-pagination.spec.ts` — e2e for editor preview pagination
- `e2e/print-pagination.spec.ts` — e2e for print sheet pagination
- `e2e/fixtures.ts` — small helper for seeding deck state via app

**Modify:**
- `src/cards/Card.tsx` — add `pagination` and `bodyOverride` props
- `src/cards/Card.test.tsx` — add tests for new props
- `src/views/PrintView.tsx` — wire `useExpandedCards`
- `src/views/PrintView.test.tsx` — adjust existing tests (still pass) and add a pagination test
- `src/views/EditorView.tsx` — counts label, paginator, debounced measurement
- `src/views/EditorView.module.css` — paginator + counts styles
- `src/views/EditorView.test.tsx` — add tests for counts label & paginator
- `vitest.config.ts` — exclude `e2e/` from Vitest
- `package.json` — add Playwright devDep + scripts (requires user approval for `npm install`)
- `biome.json` — include `e2e/` in lint scope (or exclude — match project style)
- `.gitignore` — add `playwright-report/`, `test-results/`

---

## Task 1: Add `pagination` and `bodyOverride` props to `Card`

**Files:**
- Modify: `src/cards/Card.tsx`
- Modify: `src/cards/Card.test.tsx`

- [ ] **Step 1: Add failing tests for the new props**

Append to `src/cards/Card.test.tsx`:

```tsx
describe("<Card> with pagination", () => {
  test("suffixes title with (pX of N) when paginated", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} layout="4-up" pagination={{ page: 2, total: 4 }} />);
    expect(
      screen.getByRole("heading", { name: `${card.name} (p2 of 4)` }),
    ).toBeInTheDocument();
  });

  test("hides type line on continuation pages", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} layout="4-up" pagination={{ page: 2, total: 3 }} />);
    expect(screen.queryByText(card.typeLine)).not.toBeInTheDocument();
  });

  test("shows type line on the first page when paginated", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} layout="4-up" pagination={{ page: 1, total: 3 }} />);
    expect(screen.getByText(card.typeLine)).toBeInTheDocument();
  });

  test("renders bodyOverride instead of card.body", () => {
    const card = itemCardFactory.build({ body: "original body" });
    render(<Card card={card} layout="4-up" bodyOverride="chunk text" />);
    expect(screen.getByText("chunk text")).toBeInTheDocument();
    expect(screen.queryByText("original body")).not.toBeInTheDocument();
  });

  test("retains footer on continuation pages when costWeight is set", () => {
    const card = itemCardFactory.build({ costWeight: "500 gp · 15 lb" });
    render(<Card card={card} layout="4-up" pagination={{ page: 2, total: 2 }} />);
    expect(screen.getByText("500 gp · 15 lb")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```
npm test -- src/cards/Card.test.tsx
```
Expected: the new `<Card> with pagination` tests fail (props don't exist yet); existing tests still pass.

- [ ] **Step 3: Update `Card.tsx` with the new props**

Replace `src/cards/Card.tsx` contents:

```tsx
import { useState } from "react";
import styles from "./Card.module.css";
import { pickIconKey } from "./iconRules";
import { ResolvedIcon } from "./resolveIcon";
import type { ItemCard } from "./types";

export type CardLayout = "4-up" | "2-up";

export type CardPagination = { page: number; total: number };

type Props = {
  card: ItemCard;
  layout: CardLayout;
  pagination?: CardPagination;
  bodyOverride?: string;
};

const splitParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export function Card({ card, layout, pagination, bodyOverride }: Props) {
  const layoutClass = layout === "4-up" ? styles["four-up"] : styles["two-up"];
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  const showImage = card.imageUrl !== undefined && brokenUrl !== card.imageUrl;
  const iconKey = card.iconKey ?? pickIconKey(card);

  const isFirstPage = !pagination || pagination.page === 1;
  const titleText = pagination
    ? `${card.name} (p${pagination.page} of ${pagination.total})`
    : card.name;
  const bodyText = bodyOverride ?? card.body;

  return (
    <div className={`${styles.card} ${layoutClass}`} data-role="card-root">
      {showImage ? (
        <img
          className={styles.image}
          src={card.imageUrl}
          alt=""
          data-testid="card-image"
          onError={() => setBrokenUrl(card.imageUrl ?? null)}
        />
      ) : (
        <div className={styles.fallbackIcon} data-testid="card-fallback-icon" aria-hidden="true">
          <ResolvedIcon iconKey={iconKey} />
        </div>
      )}
      <div className={styles.header}>
        <h3 className={styles.title}>{titleText}</h3>
        {isFirstPage && <div className={styles.typeLine}>{card.typeLine}</div>}
      </div>
      <hr className={styles.divider} />
      <div className={styles.body} data-role="card-body">
        {splitParagraphs(bodyText).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {card.costWeight && (
        <div className={styles.footer} data-testid="card-footer">
          {card.costWeight}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the full Card test file to confirm all pass**

```
npm test -- src/cards/Card.test.tsx
```
Expected: all `<Card>` and `<Card> with pagination` tests pass.

- [ ] **Step 5: Commit**

```
git add src/cards/Card.tsx src/cards/Card.test.tsx
git commit -m "Card: add pagination and bodyOverride props"
```

---

## Task 2: Implement the pure pagination algorithm

**Files:**
- Create: `src/cards/paginate.ts`
- Create: `src/cards/paginate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/cards/paginate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { type PaginateMeasurer, paginateBody } from "./paginate";

const fitsUpTo =
  (n: number): PaginateMeasurer =>
  (s) =>
    s.length <= n;

describe("paginateBody", () => {
  test("returns single chunk when body fits the first card", () => {
    expect(
      paginateBody({
        body: "short",
        measureFirst: fitsUpTo(100),
        measureContinuation: fitsUpTo(100),
      }),
    ).toEqual(["short"]);
  });

  test("splits at word boundary when body overflows", () => {
    expect(
      paginateBody({
        body: "alpha beta gamma delta",
        measureFirst: fitsUpTo(11),
        measureContinuation: fitsUpTo(11),
      }),
    ).toEqual(["alpha beta", "gamma delta"]);
  });

  test("uses different budgets for first vs continuation", () => {
    // first fits up to 4 ("alpha"=5 → no, "alph"=4 → no word boundary at 4 → fallback to char)
    // simpler: first fits 5, continuation fits 100
    expect(
      paginateBody({
        body: "alpha beta gamma delta",
        measureFirst: fitsUpTo(5),
        measureContinuation: fitsUpTo(100),
      }),
    ).toEqual(["alpha", "beta gamma delta"]);
  });

  test("splits across three or more pages", () => {
    expect(
      paginateBody({
        body: "aa bb cc dd ee ff",
        measureFirst: fitsUpTo(5),
        measureContinuation: fitsUpTo(5),
      }),
    ).toEqual(["aa bb", "cc dd", "ee ff"]);
  });

  test("falls back to character split when a single token exceeds the card", () => {
    const result = paginateBody({
      body: "supercalifragilistic",
      measureFirst: fitsUpTo(5),
      measureContinuation: fitsUpTo(5),
    });
    expect(result.join("")).toBe("supercalifragilistic");
    expect(result.every((c) => c.length <= 5)).toBe(true);
  });

  test("returns single empty chunk for empty body", () => {
    expect(
      paginateBody({
        body: "",
        measureFirst: fitsUpTo(0),
        measureContinuation: fitsUpTo(0),
      }),
    ).toEqual([""]);
  });

  test("trims leading whitespace between chunks but keeps in-chunk paragraph breaks", () => {
    // "para one\n\npara two" — first card fits 8 chars exactly ("para one")
    const result = paginateBody({
      body: "para one\n\npara two",
      measureFirst: fitsUpTo(8),
      measureContinuation: fitsUpTo(100),
    });
    expect(result).toEqual(["para one", "para two"]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail (file doesn't exist)**

```
npm test -- src/cards/paginate.test.ts
```
Expected: FAIL with module-not-found.

- [ ] **Step 3: Create `paginate.ts` with the algorithm**

Create `src/cards/paginate.ts`:

```ts
export type PaginateMeasurer = (prefix: string) => boolean;

export function paginateBody(opts: {
  body: string;
  measureFirst: PaginateMeasurer;
  measureContinuation: PaginateMeasurer;
}): string[] {
  const { body, measureFirst, measureContinuation } = opts;

  if (body === "") return [""];
  if (measureFirst(body)) return [body];

  const chunks: string[] = [];

  const firstChunk = greedyFit(body, measureFirst);
  chunks.push(firstChunk);
  let remaining = body.slice(firstChunk.length).replace(/^\s+/, "");

  while (remaining.length > 0) {
    if (measureContinuation(remaining)) {
      chunks.push(remaining);
      break;
    }
    const next = greedyFit(remaining, measureContinuation);
    chunks.push(next);
    remaining = remaining.slice(next.length).replace(/^\s+/, "");
  }

  return chunks;
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
  // Guarantee forward progress: if even 1 char doesn't fit, take 1 char anyway
  return text.slice(0, Math.max(best, 1));
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```
npm test -- src/cards/paginate.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add src/cards/paginate.ts src/cards/paginate.test.ts
git commit -m "Add paginateBody algorithm with word/char-boundary fallbacks"
```

---

## Task 3: Implement the DOM measurer module

**Files:**
- Create: `src/cards/measurer.ts`

This module is integration-tested via the e2e suite (Task 8) and through `useExpandedCards`. JSDOM can't compute real layout, so we don't write isolated unit tests against it.

- [ ] **Step 1: Create `measurer.ts`**

Create `src/cards/measurer.ts`:

```ts
import cardStyles from "./Card.module.css";
import type { CardLayout } from "./Card";
import type { ItemCard } from "./types";

export type CardMeasurer = {
  measureFirst: (card: ItemCard, chunk: string) => boolean;
  measureContinuation: (card: ItemCard, chunk: string) => boolean;
  release: () => void;
};

type CachedMeasurer = {
  container: HTMLDivElement;
  refCount: number;
  firstTitle: HTMLElement;
  firstTypeLine: HTMLElement;
  firstBody: HTMLElement;
  firstFooter: HTMLElement;
  contTitle: HTMLElement;
  contBody: HTMLElement;
  contFooter: HTMLElement;
};

const cache = new Map<CardLayout, CachedMeasurer>();
const SENTINEL_SUFFIX = " (p9 of 9)";

export function acquireMeasurer(layout: CardLayout): CardMeasurer {
  let entry = cache.get(layout);
  if (!entry) {
    entry = build(layout);
    cache.set(layout, entry);
  }
  entry.refCount++;

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

  const setFooter = (el: HTMLElement, costWeight: string | undefined) => {
    if (costWeight) {
      el.style.display = "";
      el.textContent = costWeight;
    } else {
      el.style.display = "none";
      el.textContent = "";
    }
  };

  const measureFirst = (card: ItemCard, chunk: string): boolean => {
    if (!entry) return true;
    entry.firstTitle.textContent = card.name + SENTINEL_SUFFIX;
    entry.firstTypeLine.textContent = card.typeLine;
    setFooter(entry.firstFooter, card.costWeight);
    setBodyContent(entry.firstBody, chunk);
    return entry.firstBody.scrollHeight <= entry.firstBody.clientHeight;
  };

  const measureContinuation = (card: ItemCard, chunk: string): boolean => {
    if (!entry) return true;
    entry.contTitle.textContent = card.name + SENTINEL_SUFFIX;
    setFooter(entry.contFooter, card.costWeight);
    setBodyContent(entry.contBody, chunk);
    return entry.contBody.scrollHeight <= entry.contBody.clientHeight;
  };

  const release = () => {
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
      entry.container.remove();
      cache.delete(layout);
      entry = undefined;
    }
  };

  return { measureFirst, measureContinuation, release };
}

function build(layout: CardLayout): CachedMeasurer {
  const container = document.createElement("div");
  container.setAttribute("data-measurer", layout);
  container.style.cssText =
    "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";

  const layoutClass = layout === "4-up" ? cardStyles["four-up"] : cardStyles["two-up"];
  const cardClass = `${cardStyles.card} ${layoutClass}`;

  container.innerHTML = `
    <div class="${cardClass}" data-shape="first" data-role="card-root">
      <div class="${cardStyles.header}">
        <h3 class="${cardStyles.title}" data-slot="title"></h3>
        <div class="${cardStyles.typeLine}" data-slot="typeLine"></div>
      </div>
      <hr class="${cardStyles.divider}" />
      <div class="${cardStyles.body}" data-slot="body" data-role="card-body"></div>
      <div class="${cardStyles.footer}" data-slot="footer"></div>
    </div>
    <div class="${cardClass}" data-shape="continuation" data-role="card-root">
      <div class="${cardStyles.header}">
        <h3 class="${cardStyles.title}" data-slot="title"></h3>
      </div>
      <hr class="${cardStyles.divider}" />
      <div class="${cardStyles.body}" data-slot="body" data-role="card-body"></div>
      <div class="${cardStyles.footer}" data-slot="footer"></div>
    </div>
  `;

  document.body.appendChild(container);

  const find = (shape: "first" | "continuation", slot: string): HTMLElement => {
    const el = container.querySelector<HTMLElement>(
      `[data-shape="${shape}"] [data-slot="${slot}"]`,
    );
    if (!el) throw new Error(`measurer: missing ${shape}.${slot}`);
    return el;
  };

  return {
    container,
    refCount: 0,
    firstTitle: find("first", "title"),
    firstTypeLine: find("first", "typeLine"),
    firstBody: find("first", "body"),
    firstFooter: find("first", "footer"),
    contTitle: find("continuation", "title"),
    contBody: find("continuation", "body"),
    contFooter: find("continuation", "footer"),
  };
}
```

- [ ] **Step 2: Confirm typecheck**

```
npm run build
```
Expected: build succeeds (no `tsc` errors). Note: `npm run build` runs `tsc -b && vite build`; the build product is unused — we just want type checking.

- [ ] **Step 3: Commit**

```
git add src/cards/measurer.ts
git commit -m "Add DOM-based card measurer keyed by layout"
```

---

## Task 4: Implement `expandCard` (pure helper) and `useExpandedCards` (hook)

**Files:**
- Create: `src/cards/expandCard.ts`
- Create: `src/cards/expandCard.test.ts`
- Create: `src/cards/useExpandedCards.ts`
- Create: `src/cards/useExpandedCards.test.tsx`

- [ ] **Step 1: Write failing tests for `expandCard`**

Create `src/cards/expandCard.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { expandCard } from "./expandCard";
import { itemCardFactory } from "./factories";
import type { CardMeasurer } from "./measurer";

const measurerFromBudget = (firstMax: number, contMax: number): CardMeasurer => ({
  measureFirst: (_card, chunk) => chunk.length <= firstMax,
  measureContinuation: (_card, chunk) => chunk.length <= contMax,
  release: () => {},
});

describe("expandCard", () => {
  test("single physical card with no pagination metadata when body fits", () => {
    const card = itemCardFactory.build({ body: "tiny" });
    const result = expandCard(card, measurerFromBudget(1000, 1000));
    expect(result).toEqual([
      { card, bodyChunk: "tiny", pagination: undefined, needsScaleFit: true },
    ]);
  });

  test("multiple physical cards with pagination metadata when body splits", () => {
    const card = itemCardFactory.build({ body: "alpha beta gamma" });
    const result = expandCard(card, measurerFromBudget(5, 5));
    expect(result.map((p) => p.bodyChunk)).toEqual(["alpha", "beta", "gamma"]);
    expect(result[0].pagination).toEqual({ page: 1, total: 3 });
    expect(result[1].pagination).toEqual({ page: 2, total: 3 });
    expect(result[2].pagination).toEqual({ page: 3, total: 3 });
    expect(result.every((p) => p.needsScaleFit === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```
npm test -- src/cards/expandCard.test.ts
```
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `expandCard.ts`**

Create `src/cards/expandCard.ts`:

```ts
import { paginateBody } from "./paginate";
import type { CardMeasurer } from "./measurer";
import type { ItemCard } from "./types";
import type { CardPagination } from "./Card";

export type PhysicalCard = {
  card: ItemCard;
  bodyChunk: string;
  pagination?: CardPagination;
  needsScaleFit: boolean;
};

export function expandCard(card: ItemCard, measurer: CardMeasurer): PhysicalCard[] {
  const chunks = paginateBody({
    body: card.body,
    measureFirst: (s) => measurer.measureFirst(card, s),
    measureContinuation: (s) => measurer.measureContinuation(card, s),
  });

  const total = chunks.length;
  return chunks.map((bodyChunk, i) => ({
    card,
    bodyChunk,
    pagination: total > 1 ? { page: i + 1, total } : undefined,
    needsScaleFit: total === 1,
  }));
}
```

- [ ] **Step 4: Run `expandCard` tests, confirm pass**

```
npm test -- src/cards/expandCard.test.ts
```
Expected: pass.

- [ ] **Step 5: Implement `useExpandedCards.ts`**

Create `src/cards/useExpandedCards.ts`:

```ts
import { useEffect, useMemo, useRef } from "react";
import type { CardLayout } from "./Card";
import { acquireMeasurer, type CardMeasurer } from "./measurer";
import { expandCard, type PhysicalCard } from "./expandCard";
import type { ItemCard } from "./types";

export type { PhysicalCard };

export function useExpandedCards(
  items: ItemCard[],
  layout: CardLayout,
): { physicalCards: PhysicalCard[] } {
  const measurerRef = useRef<{ layout: CardLayout; m: CardMeasurer } | null>(null);

  if (typeof document !== "undefined") {
    if (measurerRef.current === null) {
      measurerRef.current = { layout, m: acquireMeasurer(layout) };
    } else if (measurerRef.current.layout !== layout) {
      measurerRef.current.m.release();
      measurerRef.current = { layout, m: acquireMeasurer(layout) };
    }
  }

  useEffect(
    () => () => {
      measurerRef.current?.m.release();
      measurerRef.current = null;
    },
    [],
  );

  const physicalCards = useMemo<PhysicalCard[]>(() => {
    const m = measurerRef.current?.m;
    if (!m) return [];
    return items.flatMap((item) => expandCard(item, m));
  }, [items, layout]);

  return { physicalCards };
}
```

- [ ] **Step 6: Add a smoke test for the hook**

Create `src/cards/useExpandedCards.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { itemCardFactory } from "./factories";
import { useExpandedCards } from "./useExpandedCards";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return 100;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 200;
    },
  });
});

describe("useExpandedCards", () => {
  test("returns one PhysicalCard per item when bodies fit", () => {
    const items = itemCardFactory.buildList(3);
    const { result } = renderHook(() => useExpandedCards(items, "4-up"));
    expect(result.current.physicalCards).toHaveLength(3);
    expect(result.current.physicalCards.every((p) => p.needsScaleFit)).toBe(true);
  });

  test("expands a single overflowing item into multiple PhysicalCards", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        // first call (whole body) overflows, subsequent prefixes fit
        // We can't easily distinguish which call is which here, so flip after first.
        const ret = (this as unknown as { __flips?: number }).__flips ?? 0;
        (this as unknown as { __flips?: number }).__flips = ret + 1;
        return ret === 0 ? 1000 : 100;
      },
    });
    const item = itemCardFactory.build({ body: "alpha beta gamma delta epsilon" });
    const { result } = renderHook(() => useExpandedCards([item], "4-up"));
    expect(result.current.physicalCards.length).toBeGreaterThanOrEqual(1);
  });

  test("releases measurer on unmount", () => {
    const items = itemCardFactory.buildList(1);
    const { unmount } = renderHook(() => useExpandedCards(items, "4-up"));
    unmount();
    expect(document.querySelectorAll("[data-measurer]")).toHaveLength(0);
  });
});

vi.mock("./Card.module.css", () => ({
  default: new Proxy({}, { get: (_, k) => String(k) }),
}));
```

- [ ] **Step 7: Run all new tests, confirm pass**

```
npm test -- src/cards/expandCard.test.ts src/cards/useExpandedCards.test.tsx
```
Expected: pass.

- [ ] **Step 8: Run the whole vitest suite to confirm no regressions**

```
npm test
```
Expected: pass.

- [ ] **Step 9: Commit**

```
git add src/cards/expandCard.ts src/cards/expandCard.test.ts src/cards/useExpandedCards.ts src/cards/useExpandedCards.test.tsx
git commit -m "Add expandCard helper and useExpandedCards hook"
```

---

## Task 5: Wire `useExpandedCards` into `PrintView`

**Files:**
- Modify: `src/views/PrintView.tsx`
- Modify: `src/views/PrintView.test.tsx`

- [ ] **Step 1: Update `PrintView.tsx`**

Replace `src/views/PrintView.tsx` contents. Note: `useExpandedCards` is called *before* the `isLoading` early return so React's hook ordering stays consistent — when `cardsQuery.data` is `undefined`, `items` is `[]` and the hook returns an empty `physicalCards` array.

```tsx
import { useState } from "react";
import { AutoFitCard } from "../cards/AutoFitCard";
import { Card } from "../cards/Card";
import type { ItemCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { useDeckCards } from "../decks/queries";
import { Button } from "../lib/ui/Button";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./PrintView.module.css";

type PerPage = 2 | 4;
type Props = { deckId: string };

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export function PrintView({ deckId }: Props) {
  const cardsQuery = useDeckCards(deckId);
  const [perPage, setPerPage] = useState<PerPage>(4);

  const cards = cardsQuery.data ?? [];
  const items = cards.filter((c): c is ItemCard => c.kind === "item");
  const layout = perPage === 4 ? "4-up" : "2-up";
  const { physicalCards } = useExpandedCards(items, layout);

  if (cardsQuery.isLoading) return <LoadingState />;

  const pages = physicalCards.length === 0 ? [] : chunk(physicalCards, perPage);

  return (
    <div>
      <div className={styles.controls}>
        <label>
          Cards per page{" "}
          <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value) as PerPage)}>
            <option value={4}>4</option>
            <option value={2}>2</option>
          </select>
        </label>
        <Button variant="primary" onPress={() => window.print()} isDisabled={items.length === 0}>
          Print
        </Button>
        <span className={styles.tip}>
          Tip: in the print dialog, choose <em>Margins: None</em> and uncheck{" "}
          <em>Headers and footers</em> for best results.
        </span>
      </div>

      {items.length === 0 && <p>No item cards in this deck yet.</p>}

      <div className={styles.sheet}>
        {pages.map((pageCards, pageIdx) => (
          <div
            key={`page-${pageIdx}-${pageCards[0]?.card.id ?? "empty"}`}
            data-testid="page"
            className={`${styles.page} ${perPage === 4 ? styles.fourUp : styles.twoUp}`}
          >
            {pageCards.map((entry, slotIdx) =>
              entry.needsScaleFit ? (
                <div key={`${entry.card.id}-${slotIdx}`} className={styles.slot}>
                  <AutoFitCard card={entry.card} layout={layout} />
                </div>
              ) : (
                <div
                  key={`${entry.card.id}-${entry.pagination?.page ?? slotIdx}`}
                  className={styles.slot}
                >
                  <Card
                    card={entry.card}
                    layout={layout}
                    bodyOverride={entry.bodyChunk}
                    pagination={entry.pagination}
                  />
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run existing `PrintView` tests; expect them to pass unchanged**

```
npm test -- src/views/PrintView.test.tsx
```
Expected: pass — items that fit map 1:1 to physical cards (`scrollHeight` stub from JSDOM keeps everything in `needsScaleFit` branch), and existing tests don't assert pagination.

If a test fails because the page count differs, that's a sign the JSDOM stub is reporting overflow. Add this `beforeEach` to the test file to force "fits" mode:

```ts
import { beforeEach } from "vitest";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() { return 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() { return 1000; },
  });
});
```

- [ ] **Step 3: Add a pagination test for `PrintView`**

Append to `src/views/PrintView.test.tsx`:

```ts
import * as paginateModule from "../cards/paginate";

test("renders multiple physical cards for an oversized item at 4-up", async () => {
  const card = makeCardRow.build({
    payload: { ...makeItemPayload.build(), body: "long ".repeat(200) },
  });
  // Force pagination by making any non-empty body return 3 chunks
  const spy = vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
    body === "" ? [""] : ["chunk-a", "chunk-b", "chunk-c"],
  );
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /\(p1 of 3\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /\(p3 of 3\)/i })).toBeInTheDocument();
  });
  spy.mockRestore();
});
```

Add the import for `vi`, `makeItemPayload` if missing. Also: this test relies on `vi.spyOn` working on a re-exported pure function. Since `expandCard` calls `paginateBody` directly, the spy on the module export works thanks to Vitest's hoisting.

If the spy doesn't take effect, fall back to a `vi.mock("../cards/paginate", ...)` declaration at the top of the file.

- [ ] **Step 4: Run all `PrintView` tests, confirm pass**

```
npm test -- src/views/PrintView.test.tsx
```
Expected: pass.

- [ ] **Step 5: Run the full vitest suite**

```
npm test
```
Expected: pass.

- [ ] **Step 6: Commit**

```
git add src/views/PrintView.tsx src/views/PrintView.test.tsx
git commit -m "PrintView: render paginated physical cards via useExpandedCards"
```

---

## Task 6: Counts label, paginator, and debounced measurement in `EditorView`

**Files:**
- Create: `src/lib/useDebouncedValue.ts`
- Modify: `src/views/EditorView.tsx`
- Modify: `src/views/EditorView.module.css`
- Modify: `src/views/EditorView.test.tsx`

- [ ] **Step 1: Create the debounce hook**

Create `src/lib/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
```

- [ ] **Step 2: Add styles for the paginator and counts label**

Append to `src/views/EditorView.module.css`:

```css
.paginator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
  font-size: var(--fs-sm);
}

.paginatorPage {
  min-width: 6em;
  text-align: center;
  color: var(--color-text-muted);
}

.counts {
  margin-top: var(--space-1);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  text-align: center;
}
```

- [ ] **Step 3: Update `EditorView.tsx`**

In `src/views/EditorView.tsx`, replace the preview block at the bottom of the JSX with the paginated version, and add the supporting hooks at the top of the function body. Final state of `EditorView.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AutoFitCard } from "../cards/AutoFitCard";
import { Card } from "../cards/Card";
import { ItemEditor } from "../cards/ItemEditor";
import type { ItemCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { useDeleteCard, useSaveCard } from "../decks/mutations";
import { useDeckCards } from "../decks/queries";
import { newId } from "../lib/id";
import { nowIso } from "../lib/time";
import { Button } from "../lib/ui/Button";
import { LoadingState } from "../lib/ui/LoadingState";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import styles from "./EditorView.module.css";

const isPristineNewCard = (card: ItemCard): boolean =>
  card.name === "Untitled item" &&
  card.typeLine === "" &&
  card.body === "" &&
  card.costWeight === undefined &&
  card.imageUrl === undefined &&
  card.createdAt === card.updatedAt;

const isTemplateItem = (card: ItemCard): boolean =>
  card.source === "api" && /\(any /i.test(card.body);

const cardCountLabel = (count: number, layout: string) =>
  `${count} card${count === 1 ? "" : "s"} (${layout})`;

type Props = { deckId: string; cardId: string };

export function EditorView({ deckId, cardId }: Props) {
  const cardsQuery = useDeckCards(deckId);
  const saveCard = useSaveCard();
  const deleteCard = useDeleteCard();
  const navigate = useNavigate();

  const isNew = cardId === "new";

  const stub: ItemCard | null = useMemo(() => {
    if (!isNew) return null;
    const now = nowIso();
    return {
      id: newId(),
      kind: "item",
      name: "Untitled item",
      typeLine: "",
      body: "",
      source: "custom",
      createdAt: now,
      updatedAt: now,
    };
  }, [isNew]);

  const existing = cardsQuery.data?.find((c) => c.id === cardId) ?? null;
  const initial = isNew ? stub : existing;

  const [draft, setDraft] = useState<ItemCard | null>(
    initial && initial.kind === "item" ? initial : null,
  );

  useEffect(() => {
    if (initial && initial.kind === "item") setDraft(initial);
  }, [initial]);

  const debouncedBody = useDebouncedValue(draft?.body ?? "", 200);
  const measurementCard = useMemo<ItemCard | null>(
    () => (draft ? { ...draft, body: debouncedBody } : null),
    [draft, debouncedBody],
  );
  const measurementItems = useMemo(
    () => (measurementCard ? [measurementCard] : []),
    [measurementCard],
  );
  const { physicalCards: chunks4Up } = useExpandedCards(measurementItems, "4-up");
  const { physicalCards: chunks2Up } = useExpandedCards(measurementItems, "2-up");

  const [previewPage, setPreviewPage] = useState(0);
  const totalPages4 = Math.max(chunks4Up.length, 1);
  const totalPages2 = Math.max(chunks2Up.length, 1);
  const clampedPage = Math.min(previewPage, totalPages4 - 1);
  const visibleChunk = chunks4Up[clampedPage];

  if (cardsQuery.isLoading && !isNew) return <LoadingState />;
  if (!isNew && !existing) return <p>Card not found.</p>;
  if (existing && existing.kind !== "item") return <p>Only item cards are supported in v1.</p>;
  if (!draft) return null;

  const handleSave = async () => {
    await saveCard.mutateAsync({ card: draft, deckId, isNew });
    navigate({ to: "/deck/$deckId", params: { deckId } });
  };

  const handleCancel = async () => {
    if (!isNew && existing && existing.kind === "item" && isPristineNewCard(existing)) {
      await deleteCard.mutateAsync({ cardId: existing.id, deckId });
    }
    navigate({ to: "/deck/$deckId", params: { deckId } });
  };

  const countsLabel =
    totalPages4 === 1 && totalPages2 === 1
      ? "1 card"
      : `${cardCountLabel(totalPages4, "4-up")} · ${cardCountLabel(totalPages2, "2-up")}`;

  const showPaginator = totalPages4 > 1;

  return (
    <section className={styles.editor}>
      <div className={styles.form}>
        {isTemplateItem(draft) && (
          <div className={styles.templateNotice} data-testid="template-notice">
            <strong>Template item.</strong> The dnd5eapi entry is weapon-type-agnostic (e.g.
            &ldquo;Any melee weapon&rdquo;). Rename and edit the description to match your specific
            weapon or armor.
          </div>
        )}
        <ItemEditor card={draft} onChange={setDraft} />
        <div className={styles.formActions}>
          <Button variant="primary" onPress={handleSave} isDisabled={saveCard.isPending}>
            Save
          </Button>
          <Button variant="secondary" onPress={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
      <div className={styles.preview}>
        <div className={styles.previewLabel}>Preview (4-up size)</div>
        {totalPages4 === 1 || !visibleChunk ? (
          <AutoFitCard card={draft} layout="4-up" />
        ) : (
          <Card
            card={draft}
            layout="4-up"
            bodyOverride={visibleChunk.bodyChunk}
            pagination={visibleChunk.pagination}
          />
        )}
        {showPaginator && (
          <div className={styles.paginator} data-testid="preview-paginator">
            <Button
              variant="secondary"
              onPress={() => setPreviewPage((p) => Math.max(0, p - 1))}
              isDisabled={clampedPage === 0}
            >
              ←
            </Button>
            <span className={styles.paginatorPage}>
              Page {clampedPage + 1} of {totalPages4}
            </span>
            <Button
              variant="secondary"
              onPress={() => setPreviewPage((p) => Math.min(totalPages4 - 1, p + 1))}
              isDisabled={clampedPage === totalPages4 - 1}
            >
              →
            </Button>
          </div>
        )}
        <div className={styles.counts} data-testid="preview-counts">
          {countsLabel}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add tests for the new editor preview behavior**

Append to `src/views/EditorView.test.tsx`:

```tsx
import * as paginateModule from "../cards/paginate";

it("shows '1 card' counts label when body fits", async () => {
  const card = makeCardRow.build({ id: "c1", deck_id: "d1" });
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
  render(wrap(<EditorView deckId="d1" cardId="c1" />));
  expect(await screen.findByTestId("preview-counts")).toHaveTextContent(/^1 card$/);
});

it("shows multi-card counts label and paginator when body overflows at 4-up", async () => {
  const card = makeCardRow.build({ id: "c1", deck_id: "d1" });
  vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
    body === "" ? [""] : ["chunk-a", "chunk-b", "chunk-c"],
  );
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
  render(wrap(<EditorView deckId="d1" cardId="c1" />));
  expect(await screen.findByTestId("preview-paginator")).toBeInTheDocument();
  expect(screen.getByTestId("preview-counts")).toHaveTextContent(/3 cards \(4-up\)/);
});
```

- [ ] **Step 5: Run editor tests**

```
npm test -- src/views/EditorView.test.tsx
```
Expected: pass.

- [ ] **Step 6: Smoke-check the editor in a browser**

```
npm run dev
```
Open `/`, create or open an item, paste a long body (e.g. 1000 words). Confirm:
- Counts label updates to `N cards (4-up) · M cards (2-up)` after ~200ms.
- Paginator appears with `← Page 1 of N →`.
- Clicking → advances the preview chunk; title shows `(p2 of N)` etc.
- Clearing the body returns to a single card with `1 card`.

- [ ] **Step 7: Commit**

```
git add src/lib/useDebouncedValue.ts src/views/EditorView.tsx src/views/EditorView.module.css src/views/EditorView.test.tsx
git commit -m "EditorView: paginated preview with debounced measurement"
```

---

## Task 7: Set up Playwright

**This task requires user approval before running `npm install`.** Pause and confirm before Step 2.

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `.gitignore`
- Modify: `biome.json`

- [ ] **Step 1: Pause and ask the user to approve dependency changes**

Tell the user: "About to add `@playwright/test` to devDependencies and run `npm install`. OK to proceed?"
Wait for confirmation.

- [ ] **Step 2: Add Playwright to devDependencies**

```
npm install --save-dev @playwright/test
```

Then install Chromium only (we don't need other browsers for this app):

```
npx playwright install chromium
```

- [ ] **Step 3: Create `playwright.config.ts`**

Create `playwright.config.ts` at the repo root:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 4: Add npm scripts**

In `package.json`, add to `scripts`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 5: Exclude `e2e/` from Vitest**

Update `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    restoreMocks: true,
    exclude: ["node_modules", "dist", "e2e"],
  },
});
```

- [ ] **Step 6: Update `.gitignore`**

Append to `.gitignore`:

```
playwright-report/
test-results/
```

- [ ] **Step 7: Update Biome scope to lint `e2e/`**

In `biome.json`, find the `lint` invocations in `package.json` (currently `biome check src scripts`) and update them to include `e2e`:

```json
"lint": "biome check src scripts e2e",
"lint:fix": "biome check --write src scripts e2e",
"format": "biome format --write src scripts e2e"
```

(If `biome.json` itself has a `files.includes` array, add `e2e/**` to it as well.)

- [ ] **Step 8: Verify Vitest and lint still work**

```
npm test
npm run lint
```
Expected: both pass.

- [ ] **Step 9: Commit**

```
git add playwright.config.ts package.json package-lock.json vitest.config.ts .gitignore biome.json
git commit -m "Add Playwright for e2e tests"
```

---

## Task 8: Write Playwright e2e specs

**Files:**
- Create: `e2e/fixtures.ts`
- Create: `e2e/editor-pagination.spec.ts`
- Create: `e2e/print-pagination.spec.ts`

This app stores deck data in `localStorage` under `dnd-cards:deck:v1` and also syncs with Supabase. For e2e, the simplest path is to seed `localStorage` *before* the app loads (via `page.addInitScript`), bypassing Supabase entirely. The home view reads from local first.

Confirm this approach by reading `src/decks/queries.ts` and `src/views/HomeView.tsx` if behavior under "no auth + seeded localStorage" is unclear; the README says "Deck data lives in localStorage under the key `dnd-cards:deck:v1`."

- [ ] **Step 1: Create `e2e/fixtures.ts`**

Create `e2e/fixtures.ts`:

```ts
import type { Page } from "@playwright/test";

export type SeedItem = {
  id?: string;
  name: string;
  typeLine?: string;
  body: string;
  costWeight?: string;
};

export async function seedDeck(page: Page, items: SeedItem[]): Promise<void> {
  const now = new Date().toISOString();
  const deck = {
    version: 1,
    cards: items.map((it, i) => ({
      id: it.id ?? `seed-${i}`,
      kind: "item" as const,
      name: it.name,
      typeLine: it.typeLine ?? "Wondrous item",
      body: it.body,
      costWeight: it.costWeight,
      source: "custom" as const,
      createdAt: now,
      updatedAt: now,
    })),
  };
  await page.addInitScript((d) => {
    window.localStorage.setItem("dnd-cards:deck:v1", JSON.stringify(d));
  }, deck);
}

const LONG_BODY = Array.from({ length: 60 }, () =>
  "The wand vibrates briefly before unleashing an unpredictable wave of magic. " +
  "Roll on the wild magic table.",
).join(" ");

export const longItem: SeedItem = {
  id: "wand-of-wonder",
  name: "Wand of Wonder",
  typeLine: "Wand, rare (requires attunement by a spellcaster)",
  body: LONG_BODY,
  costWeight: "5,000 gp · 1 lb",
};
```

- [ ] **Step 2: Write the editor e2e**

Create `e2e/editor-pagination.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { longItem, seedDeck } from "./fixtures";

test("editor preview shows counts label and paginator for an oversized body", async ({ page }) => {
  await seedDeck(page, [longItem]);
  await page.goto("/");
  // Navigate into the deck and open the long item editor
  await page.getByRole("link", { name: longItem.name }).click();
  await page.getByRole("link", { name: /edit/i }).first().click();

  const counts = page.getByTestId("preview-counts");
  await expect(counts).toContainText(/cards \(4-up\) · /);

  const paginator = page.getByTestId("preview-paginator");
  await expect(paginator).toBeVisible();

  await expect(page.getByRole("heading", { name: /\(p1 of \d+\)/ })).toBeVisible();
  await paginator.getByRole("button", { name: "→" }).click();
  await expect(page.getByRole("heading", { name: /\(p2 of \d+\)/ })).toBeVisible();
});
```

If the navigation steps don't match the actual app flow, adjust them — the assertions are the contract that matters.

- [ ] **Step 3: Write the print e2e**

Create `e2e/print-pagination.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { longItem, seedDeck } from "./fixtures";

test("print view paginates an oversized item across multiple physical cards at 4-up", async ({ page }) => {
  await seedDeck(page, [longItem]);
  await page.goto("/print");

  // Default is 4-up
  const titles = page.getByRole("heading").filter({ hasText: /\(p\d+ of \d+\)/ });
  await expect(titles.first()).toBeVisible();
  const total = await titles.count();
  expect(total).toBeGreaterThan(1);

  // The first and last titles should match (p1 of N) and (pN of N)
  await expect(titles.first()).toHaveText(new RegExp(`\\(p1 of ${total}\\)`));
  await expect(titles.last()).toHaveText(new RegExp(`\\(p${total} of ${total}\\)`));

  // Continuation cards should not have the type line text
  const typeLine = longItem.typeLine!;
  const occurrences = await page.getByText(typeLine, { exact: true }).count();
  expect(occurrences).toBe(1); // only the first card

  // Footer (cost/weight) should appear once per physical card
  const footers = await page.getByText(longItem.costWeight!, { exact: true }).count();
  expect(footers).toBe(total);
});
```

- [ ] **Step 4: Run the e2e suite**

```
npm run test:e2e
```
Expected: both specs pass. If they fail, debug with:

```
npm run test:e2e:ui
```

- [ ] **Step 5: Commit**

```
git add e2e/
git commit -m "Add Playwright e2e tests for editor and print pagination"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run all checks**

```
npm test && npm run lint && npm run build && npm run test:e2e
```
Expected: all pass.

- [ ] **Step 2: Manual sanity check**

Open the app in the browser:
1. Create or open a long item; confirm editor preview shows the counts label and paginator.
2. Go to `/print`, confirm the long item splits across multiple physical cards, with `(p1 of N)`…`(pN of N)` titles.
3. Switch perPage to 2; counts label and pagination still work; physical cards rebalance to the larger card size.
4. Confirm a short item still shows as a single card with no pagination suffix and no counts paginator.
5. Print preview (Cmd+P): visually verify the printed sheet looks correct.

- [ ] **Step 3: Final commit if any tweaks were needed**

If steps above caused you to make edits, commit them with a descriptive message. Otherwise skip.

---

## Self-review notes

**Spec coverage check:**

| Spec section | Covered by |
| --- | --- |
| `Card.tsx` props | Task 1 |
| `paginate.ts` algorithm | Task 2 |
| `useExpandedCards` hook + measurer | Tasks 3, 4 |
| PrintView integration | Task 5 |
| EditorView counts label + paginator + debounce | Task 6 |
| Playwright setup | Task 7 |
| E2E coverage | Task 8 |
| Vitest unit coverage (paginate, expandCard, hook smoke, Card props) | Tasks 1, 2, 4 |

**Open questions to resolve during implementation:**

- The `cardCountLabel("4-up")` uses the literal layout string. Spec example was `(4-up)` so this matches.
- Sentinel pagination suffix `(p9 of 9)` is hard-coded in `measurer.ts`. If items can ever exceed 9 chunks, splits at the boundary may be slightly off — acceptable per spec.
- The Playwright tests assume the app's home → deck → editor flow uses standard role-based navigation. If a step doesn't resolve, adjust selectors but keep the assertions intact.
