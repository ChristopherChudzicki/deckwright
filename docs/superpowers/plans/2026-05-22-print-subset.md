# Print a Subset of a Deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users print an arbitrary subset of a deck's renderable cards via a sidebar count + a modal picker, instead of always printing the whole deck.

**Architecture:** `PrintView` gains an ephemeral `Set<CardId>` of selected cards (defaults to all renderable cards, owned by a `usePrintSelection` hook). The sidebar shows a live count + a "Choose cards…" button + a "Select all" link. A new `PrintSelectionModal` owns a draft selection edited via a Kind filter, name search, recency/name sort, per-row checkboxes, and a tri-state header checkbox; on Apply it commits the draft back to `PrintView`, which filters cards before they enter the existing print pipeline.

**Tech Stack:** React 18 + TypeScript, `react-aria-components` (Checkbox, RadioGroup, Dialog via the repo's `DialogShell`), CSS modules, Vitest + React Testing Library + `@testing-library/user-event`, MSW for the deck-cards query.

**Spec:** `docs/superpowers/specs/2026-05-19-print-subset-design.md`

---

## File structure

**New files:**
- `src/views/usePrintSelection.ts` — hook owning the selection `Set` + init-once-per-deck logic + `selectAll`.
- `src/views/usePrintSelection.test.tsx` — hook unit tests.
- `src/views/printSelectionLabel.ts` — pure `selectionCountLabel(selected, total)` helper for the sidebar count phrasing.
- `src/views/printSelectionLabel.test.ts` — helper unit tests.
- `src/lib/relativeTime.ts` — `relativeTime(iso, now?)` → "2 hours ago".
- `src/lib/relativeTime.test.ts` — helper unit tests.
- `src/lib/ui/Checkbox.tsx` — RAC `Checkbox` wrapper supporting `isIndeterminate`.
- `src/lib/ui/Checkbox.module.css` — checkbox styles.
- `src/lib/ui/Checkbox.test.tsx` — primitive tests.
- `src/views/PrintSelectionModal.tsx` — the picker modal.
- `src/views/PrintSelectionModal.module.css` — picker layout.
- `src/views/PrintSelectionModal.test.tsx` — modal behavior tests.

**Modified files:**
- `src/views/PrintView.tsx` — selection state wiring, sidebar additions, filtered pipeline, modal mount.
- `src/views/PrintView.module.css` — sidebar count / link styles, empty-selection message.
- `src/views/PrintView.test.tsx` — integration tests for narrowing/empty/select-all.
- `src/lib/ui/README.md` — add `Checkbox` to the catalog.

**Reused as-is (do not re-derive):**
- `src/decks/deckListing.ts` — `deckListing(cards, { kind, sort })` does Kind filtering + recency/name sort with stable tie-breakers. `DeckKindFilter` = `"all" | "item" | "spell"`, `DeckSort` = `"updated" | "name"`.
- `src/cards/types.ts` — `RenderableCard`, `CardId`, `isRenderableCard`.
- `src/lib/ui/DialogShell.tsx` (string `aria-label` only), `Button`, `Input`.

---

## Stage 1 — Selection plumbing + sidebar

Shippable on its own. The "Choose cards…" button opens a placeholder until Stage 3. Logic lives in two tested pure/near-pure units; the cross-cutting narrow/empty integration tests arrive in Stage 3 once the modal can drive those states.

### Task 1: `usePrintSelection` hook

**Files:**
- Create: `src/views/usePrintSelection.ts`
- Test: `src/views/usePrintSelection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { usePrintSelection } from "./usePrintSelection";

describe("usePrintSelection", () => {
  test("initializes to all renderable ids once data is ready", () => {
    const { result } = renderHook(
      ({ ids, ready }) => usePrintSelection("d1", ids, ready),
      { initialProps: { ids: ["a", "b", "c"], ready: true } },
    );
    expect([...result.current.selected].sort()).toEqual(["a", "b", "c"]);
  });

  test("does not initialize until ready is true", () => {
    const { result, rerender } = renderHook(
      ({ ids, ready }) => usePrintSelection("d1", ids, ready),
      { initialProps: { ids: [] as string[], ready: false } },
    );
    expect(result.current.selected.size).toBe(0);
    rerender({ ids: ["a", "b"], ready: true });
    expect([...result.current.selected].sort()).toEqual(["a", "b"]);
  });

  test("a refetch of the same deck does not reset a narrowed selection", () => {
    const { result, rerender } = renderHook(
      ({ ids, ready }) => usePrintSelection("d1", ids, ready),
      { initialProps: { ids: ["a", "b", "c"], ready: true } },
    );
    act(() => result.current.setSelected(new Set(["a"])));
    expect([...result.current.selected]).toEqual(["a"]);
    // Same deckId, new array identity (simulated background refetch).
    rerender({ ids: ["a", "b", "c"], ready: true });
    expect([...result.current.selected]).toEqual(["a"]);
  });

  test("switching deckId re-initializes to all", () => {
    const { result, rerender } = renderHook(
      ({ deckId, ids }) => usePrintSelection(deckId, ids, true),
      { initialProps: { deckId: "d1", ids: ["a", "b"] } },
    );
    act(() => result.current.setSelected(new Set(["a"])));
    rerender({ deckId: "d2", ids: ["x", "y", "z"] });
    expect([...result.current.selected].sort()).toEqual(["x", "y", "z"]);
  });

  test("selectAll restores the full renderable set", () => {
    const { result } = renderHook(() => usePrintSelection("d1", ["a", "b", "c"], true));
    act(() => result.current.setSelected(new Set(["a"])));
    act(() => result.current.selectAll());
    expect([...result.current.selected].sort()).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/views/usePrintSelection.test.tsx`
Expected: FAIL — `usePrintSelection` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { useEffect, useRef, useState } from "react";
import type { CardId } from "../cards/types";

export type PrintSelection = {
  selected: Set<CardId>;
  setSelected: (next: Set<CardId>) => void;
  selectAll: () => void;
};

/**
 * Owns the print selection as a Set of card ids. Initializes to "all
 * renderable" exactly once per deckId (when `ready` first turns true),
 * so a background refetch — which hands us a new `renderableIds` array
 * identity — does not silently wipe a narrowed selection. Switching to a
 * different deckId re-initializes.
 */
export function usePrintSelection(
  deckId: string,
  renderableIds: CardId[],
  ready: boolean,
): PrintSelection {
  const [selected, setSelected] = useState<Set<CardId>>(() => new Set());
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (ready && initializedFor.current !== deckId) {
      initializedFor.current = deckId;
      setSelected(new Set(renderableIds));
    }
  }, [ready, deckId, renderableIds]);

  return {
    selected,
    setSelected,
    selectAll: () => setSelected(new Set(renderableIds)),
  };
}
```

The `initializedFor` ref makes the effect idempotent: it runs on every render (because `renderableIds` identity changes), but only re-initializes when the deck actually changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/views/usePrintSelection.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/usePrintSelection.ts src/views/usePrintSelection.test.tsx
git commit -m "feat(print): add usePrintSelection hook for subset selection state"
```

