# Optional decorative card backs in print — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users print decorative card backs alongside fronts in `PrintView`, so cut-out cards can be used double-sided after a duplex print run.

**Architecture:** A pure imposition helper (`backImposition.ts`) maps front slot indices to mirrored back slot indices. A standalone `CardBack` component renders the front's outer border and a single centered icon, sharing physical dimensions with `Card` for byte-identical alignment. `PrintView` adds a `printBacks` toggle (default off, not persisted) that interleaves a back page after each front page, with slots filled via the imposition helper. The icon on each back is the front's resolved iconKey (`card.iconKey ?? pickIconKey(card)`) — no new asset, no new fallback.

**Tech Stack:** React 18 + TypeScript + Vite, `react-aria-components` (via `src/lib/ui/Switch.tsx`), Vitest + RTL + `@testing-library/user-event`, `fishery` + `@faker-js/faker` for factories, Biome for lint/format. Print-scoped CSS tokens (`--print-*`) only inside `Card.module.css` and `CardBack.module.css`.

**Spec:** `docs/superpowers/specs/2026-05-06-print-backs-design.md`

**Conventions for the executor:**
- Per `CLAUDE.md`: `npm test`, `npm run dev`, `npm run build` are pre-approved; ask before `npm install`.
- Tests use `getByRole(...)` over text/class selectors. Factories pass no values they don't assert on.
- Biome's formatter is authoritative — accept its reformatting if it changes whitespace or import ordering.
- Default to no comments. Only add one when the *why* is non-obvious.
- Don't push or create PRs.
- Work happens on the existing `card-backs` branch (current branch).
- The "manual print verification" section of the spec is the user's responsibility; this plan stops at code-level done. Surface that gate in the final task.

---

## Task 1: Add `backImposition` helper with tests

The helper is layout-agnostic and pure. Tests pin the slot-mapping rule for the two supported layouts (4-up, 2-up) and the partial-page case where the back page must be a *dense* array so CSS grid renders empty slots correctly.

**Files:**
- Create: `src/cards/backImposition.ts`
- Create: `src/cards/backImposition.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/cards/backImposition.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { backSlotIndex, imposeBackPage } from "./backImposition";

describe("backSlotIndex", () => {
  test("4-up portrait (cols=2, rows=2) — mirrors each pair", () => {
    expect(backSlotIndex(0, 2)).toBe(1);
    expect(backSlotIndex(1, 2)).toBe(0);
    expect(backSlotIndex(2, 2)).toBe(3);
    expect(backSlotIndex(3, 2)).toBe(2);
  });

  test("2-up landscape (cols=2, rows=1) — swaps the pair", () => {
    expect(backSlotIndex(0, 2)).toBe(1);
    expect(backSlotIndex(1, 2)).toBe(0);
  });

  test("1-column layout — no-op (degrades correctly)", () => {
    expect(backSlotIndex(0, 1)).toBe(0);
    expect(backSlotIndex(1, 1)).toBe(1);
    expect(backSlotIndex(2, 1)).toBe(2);
  });
});

describe("imposeBackPage", () => {
  test("full 4-up page: [A,B,C,D] → [B,A,D,C]", () => {
    expect(imposeBackPage(["A", "B", "C", "D"], 4, 2)).toEqual(["B", "A", "D", "C"]);
  });

  test("full 2-up page: [A,B] → [B,A]", () => {
    expect(imposeBackPage(["A", "B"], 2, 2)).toEqual(["B", "A"]);
  });

  test("partial last 4-up page (3 fronts) → length-4 dense array with one undefined slot", () => {
    const result = imposeBackPage(["A", "B", "C"], 4, 2);
    expect(result).toEqual(["B", "A", undefined, "C"]);
    expect(result).toHaveLength(4);
    // Density check: index 2 must exist as an own property, not a sparse hole.
    // A sparse array would let CSS grid compress entries left-to-right and break
    // duplex alignment.
    expect(2 in result).toBe(true);
  });

  test("empty front page → length-`slotsPerPage` array of undefineds", () => {
    const result = imposeBackPage([] as string[], 4, 2);
    expect(result).toEqual([undefined, undefined, undefined, undefined]);
    expect(result).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/cards/backImposition`
Expected: FAIL — module `./backImposition` cannot be resolved.

- [ ] **Step 3: Implement the helper**

Create `src/cards/backImposition.ts`:

