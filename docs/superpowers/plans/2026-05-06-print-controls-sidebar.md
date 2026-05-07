# Print controls sidebar — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wide horizontal print-settings panel in `PrintView` with a sticky left sidebar next to the sheet preview.

**Architecture:** PrintView's root becomes a 2-column CSS grid (14rem sidebar | 1fr sheet column). The sidebar carries the existing panel chrome and contains the same controls reorganized vertically: cards-per-page select (label above), Print backs switch + helptext, divider, full-width Print button, margins tip. Below 1300px viewport, the grid collapses to a single column. PrintView opts into a wider 1400px container via a `:has()` rule scoped to its `data-print-view` attribute, so the 2-up landscape sheet (1056px) fits next to the sidebar.

**Tech Stack:** React 18 + TypeScript + Vite, `react-aria-components` (via `src/lib/ui/Switch.tsx`, `src/lib/ui/Button.tsx`), CSS modules with project screen tokens (`--color-*`, `--space-*`, `--radius-*`). Vitest + RTL for tests; Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-05-06-print-controls-sidebar-design.md`

**Conventions for the executor:**
- Per `CLAUDE.md`: `npm test`, `npm run dev`, `npm run build` are pre-approved; ask before `npm install`.
- Tests use `getByRole(...)` over text/class selectors. The existing PrintView tests should keep passing unchanged after the layout reorganization.
- Biome's formatter is authoritative — accept its reformatting if it changes whitespace or import ordering.
- Default to no comments. Only add one when the *why* is non-obvious.
- Don't push or create PRs.
- Work happens on the existing `card-backs` branch (current branch).

---

## Task 1: Widen the page container for PrintView via `:has()`

A scoped CSS rule in the global app shell — `.main` gets a wider `max-width` only when it contains a `data-print-view` element. Doesn't affect any other route.

**Files:**
- Modify: `src/app/root.module.css`

- [ ] **Step 1: Add the `:has()` rule**

In `src/app/root.module.css`, append this rule after the existing `.main` rule (around line 89-95). The full updated `.main` block:

```css
.main {
  flex: 1;
  padding: var(--space-5);
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.main:has([data-print-view]) {
  max-width: 1400px;
}
```

The `@media print` block at the bottom of the file already overrides `max-width` to `none` for print runs and is unaffected.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS — all tests green. This change has no behavioral effect on tests; it's a layout-only widening that activates once PrintView (Task 2) sets the `data-print-view` attribute. Running the suite confirms nothing else regressed.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/root.module.css
git commit -m "feat(print): widen main container to 1400px on PrintView via :has()"
```

---

## Task 2: Restructure PrintView into sidebar + sheet column

Replace the top-of-page `.panel` with a sticky `.sidebar` inside a 2-column grid. The sheet column is the existing `.sheet`, unchanged. PrintView's root carries the `data-print-view` attribute so Task 1's widening rule activates.

The state, queries, page emission, and back-page interleaving logic stay identical. Only DOM structure and CSS change.

**Files:**
- Modify: `src/views/PrintView.tsx`
- Modify: `src/views/PrintView.module.css`
- Test: `src/views/PrintView.test.tsx` (no test changes; existing tests must keep passing)

- [ ] **Step 1: Run the existing PrintView tests to capture the baseline**

Run: `npm test -- --run src/views/PrintView`

Expected: PASS — 11 tests green. This is the regression check that Task 2 must preserve.

- [ ] **Step 2: Replace `src/views/PrintView.module.css`**

Overwrite the file with:

```css
/* === Screen-only UI (hidden in @media print) === */

.root {
  display: grid;
  grid-template-columns: 14rem 1fr;
  gap: var(--space-5);
  align-items: start;
}

.sidebar {
  position: sticky;
  top: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.fieldLabel {
  font-weight: 500;
}

.select {
  font: inherit;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.select:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.switchBlock {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.helptext {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.helptext p {
  margin: 0;
}

.helptext p + p {
  margin-top: var(--space-1);
}

.divider {
  border: 0;
  border-top: 1px solid var(--color-border);
  margin: 0;
}

.printButton {
  width: 100%;
}

.tip {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

@media (max-width: 1299px) {
  .root {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static;
  }
}

/* === Sheet preview (on-screen) + print output === */

.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  align-items: center;
}

.page {
  background: var(--print-color-paper);
  padding: 0.5in;
  box-sizing: border-box;
  display: grid;
  box-shadow: var(--print-shadow-page);
  page-break-after: always;
  break-after: page;
}

.perPage4 {
  width: 8.5in;
  height: 11in;
  grid-template-columns: 3.75in 3.75in;
  grid-template-rows: 5in 5in;
  gap: 1px; /* blade kerf for cutting */
  justify-content: center;
  align-content: center;
}

.perPage2 {
  width: 11in;
  height: 8.5in;
  grid-template-columns: 5in 5in;
  grid-template-rows: 7.5in;
  gap: 1px; /* blade kerf for cutting */
  justify-content: center;
  align-content: center;
}

.slot {
  display: flex;
  align-items: center;
  justify-content: center;
}

@media print {
  .sidebar {
    display: none;
  }
  .root {
    display: block;
  }
  .sheet {
    gap: 0;
  }
  .page {
    box-shadow: none;
    padding: 0;
    break-after: page;
  }
  @page perPage2 {
    size: letter landscape;
  }
  .perPage2 {
    page: perPage2;
  }
}
```

Notes:
- `.panel`, `.row`, `.rowLabel` classes are removed — replaced by `.sidebar`, `.field`, `.fieldLabel`, `.switchBlock`. The sheet-side classes (`.sheet`, `.page`, `.perPage4`, `.perPage2`, `.slot`) are unchanged byte-for-byte; PrintView tests reference `styles.perPage2` and `styles.perPage4` directly.
- `position: sticky` works because the ancestor chain (`.shell → .main → .root → .sidebar`) has no `overflow: hidden`. Verified at spec time.
- The narrow-viewport media query collapses to a single column AND drops sticky (otherwise the sidebar would stick at the top of an unrelated long sheet column when stacked).
- `@media print` hides `.sidebar` (replacing the old `.panel { display: none }`) and resets `.root` to block layout so print runs flow as a simple page sequence.

- [ ] **Step 3: Replace `src/views/PrintView.tsx`**

Overwrite the file with:

```tsx
import { Fragment, useId, useState } from "react";
import { imposeBackPage } from "../cards/backImposition";
import { Card, type CardsPerPage } from "../cards/Card";
import { CardBack } from "../cards/CardBack";
import type { PhysicalCard } from "../cards/expandCard";
import { isRenderableCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { useDeckCards } from "../decks/queries";
import { Button } from "../lib/ui/Button";
import { LoadingState } from "../lib/ui/LoadingState";
import { Switch } from "../lib/ui/Switch";
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
  const perPageId = useId();

  const cards = cardsQuery.data ?? [];
  const printable = cards.filter(isRenderableCard);
  const { physicalCards } = useExpandedCards(printable, perPage);

  if (cardsQuery.isLoading) return <LoadingState />;

  const pages = physicalCards.length === 0 ? [] : chunk(physicalCards, perPage);
  const flipEdge = perPage === 4 ? "long edge" : "short edge";
  const flipLabel = perPage === 4 ? "Book" : "Tablet";

  return (
    <div className={styles.root} data-print-view>
      <aside className={styles.sidebar}>
        <div className={styles.field}>
          <label htmlFor={perPageId} className={styles.fieldLabel}>
            Cards per page
          </label>
          <select
            id={perPageId}
            className={styles.select}
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value) as CardsPerPage)}
          >
            <option value={4}>4 per page (portrait)</option>
            <option value={2}>2 per page (landscape)</option>
          </select>
        </div>

        <div className={styles.switchBlock}>
          <Switch isSelected={printBacks} onChange={setPrintBacks}>
            Print backs
          </Switch>
          <div className={styles.helptext}>
            <p>Adds a second page of card backs for double-sided printing.</p>
            {printBacks && (
              <p>
                In the print dialog, choose <em>Flip on {flipEdge}</em> (sometimes
                labelled <em>{flipLabel}</em>).
              </p>
            )}
          </div>
        </div>

        <hr className={styles.divider} />

        <Button
          className={styles.printButton}
          variant="primary"
          size="lg"
          onPress={() => window.print()}
          isDisabled={printable.length === 0}
        >
          Print
        </Button>
        <p className={styles.tip}>
          Tip: in the print dialog, choose <em>Margins: None</em> and uncheck{" "}
          <em>Headers and footers</em> for best results.
        </p>
      </aside>

      <div>
        {printable.length === 0 && <p>No printable cards in this deck yet.</p>}

        <div className={styles.sheet}>
          {pages.map((pageCards) => {
            const pageKey = `${pageCards[0]?.card.id ?? "empty"}-${pageCards[0]?.pagination?.page ?? 0}`;
            return (
              <Fragment key={`page-${pageKey}`}>
                <div
                  data-testid="page"
                  data-page-side="front"
                  className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
                >
                  {pageCards.map((entry) => (
                    <div
                      key={`${entry.card.id}-${entry.pagination?.page ?? 0}`}
                      className={styles.slot}
                    >
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
                    {imposeBackPage(pageCards, perPage, COLS).map((entry, slotIndex) => {
                      const slotKey = entry
                        ? `${entry.card.id}-${entry.pagination?.page ?? 0}`
                        : `${pageKey}-empty-${slotIndex}`;
                      return (
                        <div key={`back-${slotKey}`} className={styles.slot}>
                          {entry ? getBackContentFor(entry, perPage) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

Key changes from the prior version:
- Outermost `<div>` is now `className={styles.root}` with `data-print-view` (activates Task 1's widening rule).
- The wrapping `<label>` around the select becomes a stacked `<label htmlFor>` + `<select id>` using `useId()` for the association. The accessible name is preserved, so `getByRole("combobox", { name: /cards per page/i })` still works.
- `<aside className={styles.sidebar}>` replaces the old `.panel` div; controls inside are reordered into the sidebar's vertical layout.
- The Print button gets `className={styles.printButton}` so its `width: 100%` rule applies.
- The "no printable cards" message and `.sheet` are wrapped in a sibling `<div>` so the grid has exactly two children (sidebar + sheet column).
- The "Tip: Margins: None…" text is now a `<p>` directly under the Print button (was inline next to it in the old `.row`).

- [ ] **Step 4: Run the existing PrintView tests**

Run: `npm test -- --run src/views/PrintView`

Expected: PASS — all 11 tests green. The role-based queries (`combobox`, `switch`, `button`) and class-based assertions (`styles.perPage2`) all survive the layout reorganization.

If a test fails, the most likely cause is one of:
- The `useId()`-generated id isn't being associated correctly — verify the `<label htmlFor>` and `<select id>` use the same value.
- The Switch's accessible name changed — verify `<Switch>...Print backs</Switch>` is unchanged.
- A class name was renamed — `styles.perPage2` and `styles.perPage4` must still exist on `.page` divs.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`

Expected: PASS — entire suite green. No regressions in other views.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`

Expected: no errors. If Biome reformats imports or whitespace, run `npm run lint:fix` and accept.

- [ ] **Step 8: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.module.css
git commit -m "feat(print): replace top panel with sticky left sidebar"
```

---

## Task 3: Manual visual verification

Code-level checks pass; this step verifies the layout renders correctly across viewport widths and that sticky behavior works. Per `CLAUDE.md`: *"For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete."*

**Files:** none (no code change).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Open the app and navigate to a deck's print view (any deck with at least 4 cards is fine; if none exists, create one or seed via the editor).

- [ ] **Step 2: Wide viewport (≥ 1400px)**

Resize the browser to ≥ 1400px wide. Verify:
- The sidebar is on the left (~14rem wide), the sheet preview is on the right.
- The sidebar has cream `--color-surface-2` background, border, rounded corners — same chrome as the old panel.
- Inside the sidebar, top-to-bottom: "Cards per page" label + select; "Print backs" switch with helptext under it; horizontal divider; full-width "Print" button; "Tip: Margins: None…" caption.
- The sheet pages center within the right column.
- Switch the dropdown to "2 per page (landscape)" — the wider (11in) sheet still fits without horizontal scroll.

- [ ] **Step 3: Sticky behavior**

With a deck that produces multiple pages (5+ cards at 4-up gives 2 pages; toggle backs on for 4 pages), scroll the page down. Verify:
- The sidebar stays pinned to the top of the viewport while pages scroll past.
- The "Print" button remains clickable from any scroll position.

- [ ] **Step 4: Narrow viewport (< 1300px)**

Resize the browser below 1300px (e.g., 1100px). Verify:
- The grid collapses: sidebar is now above the sheet preview, full-width.
- The sidebar is no longer sticky (it scrolls with the page).
- Controls remain functional.

- [ ] **Step 5: Toggle behaviors**

At any viewport width:
- Toggle "Print backs" on. Verify the duplex-flip tip ("In the print dialog, choose *Flip on long edge*…") appears below the switch.
- Switch "Cards per page" to 2-up. Verify the tip text changes to "*Flip on short edge*… *Tablet*".
- Toggle backs off. Verify the duplex tip disappears; the always-on "Adds a second page…" hint remains.

- [ ] **Step 6: Print preview (optional but recommended)**

Open the browser's print preview (Cmd-P / Ctrl-P). Verify:
- The sidebar is hidden in print output (the `@media print` rule).
- Pages flow as before — no layout regression vs. main.

- [ ] **Step 7: Stop the dev server**

Stop the dev server (Ctrl-C in its terminal) once verification passes.

This task does not produce a commit. If any step fails, return to Task 2 to address the issue and re-run verification.