---

### Task 2: `selectionCountLabel` helper

**Files:**
- Create: `src/views/printSelectionLabel.ts`
- Test: `src/views/printSelectionLabel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { selectionCountLabel } from "./printSelectionLabel";

describe("selectionCountLabel", () => {
  test("all selected reads 'All N cards'", () => {
    expect(selectionCountLabel(15, 15)).toBe("All 15 cards");
  });

  test("narrowed reads 'X of N cards'", () => {
    expect(selectionCountLabel(7, 15)).toBe("7 of 15 cards");
  });

  test("zero selected reads '0 of N cards'", () => {
    expect(selectionCountLabel(0, 15)).toBe("0 of 15 cards");
  });

  test("singular total pluralizes correctly", () => {
    expect(selectionCountLabel(1, 1)).toBe("All 1 card");
    expect(selectionCountLabel(0, 1)).toBe("0 of 1 card");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/views/printSelectionLabel.test.ts`
Expected: FAIL — `selectionCountLabel` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
const cardWord = (n: number) => (n === 1 ? "card" : "cards");

/** Sidebar count phrasing. `total` is the renderable-card count. */
export function selectionCountLabel(selected: number, total: number): string {
  if (selected === total) return `All ${total} ${cardWord(total)}`;
  return `${selected} of ${total} ${cardWord(total)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/views/printSelectionLabel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/printSelectionLabel.ts src/views/printSelectionLabel.test.ts
git commit -m "feat(print): add selection count label helper"
```

---

### Task 3: Wire selection into PrintView + sidebar

**Files:**
- Modify: `src/views/PrintView.tsx`
- Modify: `src/views/PrintView.module.css`
- Test: `src/views/PrintView.test.tsx`

Context — current `PrintView.tsx` (lines 36–52) builds `printable` and feeds it to `useExpandedCards`:

```tsx
const cards = cardsQuery.data ?? [];
const printable = cards.filter(isRenderableCard);
const { physicalCards } = useExpandedCards(printable, perPage);
```

- [ ] **Step 1: Write the failing test**

Add to `src/views/PrintView.test.tsx` (inside the existing `describe`):

```tsx
test("opens with all renderable cards selected and shows 'All N cards'", async () => {
  const cards = makeCardRow.buildList(3);
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  expect(screen.getByText("All 3 cards")).toBeInTheDocument();
});

test("the 'Select all' link is hidden when all cards are selected", async () => {
  const cards = makeCardRow.buildList(3);
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getByText("All 3 cards")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /select all/i })).not.toBeInTheDocument();
});

test("exposes a 'Choose cards' button", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getByText("All 2 cards")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: /choose cards/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/views/PrintView.test.tsx`
Expected: FAIL — no "All 3 cards" text / no "Choose cards" button.

- [ ] **Step 3: Implement the wiring in `PrintView.tsx`**

Add imports near the top:

```tsx
import { useMemo, useState } from "react"; // extend existing react import as needed
import { isRenderableCard } from "../cards/types";
import { usePrintSelection } from "./usePrintSelection";
import { selectionCountLabel } from "./printSelectionLabel";
```

(`useId`, `Fragment`, etc. that already exist stay. `useMemo` is new.)

Inside `PrintView`, replace the data/derivation block:

```tsx
const cards = cardsQuery.data ?? [];
const printable = useMemo(() => cards.filter(isRenderableCard), [cards]);
const renderableIds = useMemo(() => printable.map((c) => c.id), [printable]);

const { selected, setSelected, selectAll } = usePrintSelection(
  deckId,
  renderableIds,
  cardsQuery.isSuccess,
);
const [isPickerOpen, setIsPickerOpen] = useState(false);

const selectedPrintable = printable.filter((c) => selected.has(c.id));
const { physicalCards } = useExpandedCards(selectedPrintable, perPage);
```

Note: `physicalCards` now derives from `selectedPrintable`, not `printable`. `pairSlots`/`pages` downstream are unchanged.

Update the empty/disabled logic. Replace the `isDisabled={printable.length === 0}` on the Print button and the `printable.length === 0` empty message:

```tsx
const isEmptySelection = printable.length > 0 && selectedPrintable.length === 0;
const isNarrowed = selected.size > 0 && selected.size < printable.length;
```

Add the selection block at the **top** of the sidebar (before the "Cards per page" `.field`):

```tsx
{printable.length > 0 && (
  <div className={styles.selectionBlock}>
    <p className={styles.selectionCount} data-empty={isEmptySelection || undefined}>
      {selectionCountLabel(selectedPrintable.length, printable.length)}
    </p>
    <Button variant="secondary" size="sm" onPress={() => setIsPickerOpen(true)}>
      Choose cards…
    </Button>
    {isNarrowed && (
      <button type="button" className={styles.selectAllLink} onClick={selectAll}>
        Select all
      </button>
    )}
  </div>
)}
<hr className={styles.divider} />
```

Update the Print button. Per the spec's a11y note, use `aria-disabled`
(not `isDisabled`/`disabled`) so the button stays focusable and a
screen reader can announce the `aria-describedby` hint explaining *why*
it's disabled; guard `onPress` so it's inert when nothing is selected:

```tsx
const noneSelected = selectedPrintable.length === 0;

<Button
  className={styles.printButton}
  variant="primary"
  size="lg"
  aria-disabled={noneSelected || undefined}
  aria-describedby={isEmptySelection ? emptyHintId : undefined}
  onPress={() => {
    if (noneSelected) return;
    window.print();
  }}
>
  Print
</Button>
{isEmptySelection && (
  <p id={emptyHintId} className={styles.tip}>
    Select at least 1 card to print.
  </p>
)}
```

This replaces the button's previous `isDisabled={printable.length === 0}`
— `noneSelected` is true whenever the deck has no renderable cards *or*
the user cleared the selection, covering both cases.

Add `const emptyHintId = useId();` alongside the existing `useId()` usage.

Update the sheet empty message (currently `{printable.length === 0 && <p>No printable cards...</p>}`):

```tsx
{printable.length === 0 && <p>No printable cards in this deck yet.</p>}
{isEmptySelection && (
  <p>No cards selected — use Choose cards to pick what to print.</p>
)}
```

Add the modal mount at the end of the root (placeholder for Stage 1 — replaced in Task 9):

```tsx
{isPickerOpen && (
  <div role="dialog" aria-label="Choose cards to print">
    {/* Placeholder — replaced by PrintSelectionModal in Stage 3. */}
    <button type="button" onClick={() => setIsPickerOpen(false)}>
      Close
    </button>
  </div>
)}
```

- [ ] **Step 4: Add CSS in `PrintView.module.css`**

Add near the other sidebar rules:

```css
.selectionBlock {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.selectionCount {
  margin: 0;
  font-weight: 500;
}

.selectionCount[data-empty] {
  color: var(--color-warning-fg, var(--color-danger-fg));
}

.selectAllLink {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
}

.selectAllLink:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
```

If `--color-warning-fg` does not exist in `src/index.css`, the fallback to `--color-danger-fg` applies; verify one of them resolves (grep `src/index.css`). If neither exists, add `--color-warning-fg` to `src/index.css` as a sibling of the other `--color-*-fg` tokens using the existing warning/amber hue.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/views/PrintView.test.tsx`
Expected: PASS — the three new tests plus all pre-existing PrintView tests (the pipeline still renders all cards because the default selection is "all").

- [ ] **Step 6: Typecheck + build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.module.css src/views/PrintView.test.tsx src/index.css
git commit -m "feat(print): selection state + sidebar count/choose-cards/select-all"
```

---

## Stage 2 — Net-new primitives

Isolated, individually tested. No dependency on Stage 1.

### Task 4: `relativeTime` helper

**Files:**
- Create: `src/lib/relativeTime.ts`
- Test: `src/lib/relativeTime.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { relativeTime } from "./relativeTime";

const now = new Date("2026-05-22T12:00:00Z");

describe("relativeTime", () => {
  test("minutes ago", () => {
    expect(relativeTime("2026-05-22T11:30:00Z", now)).toBe("30 minutes ago");
  });

  test("hours ago", () => {
    expect(relativeTime("2026-05-22T10:00:00Z", now)).toBe("2 hours ago");
  });

  test("days ago", () => {
    expect(relativeTime("2026-05-19T12:00:00Z", now)).toBe("3 days ago");
  });

  test("seconds ago uses 'now' bucket", () => {
    // numeric: "auto" renders < 1 minute as "now".
    expect(relativeTime("2026-05-22T11:59:50Z", now)).toBe("now");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/relativeTime.test.ts`
Expected: FAIL — `relativeTime` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** "2 hours ago", "3 days ago", "now". Past values produce "… ago". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  let duration = (new Date(iso).getTime() - now.getTime()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "year");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/relativeTime.test.ts`
Expected: PASS (4 tests).

If "30 minutes ago" / "2 hours ago" come back with different exact wording in the CI locale, pin the locale by changing `new Intl.RelativeTimeFormat(undefined, …)` to `new Intl.RelativeTimeFormat("en", …)`. The repo's `Intl.Collator` in `deckListing.ts` uses default locale, but RelativeTimeFormat wording is locale-sensitive, so `"en"` keeps tests deterministic.

- [ ] **Step 5: Commit**

```bash
git add src/lib/relativeTime.ts src/lib/relativeTime.test.ts
git commit -m "feat(lib): add relativeTime formatter"
```

---

### Task 5: `Checkbox` primitive

**Files:**
- Create: `src/lib/ui/Checkbox.tsx`
- Create: `src/lib/ui/Checkbox.module.css`
- Test: `src/lib/ui/Checkbox.test.tsx`
- Modify: `src/lib/ui/README.md`

- [ ] **Step 1: Write the failing test**

```tsx
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "../../test/render";
import { Checkbox } from "./Checkbox";

function Harness() {
  const [selected, setSelected] = useState(false);
  return (
    <Checkbox isSelected={selected} onChange={setSelected}>
      Accept
    </Checkbox>
  );
}

describe("Checkbox", () => {
  test("renders a checkbox with its label as the accessible name", () => {
    render(<Checkbox isSelected={false} onChange={() => {}}>Accept</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "Accept" })).toBeInTheDocument();
  });

  test("toggles on click", async () => {
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: "Accept" });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(box).toBeChecked();
  });

  test("indeterminate renders aria-checked=mixed", () => {
    render(
      <Checkbox isSelected={false} isIndeterminate onChange={() => {}} aria-label="Select all">
        {null}
      </Checkbox>,
    );
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/ui/Checkbox.test.tsx`
Expected: FAIL — `Checkbox` not defined.

- [ ] **Step 3: Write the primitive**

`src/lib/ui/Checkbox.tsx`:

```tsx
import type { ReactNode } from "react";
import { Checkbox as RACCheckbox, type CheckboxProps as RACCheckboxProps } from "react-aria-components";
import styles from "./Checkbox.module.css";

export type CheckboxProps = Omit<RACCheckboxProps, "className" | "children"> & {
  className?: string;
  children?: ReactNode;
};

export function Checkbox({ className, children, ...rest }: CheckboxProps) {
  return (
    <RACCheckbox {...rest} className={[styles.checkbox, className].filter(Boolean).join(" ")}>
      <span className={styles.box} aria-hidden="true" />
      {children}
    </RACCheckbox>
  );
}
```

`children` is optional: the tri-state header checkbox is labelled via `aria-label` and renders no visible label text.

`src/lib/ui/Checkbox.module.css`:

```css
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}

.box {
  width: 1.1rem;
  height: 1.1rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  display: inline-flex;
  flex: none;
}

.checkbox[data-selected] .box,
.checkbox[data-indeterminate] .box {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.checkbox[data-focus-visible] .box {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
```

RAC sets `data-selected` / `data-indeterminate` / `data-focus-visible` on the label element automatically; no render-function needed. (A checkmark/dash glyph is optional polish; the background-fill states above are sufficient and accessible. If you add glyphs, use a `::after` on `.box` keyed off the same data-attributes.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/ui/Checkbox.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Document the primitive**

Add a row to the catalog table in `src/lib/ui/README.md` (after the `Switch` row):

```markdown
| `Checkbox` | A checkbox. Supports `isIndeterminate` for tri-state (renders `aria-checked="mixed"`). Children are the label; omit them and pass `aria-label` for a label-less control. |
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/Checkbox.tsx src/lib/ui/Checkbox.module.css src/lib/ui/Checkbox.test.tsx src/lib/ui/README.md
git commit -m "feat(ui): add Checkbox primitive with indeterminate support"
```

---

## Stage 3 — Assemble `PrintSelectionModal` + integration

### Task 6: Modal scaffold — list, sort, row checkboxes, Apply/Cancel

**Files:**
- Create: `src/views/PrintSelectionModal.tsx`
- Create: `src/views/PrintSelectionModal.module.css`
- Test: `src/views/PrintSelectionModal.test.tsx`

The modal is self-contained and tested directly (rendered without `PrintView`), so its tests don't need MSW. Build cards with the card factories.

- [ ] **Step 1: Write the failing test**

```tsx
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { itemCardFactory, spellCardFactory } from "../cards/factories";
import type { CardId, RenderableCard } from "../cards/types";
import { render, screen } from "../test/render";
import { PrintSelectionModal } from "./PrintSelectionModal";

function open(cards: RenderableCard[], initial: Set<CardId>, onApply = vi.fn()) {
  function Harness() {
    const [closed, setClosed] = useState(false);
    if (closed) return <p>closed</p>;
    return (
      <PrintSelectionModal
        cards={cards}
        initialSelection={initial}
        onApply={onApply}
        onClose={() => setClosed(true)}
      />
    );
  }
  render(<Harness />);
  return { onApply };
}

const allIds = (cards: RenderableCard[]) => new Set(cards.map((c) => c.id));

describe("<PrintSelectionModal>", () => {
  test("lists every renderable card with a checkbox, recency-sorted (newest first)", () => {
    const older = itemCardFactory.build({ name: "Older", updatedAt: "2026-05-01T00:00:00Z" });
    const newer = itemCardFactory.build({ name: "Newer", updatedAt: "2026-05-20T00:00:00Z" });
    const cards = [older, newer];
    open(cards, allIds(cards));
    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox is the header tri-state; rows follow. Newest row first.
    const rowNames = screen.getAllByRole("checkbox", { name: /Older|Newer/ }).map((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(rowNames[0]).toMatch(/Newer/);
    expect(rowNames[1]).toMatch(/Older/);
    expect(checkboxes.length).toBeGreaterThanOrEqual(3); // header + 2 rows
  });

  test("focus lands on the name search input on open", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(screen.getByRole("searchbox", { name: /search cards/i })).toHaveFocus();
  });

  test("Apply commits the current draft and closes", async () => {
    const cards = itemCardFactory.buildList(2);
    const { onApply } = open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const committed = onApply.mock.calls[0][0] as Set<string>;
    expect([...committed].sort()).toEqual([...allIds(cards)].sort());
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("Cancel discards the draft (onApply not called) and closes", async () => {
    const cards = itemCardFactory.buildList(2);
    const { onApply } = open(cards, allIds(cards));
    const [first] = cards;
    await userEvent.click(screen.getByRole("checkbox", { name: first.name }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("toggling a row updates the Apply total", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
    const [first] = cards;
    await userEvent.click(screen.getByRole("checkbox", { name: first.name }));
    expect(screen.getByRole("button", { name: "Apply (2 cards)" })).toBeInTheDocument();
  });

  test("a spell and an item both appear when present", () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    expect(screen.getByRole("checkbox", { name: "Cloak" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bless" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/views/PrintSelectionModal.test.tsx`
Expected: FAIL — `PrintSelectionModal` not defined.

- [ ] **Step 3: Write the scaffold**

`src/views/PrintSelectionModal.tsx`:

```tsx
import { useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import { relativeTime } from "../lib/relativeTime";
import { deckListing, type DeckSort } from "../decks/deckListing";
import type { CardId, RenderableCard } from "../cards/types";
import { Button } from "../lib/ui/Button";
import { Checkbox } from "../lib/ui/Checkbox";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import styles from "./PrintSelectionModal.module.css";

type Props = {
  cards: RenderableCard[];
  initialSelection: Set<CardId>;
  onApply: (next: Set<CardId>) => void;
  onClose: () => void;
};

const cardWord = (n: number) => (n === 1 ? "card" : "cards");

export function PrintSelectionModal({ cards, initialSelection, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Set<CardId>>(() => new Set(initialSelection));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DeckSort>("updated");

  const visible = useMemo(() => {
    const { cards: sorted } = deckListing(cards, { kind: "all", sort });
    const q = search.trim().toLowerCase();
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
  }, [cards, sort, search]);

  const toggle = (id: CardId) => {
    const next = new Set(draft);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  };

  const total = draft.size;

  return (
    <DialogShell
      isOpen
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      aria-label="Choose cards to print"
      size="lg"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <div className={styles.modal}>
          <div className={styles.filterRow}>
            <TextField aria-label="Search cards" className={styles.searchField}>
              <Input
                type="search"
                placeholder="Search cards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </TextField>
            <label className={styles.sortLabel}>
              <span>Sort</span>
              <select
                className={styles.sortSelect}
                value={sort}
                onChange={(e) => setSort(e.target.value as DeckSort)}
              >
                <option value="updated">Recently edited</option>
                <option value="name">Name A→Z</option>
              </select>
            </label>
          </div>

          <ul className={styles.list}>
            {visible.map((c) => (
              <li key={c.id} className={styles.row}>
                <Checkbox isSelected={draft.has(c.id)} onChange={() => toggle(c.id)}>
                  {c.name}
                </Checkbox>
                <span className={styles.rowKind} aria-hidden="true">
                  {c.kind}
                </span>
                <time className={styles.rowTime} dateTime={c.updatedAt}>
                  {relativeTime(c.updatedAt)}
                </time>
              </li>
            ))}
          </ul>

          <div className={styles.footer}>
            <div className={styles.footerActions}>
              <Button variant="secondary" onPress={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onPress={() => onApply(draft)}>
                {`Apply (${total} ${cardWord(total)})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogShell>
  );
}
```

`src/views/PrintSelectionModal.module.css`:

```css
.modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--space-3);
  padding: var(--space-4);
}

.filterRow {
  display: flex;
  gap: var(--space-3);
  align-items: end;
  flex-wrap: wrap;
}

.searchField {
  flex: 1 1 12rem;
}

.sortLabel {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--fs-sm);
}

.sortSelect {
  font: inherit;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

.rowKind {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  text-transform: capitalize;
}

.rowTime {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
}

.footerActions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.bulkRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-1);
  border-bottom: 1px solid var(--color-border-strong);
}

.shownCount {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.hiddenLine {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

(The `.bulkRow`, `.shownCount`, `.hiddenLine`, `.srOnly` classes are used in Tasks 7–8; defining them now avoids a second CSS edit.)

- [ ] **Step 4: Run tests**

Run: `npm test -- src/views/PrintSelectionModal.test.tsx`
Expected: PASS (6 tests). The header tri-state checkbox doesn't exist yet, so the "checkboxes.length >= 3" assertion counts 2 rows; adjust the first test's `>= 3` to `>= 2` if it fails here, then restore to `>= 3` after Task 7. (Cleaner: keep `>= 2` now; Task 7 adds its own header assertions.)

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/PrintSelectionModal.tsx src/views/PrintSelectionModal.module.css src/views/PrintSelectionModal.test.tsx
git commit -m "feat(print): PrintSelectionModal scaffold — list, sort, row checkboxes, apply/cancel"
```

---

### Task 7: Tri-state header checkbox

**Files:**
- Modify: `src/views/PrintSelectionModal.tsx`
- Test: `src/views/PrintSelectionModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `PrintSelectionModal.test.tsx`:

```tsx
test("header checkbox clears all visible when all are checked", async () => {
  const cards = itemCardFactory.buildList(3);
  open(cards, allIds(cards));
  const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
  expect(header).toBeChecked();
  await userEvent.click(header);
  expect(screen.getByRole("button", { name: "Apply (0 cards)" })).toBeInTheDocument();
});

test("header checkbox selects all visible when none are checked", async () => {
  const cards = itemCardFactory.buildList(3);
  open(cards, new Set()); // start empty
  const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
  expect(header).not.toBeChecked();
  await userEvent.click(header);
  expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
});

test("header checkbox is indeterminate (mixed) when some visible are checked", async () => {
  const cards = itemCardFactory.buildList(3);
  open(cards, allIds(cards));
  const [first] = cards;
  await userEvent.click(screen.getByRole("checkbox", { name: first.name }));
  const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
  expect(header).toHaveAttribute("aria-checked", "mixed");
});

test("clicking an indeterminate header clears all visible", async () => {
  const cards = itemCardFactory.buildList(3);
  open(cards, allIds(cards));
  const [first] = cards;
  await userEvent.click(screen.getByRole("checkbox", { name: first.name })); // now 2 of 3
  const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
  await userEvent.click(header);
  expect(screen.getByRole("button", { name: "Apply (0 cards)" })).toBeInTheDocument();
});

test("header shows 'X of Y shown' status", () => {
  const cards = itemCardFactory.buildList(3);
  open(cards, allIds(cards));
  expect(screen.getByText("3 of 3 shown")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/views/PrintSelectionModal.test.tsx`
Expected: FAIL — no "select all shown cards" checkbox.

- [ ] **Step 3: Implement the header**

In `PrintSelectionModal.tsx`, add derived values after `visible`:

```tsx
const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
const visibleCheckedCount = useMemo(
  () => visibleIds.filter((id) => draft.has(id)).length,
  [visibleIds, draft],
);
const allVisibleChecked = visible.length > 0 && visibleCheckedCount === visible.length;
const noneVisibleChecked = visibleCheckedCount === 0;
const headerIndeterminate = !allVisibleChecked && !noneVisibleChecked;

const onHeaderToggle = () => {
  const next = new Set(draft);
  if (visibleCheckedCount > 0) {
    // any visible checked (checked or indeterminate) → clear all visible
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  setDraft(next);
};
```

Insert the bulk-select row immediately before `<ul className={styles.list}>`:

```tsx
<div className={styles.bulkRow}>
  <Checkbox
    aria-label="Select all shown cards"
    isSelected={allVisibleChecked}
    isIndeterminate={headerIndeterminate}
    onChange={onHeaderToggle}
  />
  <span className={styles.shownCount}>
    {visibleCheckedCount} of {visible.length} shown
  </span>
</div>
```

**Critical:** `onHeaderToggle` ignores the boolean RAC passes to `onChange` and derives the action from `visibleCheckedCount`. RAC's Checkbox fires `onChange(true)` when clicked from the indeterminate state, which would *select all* — the opposite of the required "any checked → clear" rule. Deriving the action ourselves is what makes the indeterminate case correct.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/views/PrintSelectionModal.test.tsx`
Expected: PASS (all, including the 5 new header tests). If the Task 6 "checkboxes.length >= 2" assertion was left at `>= 2`, bump it to `>= 3` now (header + 2 rows).

- [ ] **Step 5: Commit**

```bash
git add src/views/PrintSelectionModal.tsx src/views/PrintSelectionModal.test.tsx
git commit -m "feat(print): tri-state header checkbox for bulk select/clear of visible cards"
```

---

### Task 8: Kind filter, name search, hidden-checked line, live region

**Files:**
- Modify: `src/views/PrintSelectionModal.tsx`
- Test: `src/views/PrintSelectionModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `PrintSelectionModal.test.tsx`:

```tsx
test("Kind filter hides the other kind without unchecking it", async () => {
  const item = itemCardFactory.build({ name: "Cloak" });
  const spell = spellCardFactory.build({ name: "Bless" });
  const cards = [item, spell];
  open(cards, allIds(cards));
  await userEvent.click(screen.getByRole("radio", { name: /items/i }));
  expect(screen.queryByRole("checkbox", { name: "Bless" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Cloak" })).toBeInTheDocument();
  // Switching back to All shows Bless still checked.
  await userEvent.click(screen.getByRole("radio", { name: /all/i }));
  expect(screen.getByRole("checkbox", { name: "Bless" })).toBeChecked();
});

test("name search narrows the list case-insensitively", async () => {
  const a = itemCardFactory.build({ name: "Acid Arrow" });
  const b = itemCardFactory.build({ name: "Bless" });
  open([a, b], allIds([a, b]));
  await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "acid");
  expect(screen.getByRole("checkbox", { name: "Acid Arrow" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Bless" })).not.toBeInTheDocument();
});

test("hidden-checked line appears when a filter hides a selected card", async () => {
  const item = itemCardFactory.build({ name: "Cloak" });
  const spell = spellCardFactory.build({ name: "Bless" });
  const cards = [item, spell];
  open(cards, allIds(cards));
  await userEvent.click(screen.getByRole("radio", { name: /items/i }));
  expect(
    screen.getByText(/1 selected card is hidden by filters/i),
  ).toBeInTheDocument();
});

test("Clear filters link restores the full list and removes the hidden-checked line", async () => {
  const item = itemCardFactory.build({ name: "Cloak" });
  const spell = spellCardFactory.build({ name: "Bless" });
  const cards = [item, spell];
  open(cards, allIds(cards));
  await userEvent.click(screen.getByRole("radio", { name: /items/i }));
  await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
  expect(screen.getByRole("checkbox", { name: "Bless" })).toBeInTheDocument();
  expect(screen.queryByText(/hidden by filters/i)).not.toBeInTheDocument();
});

test("exposes a polite live region announcing the selected total", () => {
  const cards = itemCardFactory.buildList(3);
  open(cards, allIds(cards));
  const live = screen.getByText(/3 cards selected/i);
  expect(live).toHaveAttribute("aria-live", "polite");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/views/PrintSelectionModal.test.tsx`
Expected: FAIL — no Kind radios, no hidden line, no live region.

- [ ] **Step 3: Implement filters + hidden line + live region**

Edit the two existing import lines in place (do **not** add duplicate
import statements). After editing they should read:

```tsx
import { Radio, RadioGroup, TextField } from "react-aria-components";
import { deckListing, type DeckKindFilter, type DeckSort } from "../decks/deckListing";
```

(Task 6 imported `TextField` and `{ deckListing, type DeckSort }`; this
step adds `Radio`, `RadioGroup`, and `DeckKindFilter` to those same
lines.)

Add `kind` state and thread it into `visible`:

```tsx
const [kind, setKind] = useState<DeckKindFilter>("all");

const visible = useMemo(() => {
  const { cards: sorted } = deckListing(cards, { kind, sort });
  const q = search.trim().toLowerCase();
  return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
}, [cards, kind, sort, search]);
```

Compute the hidden-checked count (selected cards not currently visible):

```tsx
const hiddenSelectedCount = useMemo(() => {
  const visibleIdSet = new Set(visibleIds);
  return cards.filter((c) => draft.has(c.id) && !visibleIdSet.has(c.id)).length;
}, [cards, draft, visibleIds]);

const clearFilters = () => {
  setKind("all");
  setSearch("");
};
```

Add the Kind RadioGroup into the `.filterRow` (before the search `TextField`):

```tsx
<RadioGroup
  className={styles.kindGroup}
  aria-label="Filter by card kind"
  value={kind}
  onChange={(v) => setKind(v as DeckKindFilter)}
>
  <Radio value="all" className={styles.chip}>All</Radio>
  <Radio value="item" className={styles.chip}>Items</Radio>
  <Radio value="spell" className={styles.chip}>Spells</Radio>
</RadioGroup>
```

Add the hidden-checked line + live region into the footer (above `.footerActions`):

```tsx
{hiddenSelectedCount > 0 && (
  <p className={styles.hiddenLine}>
    {`${hiddenSelectedCount} selected ${cardWord(hiddenSelectedCount)} ${
      hiddenSelectedCount === 1 ? "is" : "are"
    } hidden by filters — still included when you Apply.`}{" "}
    <button type="button" className={styles.clearFiltersLink} onClick={clearFilters}>
      Clear filters
    </button>
  </p>
)}
<span className={styles.srOnly} aria-live="polite">
  {`${total} ${cardWord(total)} selected`}
</span>
```

Add chip + link styles to `PrintSelectionModal.module.css`:

```css
.kindGroup {
  display: flex;
  gap: var(--space-2);
}

.chip {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill, 999px);
  cursor: pointer;
  font-size: var(--fs-sm);
}

.chip[data-selected] {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-on-accent, #fff);
}

.chip[data-focus-visible] {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.clearFiltersLink {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
}
```

If `--color-on-accent` / `--radius-pill` don't exist, substitute `#fff` and `999px` literals (component-internal geometry, allowed per the design-system note).

- [ ] **Step 4: Run tests**

Run: `npm test -- src/views/PrintSelectionModal.test.tsx`
Expected: PASS (all). The "is/are" wording test asserts "1 selected card is hidden".

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/PrintSelectionModal.tsx src/views/PrintSelectionModal.module.css src/views/PrintSelectionModal.test.tsx
git commit -m "feat(print): kind filter, name search, hidden-checked line, live region"
```

---

### Task 9: Wire the modal into PrintView + integration tests

**Files:**
- Modify: `src/views/PrintView.tsx`
- Test: `src/views/PrintView.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `PrintView.test.tsx`. These drive the narrow/empty/select-all states end-to-end. Build named/typed cards via payload factories so the modal rows are addressable:

```tsx
import { makeSpellPayload, makeAbilityPayload } from "../test/factories";

function rowWithPayload(payload: ReturnType<typeof makeItemPayload.build>) {
  return makeCardRow.build({ payload });
}

test("narrowing via the modal updates the count and the printed set", async () => {
  const keep = rowWithPayload(makeItemPayload.build({ name: "Keep" }));
  const drop = rowWithPayload(makeItemPayload.build({ name: "Drop" }));
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([keep, drop])),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getByText("All 2 cards")).toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /choose cards/i }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Drop" }));
  await userEvent.click(screen.getByRole("button", { name: /apply/i }));

  expect(screen.getByText("1 of 2 cards")).toBeInTheDocument();
  // Only the kept card is on the sheet.
  expect(screen.getByText("Keep")).toBeInTheDocument();
  expect(screen.queryByText("Drop")).not.toBeInTheDocument();
});

test("Cancel preserves the previous selection", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getByText("All 2 cards")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /choose cards/i }));
  await userEvent.click(screen.getByRole("checkbox", { name: /select all shown cards/i })); // clears
  await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect(screen.getByText("All 2 cards")).toBeInTheDocument();
});

test("empty selection disables Print and shows the empty message", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getByText("All 2 cards")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /choose cards/i }));
  await userEvent.click(screen.getByRole("checkbox", { name: /select all shown cards/i })); // clears
  await userEvent.click(screen.getByRole("button", { name: /apply/i }));
  expect(screen.getByText("0 of 2 cards")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^print$/i })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByText(/no cards selected/i)).toBeInTheDocument();
});

test("Select all link restores the full selection after narrowing", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getByText("All 2 cards")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /choose cards/i }));
  const [first] = cards;
  await userEvent.click(
    screen.getByRole("checkbox", { name: first.payload.name }),
  );
  await userEvent.click(screen.getByRole("button", { name: /apply/i }));
  expect(screen.getByText("1 of 2 cards")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /select all/i }));
  expect(screen.getByText("All 2 cards")).toBeInTheDocument();
});

test("ability (non-renderable) cards never reach the picker", async () => {
  const item = rowWithPayload(makeItemPayload.build({ name: "Cloak" }));
  const ability = makeCardRow.build({ payload: makeAbilityPayload.build({ name: "Rage" }) });
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () =>
      HttpResponse.json([item, ability]),
    ),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getByText("All 1 card")).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: /choose cards/i }));
  expect(screen.getByRole("checkbox", { name: "Cloak" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Rage" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/views/PrintView.test.tsx`
Expected: FAIL — the placeholder modal has no checkboxes / Apply button.

- [ ] **Step 3: Replace the placeholder with the real modal**

In `PrintView.tsx`, add the import:

```tsx
import { PrintSelectionModal } from "./PrintSelectionModal";
```

Replace the placeholder block from Task 3 with:

```tsx
{isPickerOpen && (
  <PrintSelectionModal
    cards={printable}
    initialSelection={selected}
    onApply={(next) => {
      setSelected(next);
      setIsPickerOpen(false);
    }}
    onClose={() => setIsPickerOpen(false)}
  />
)}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/views/PrintView.test.tsx`
Expected: PASS (all PrintView tests). Note: the "ability cards never reach the picker" test relies on `printable` already filtering via `isRenderableCard` (Task 3) — the modal receives only renderable cards.

- [ ] **Step 5: Full suite + build**

Run: `npm test`
Expected: PASS (entire suite).

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.test.tsx
git commit -m "feat(print): wire PrintSelectionModal into PrintView with full subset flow"
```

---

## Self-review checklist (run after implementation)

- [ ] **Spec coverage:** Every spec behavior maps to a task — initial selection (Task 1), count phrasing (Task 2), sidebar/Print-disable/empty message (Task 3), relative time (Task 4), Checkbox/`mixed` (Task 5), modal list+sort+apply/cancel (Task 6), tri-state header (Task 7), kind filter + search + hidden line + live region (Task 8), narrow/empty/select-all/ability integration (Task 9).
- [ ] **Sort default** is `updated` (recency) — verify the modal's initial `sort` state and the first row order test.
- [ ] **Re-open resets view, keeps selection:** the modal re-mounts each open (`isPickerOpen` gates rendering), so `useState` initializers re-run — `kind`/`search`/`sort` reset to defaults and `draft` re-seeds from the current `selected`. This satisfies the spec's "filters/sort reset, selection persists" requirement for free; add a quick manual check.
- [ ] **`aria-label` on modal** is the chosen accessibility path (DialogShell takes a string `aria-label`); `aria-labelledby` widening was deferred per spec.
- [ ] **Manual smoke:** `npm run dev`, open a deck's print view, edit two cards, reprint just those two via the friction-case walkthrough. Confirm the sidebar count, the tri-state clear, and the printed sheet.

## Deferred (documented, not in scope)

- Virtualization of the picker list (spec tripwire ~150 rows).
- Announcing the hidden-checked line on appear/disappear — the single polite live region announces the total, which carries the critical info; the line itself is plain text to honor the spec's "avoid announcement flood" priority.
- Extracting the picker into a generic `src/lib/ui/` primitive (gated on a second consumer).