```ts
export function backSlotIndex(frontIndex: number, cols: number): number {
  const row = Math.floor(frontIndex / cols);
  const col = frontIndex % cols;
  return row * cols + (cols - 1 - col);
}

export function imposeBackPage<T>(
  frontPage: T[],
  slotsPerPage: number,
  cols: number,
): (T | undefined)[] {
  const out: (T | undefined)[] = new Array(slotsPerPage).fill(undefined);
  for (let i = 0; i < frontPage.length; i++) {
    out[backSlotIndex(i, cols)] = frontPage[i];
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/cards/backImposition`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/cards/backImposition.ts src/cards/backImposition.test.ts
git commit -m "feat(print): add backImposition helper for duplex slot mirroring"
```

---

## Task 2: Add `CardBack` component with tests

A standalone component, not a `Card` variant. Same outer dimensions, border, and radius as `Card.module.css` — these values must match byte-for-byte so duplex alignment works. The icon comes from the same `card.iconKey ?? pickIconKey(card)` chain `Card.tsx:67` uses.

**Files:**
- Create: `src/cards/CardBack.tsx`
- Create: `src/cards/CardBack.module.css`
- Create: `src/cards/CardBack.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/cards/CardBack.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CardBack } from "./CardBack";
import { itemCardFactory, spellCardFactory } from "./factories";

describe("<CardBack>", () => {
  test("renders an icon SVG using the card's explicit iconKey", () => {
    const card = itemCardFactory.build({ iconKey: "trident" });
    render(<CardBack card={card} cardsPerPage={4} />);
    const root = screen.getByTestId("card-back");
    expect(root.querySelector("svg")).not.toBeNull();
  });

  test("renders the heuristic-picked icon when iconKey is unset", () => {
    const card = itemCardFactory.build({
      name: "Flame Tongue Trident",
      iconKey: undefined,
    });
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back").querySelector("svg")).not.toBeNull();
  });

  test("renders the heuristic-picked icon for a spell card with iconKey unset", () => {
    const card = spellCardFactory.build({
      name: "Fireball",
      headerTags: ["3rd-level evocation"],
      iconKey: undefined,
    });
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back").querySelector("svg")).not.toBeNull();
  });

  test("does not crash for a stale or unknown iconKey", () => {
    const card = itemCardFactory.build({ iconKey: "definitely-removed-icon" });
    expect(() => render(<CardBack card={card} cardsPerPage={4} />)).not.toThrow();
  });

  test("applies the 4-up layout class at cardsPerPage=4", () => {
    const card = itemCardFactory.build();
    const { container } = render(<CardBack card={card} cardsPerPage={4} />);
    const root = container.querySelector('[data-testid="card-back"]');
    expect(root?.className).toMatch(/perPage4/);
  });

  test("applies the 2-up layout class at cardsPerPage=2", () => {
    const card = itemCardFactory.build();
    const { container } = render(<CardBack card={card} cardsPerPage={2} />);
    const root = container.querySelector('[data-testid="card-back"]');
    expect(root?.className).toMatch(/perPage2/);
  });

  test("exposes the card id on the root for slot-order verification", () => {
    const card = itemCardFactory.build();
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back")).toHaveAttribute("data-card-id", card.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/cards/CardBack`
Expected: FAIL — module `./CardBack` cannot be resolved.

- [ ] **Step 3: Create the CSS module**

Create `src/cards/CardBack.module.css`:

```css
.card {
  --card-base: 17px;

  font-size: var(--card-base);
  width: var(--card-width);
  height: var(--card-height);
  background: var(--print-color-paper);
  color: var(--print-color-ink);
  border: 2px solid var(--print-color-border-strong);
  border-radius: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  box-shadow: var(--print-shadow-card);
}

.perPage4 {
  --card-base: 17px;
  --card-width: 3.75in;
  --card-height: 5in;
}

.perPage2 {
  --card-base: 24px;
  --card-width: 5in;
  --card-height: 7.5in;
}

.icon {
  width: 50%;
  height: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--print-color-ink);
}

.icon svg {
  width: 100%;
  height: 100%;
}

@media print {
  .card {
    box-shadow: none;
  }
}
```

These width/height/border/border-radius values must match `Card.module.css` lines 5-30 byte-for-byte. If a future change touches Card's frame, change both files together.

- [ ] **Step 4: Implement the component**

Create `src/cards/CardBack.tsx`:

```tsx
import type { CardsPerPage } from "./Card";
import styles from "./CardBack.module.css";
import { pickIconKey } from "./iconRules";
import { ResolvedIcon } from "./resolveIcon";
import type { RenderableCard } from "./types";

type Props = {
  card: RenderableCard;
  cardsPerPage: CardsPerPage;
};

export function CardBack({ card, cardsPerPage }: Props) {
  const layoutClass = cardsPerPage === 4 ? styles.perPage4 : styles.perPage2;
  const iconKey = card.iconKey ?? pickIconKey(card);
  return (
    <div
      className={`${styles.card} ${layoutClass}`}
      data-testid="card-back"
      data-role="card-back-root"
      data-card-id={card.id}
    >
      <div className={styles.icon} aria-hidden="true">
        <ResolvedIcon iconKey={iconKey} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/cards/CardBack`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/cards/CardBack.tsx src/cards/CardBack.module.css src/cards/CardBack.test.tsx
git commit -m "feat(print): add CardBack component for decorative back tiles"
```

---

## Task 3: Wire the "Print backs" toggle into PrintView

Add `printBacks` state + a `Switch` primitive, interleave back pages after front pages when on, and show a layout-specific duplex-flip tip only when on. The page-emission change is gated on `printBacks` so the toggle-off path is byte-identical to today.

The local `getBackContentFor` helper exists as a named seam: future continuation-on-back work modifies only that one function.

**Files:**
- Modify: `src/views/PrintView.tsx`
- Test: `src/views/PrintView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/views/PrintView.test.tsx` (inside the `describe("<PrintView>", ...)` block, after the existing tests):

```tsx
test("does not emit back pages when the toggle is off", async () => {
  const cards = makeCardRow.buildList(4);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  expect(document.querySelectorAll('[data-page-side="back"]')).toHaveLength(0);
});

test("emits one back page per front page when the toggle is on", async () => {
  const cards = makeCardRow.buildList(5);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(2));
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  expect(screen.getAllByTestId("page")).toHaveLength(4);
  expect(document.querySelectorAll('[data-page-side="front"]')).toHaveLength(2);
  expect(document.querySelectorAll('[data-page-side="back"]')).toHaveLength(2);
});

test("places back tiles in the horizontally-mirrored slot order at 4-up", async () => {
  const cards = makeCardRow.buildList(4);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
  expect(backPage).not.toBeNull();
  // Read the rendered slot order from the back page's data-card-id attrs and
  // assert it matches the imposition rule: [A, B, C, D] front → [B, A, D, C] back.
  // The back page's direct children are the slot divs in DOM (= CSS grid) order.
  const slots = Array.from(backPage.children) as HTMLElement[];
  expect(slots).toHaveLength(4);
  const slotIds = slots.map(
    (s) => s.querySelector<HTMLElement>("[data-card-id]")?.dataset.cardId ?? null,
  );
  expect(slotIds).toEqual([cards[1].id, cards[0].id, cards[3].id, cards[2].id]);
});

test("partial last front page produces a back page with only the populated slots filled", async () => {
  const cards = makeCardRow.buildList(3);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
  expect(backPage).not.toBeNull();
  // 3 fronts → 3 back tiles; the 4th slot is an empty .slot div.
  expect(backPage.querySelectorAll('[data-role="card-back-root"]')).toHaveLength(3);
});

test("shows the long-edge duplex tip at 4-up when backs are on", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  // Toggle off: tip absent
  expect(screen.queryByText(/long edge|short edge/i)).not.toBeInTheDocument();
  // Toggle on: tip appears mentioning "long edge"
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  expect(screen.getByText(/long edge/i)).toBeInTheDocument();
});

test("tip switches to short-edge when layout changes to 2-up", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  expect(screen.getByText(/long edge/i)).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: /cards per page/i }),
    "2",
  );
  expect(screen.queryByText(/long edge/i)).not.toBeInTheDocument();
  expect(screen.getByText(/short edge/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/views/PrintView`
Expected: FAIL — `getByRole("switch", ...)` finds no element; "long edge" text not in document; back-side pages not emitted.

- [ ] **Step 3: Update `PrintView.tsx`**

Replace the contents of `src/views/PrintView.tsx` with:

```tsx
import { Fragment, useState } from "react";
import { Card, type CardsPerPage } from "../cards/Card";
import { CardBack } from "../cards/CardBack";
import { imposeBackPage } from "../cards/backImposition";
import type { PhysicalCard } from "../cards/expandCard";
import { isRenderableCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { Button } from "../lib/ui/Button";
import { LoadingState } from "../lib/ui/LoadingState";
import { Switch } from "../lib/ui/Switch";
import { useDeckCards } from "../decks/queries";
import styles from "./PrintView.module.css";

type Props = { deckId: string };

const COLS = 2;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const getBackContentFor = (entry: PhysicalCard, perPage: CardsPerPage) => (
  <CardBack card={entry.card} cardsPerPage={perPage} />
);

export function PrintView({ deckId }: Props) {
  const cardsQuery = useDeckCards(deckId);
  const [perPage, setPerPage] = useState<CardsPerPage>(4);
  const [printBacks, setPrintBacks] = useState(false);

  const cards = cardsQuery.data ?? [];
  const printable = cards.filter(isRenderableCard);
  const { physicalCards } = useExpandedCards(printable, perPage);

  if (cardsQuery.isLoading) return <LoadingState />;

  const pages = physicalCards.length === 0 ? [] : chunk(physicalCards, perPage);
  const flipEdge = perPage === 4 ? "long edge" : "short edge";
  const flipLabel = perPage === 4 ? "Book" : "Tablet";

  return (
    <div>
      <div className={styles.controls}>
        <select
          aria-label="Cards per page"
          value={perPage}
          onChange={(e) => setPerPage(Number(e.target.value) as CardsPerPage)}
        >
          <option value={4}>4 per page (portrait)</option>
          <option value={2}>2 per page (landscape)</option>
        </select>
        <Switch isSelected={printBacks} onChange={setPrintBacks}>
          Print backs
        </Switch>
        <Button
          variant="primary"
          onPress={() => window.print()}
          isDisabled={printable.length === 0}
        >
          Print
        </Button>
        <span className={styles.tip}>
          Tip: in the print dialog, choose <em>Margins: None</em> and uncheck{" "}
          <em>Headers and footers</em> for best results.
        </span>
        {printBacks && (
          <span className={styles.tip}>
            For double-sided printing, choose <em>Flip on {flipEdge}</em> in the
            print dialog (sometimes labelled <em>{flipLabel}</em>).
          </span>
        )}
      </div>

      {printable.length === 0 && <p>No printable cards in this deck yet.</p>}

      <div className={styles.sheet}>
        {pages.map((pageCards, pageIndex) => (
          <Fragment key={`page-${pageIndex}`}>
            <div
              data-testid="page"
              data-page-side="front"
              className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
            >
              {pageCards.map((entry) => (
                <div key={`${entry.card.id}-${entry.pagination?.page ?? 0}`} className={styles.slot}>
                  <Card
                    card={entry.card}
                    cardsPerPage={perPage}
                    bodyOverride={entry.bodyChunk}
                    pagination={entry.pagination}
                  />
                </div>
              ))}
            </div>
            {printBacks && (
              <div
                data-testid="page"
                data-page-side="back"
                className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
              >
                {imposeBackPage(pageCards, perPage, COLS).map((entry, slotIndex) => (
                  <div key={`back-${pageIndex}-${slotIndex}`} className={styles.slot}>
                    {entry ? getBackContentFor(entry, perPage) : null}
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
```

Notes:
- `COLS = 2` is the only layout-specific assumption in page emission. If a future layout adds a 1-col or 3-col mode, derive `cols` from `perPage` here.
- The existing front-page key was `page-${pageCards[0]?.card.id ?? "empty"}-${pagination.page}`. Switching to `page-${pageIndex}` is fine because the Fragment now owns uniqueness across front/back, and `pageIndex` is stable for a given render.
- The new `data-page-side` attribute is test-only.

- [ ] **Step 4: Run the new and existing PrintView tests**

Run: `npm test -- --run src/views/PrintView`
Expected: PASS — all PrintView tests green (existing 5 + new 6 = 11).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — entire suite green. No regressions.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no errors. If Biome reformats imports or whitespace, run `npm run lint:fix` and accept.

- [ ] **Step 8: Visual check via dev server**

Run: `npm run dev` (in a background-friendly terminal).
Open the app, navigate to a deck's print view. Verify:
- The "Print backs" switch appears in the controls strip.
- With backs off: page count and layout match today's output.
- With backs on (4-up): below each front page in the on-screen sheet preview, a second page appears with decorative backs in mirrored slot order.
- Switch to 2-up: tip text changes from "long edge" to "short edge".
- Stop the dev server when done.

- [ ] **Step 9: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.test.tsx
git commit -m "feat(print): add 'Print backs' toggle with mirrored back pages"
```

---

## Task 4: Surface the manual print verification gate

The spec marks duplex print verification as **mandatory before merging**. Code-level work is now done; this task hands the manual gate to the user.

**Files:** none (no code change).

- [ ] **Step 1: Print to the user — do not mark the feature complete**

Output a message that summarizes:
- Code work is done; tests, typecheck, lint pass.
- Three manual print checks remain (from spec):
  1. 4-up portrait, backs on, duplex long-edge — verify backs land behind fronts (≤1 mm tolerance).
  2. 2-up landscape, backs on, duplex short-edge — same alignment check.
  3. If a duplex printer isn't available: print front and back separately and overlay against a window.
- The PR description should record the result of these checks.

Do **not** propose `git push` or `gh pr create` — that's the user's call per `CLAUDE.md`.
