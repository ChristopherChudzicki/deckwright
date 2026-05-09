# Continuation cards on print backs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Continue content on back" sub-toggle to PrintView so that, when both "Print backs" and the new sub-toggle are on, multi-page cards print page 2+ on the back of page 1's slot instead of taking a separate front slot.

**Architecture:** Introduce a pure `pairSlots(physicalCards, { contentOnBack })` function that groups consecutive same-card `PhysicalCard`s into `PrintSlot { front, back? }` pairs (or front-only slots when off). PrintView consumes slots instead of physical cards, calls existing `imposeBackPage` (generic, untouched) on the slots, and the existing `getBackContentFor` seam grows a branch: render `<Card>` if `slot.back` exists, else `<CardBack>`.

**Tech Stack:** React 18 + TypeScript, Vitest + RTL + `@testing-library/user-event`, MSW for HTTP mocks, Fishery + faker factories, Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-05-08-print-content-on-back-design.md`

---

## File Structure

**Create:**
- `src/cards/pairSlots.ts` — pure pairing function and `PrintSlot` type.
- `src/cards/pairSlots.test.ts` — unit tests.

**Modify:**
- `src/views/PrintView.tsx` — add `contentOnBack` state, replace `physicalCards` flow with `printSlots`, add sub-toggle markup, update `getBackContentFor`.
- `src/views/PrintView.module.css` — add `.subSwitch` class.
- `src/views/PrintView.test.tsx` — add tests for sub-toggle UI and paired-flow behavior.

**Untouched:**
- `src/cards/expandCard.ts`, `src/cards/paginate.ts`, `src/cards/measurer.ts`, `src/cards/Card.tsx`, `src/cards/CardBack.tsx`, `src/cards/backImposition.ts`.

---

## Task 1: `pairSlots` module (TDD)

**Files:**
- Create: `src/cards/pairSlots.ts`
- Test: `src/cards/pairSlots.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/cards/pairSlots.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { PhysicalCard } from "./expandCard";
import { itemCardFactory } from "./factories";
import { pairSlots } from "./pairSlots";
import type { ItemCard } from "./types";

const physical = (card: ItemCard, page?: number, total?: number): PhysicalCard => ({
  card,
  bodyChunk: "",
  pagination: page !== undefined && total !== undefined ? { page, total } : undefined,
});

describe("pairSlots", () => {
  test("contentOnBack: false maps every PhysicalCard to a front-only slot", () => {
    const card = itemCardFactory.build();
    const cards = [physical(card), physical(card, 1, 2), physical(card, 2, 2)];
    const slots = pairSlots(cards, { contentOnBack: false });
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.back).toBeUndefined();
    }
  });

  test("empty input returns empty slots in both modes", () => {
    expect(pairSlots([], { contentOnBack: false })).toEqual([]);
    expect(pairSlots([], { contentOnBack: true })).toEqual([]);
  });

  test("single 1-page card pairs to one front-only slot", () => {
    const card = itemCardFactory.build();
    const slots = pairSlots([physical(card)], { contentOnBack: true });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.back).toBeUndefined();
  });

  test("single 2-page card collapses to one paired slot", () => {
    const card = itemCardFactory.build();
    const cards = [physical(card, 1, 2), physical(card, 2, 2)];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.front.pagination?.page).toBe(1);
    expect(slots[0]!.back?.pagination?.page).toBe(2);
  });

  test("single 3-page card produces two slots, last with no back", () => {
    const card = itemCardFactory.build();
    const cards = [
      physical(card, 1, 3),
      physical(card, 2, 3),
      physical(card, 3, 3),
    ];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(2);
    expect(slots[0]!.front.pagination?.page).toBe(1);
    expect(slots[0]!.back?.pagination?.page).toBe(2);
    expect(slots[1]!.front.pagination?.page).toBe(3);
    expect(slots[1]!.back).toBeUndefined();
  });

  test("single 4-page card produces two paired slots", () => {
    const card = itemCardFactory.build();
    const cards = [
      physical(card, 1, 4),
      physical(card, 2, 4),
      physical(card, 3, 4),
      physical(card, 4, 4),
    ];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(2);
    expect(slots[0]!.front.pagination?.page).toBe(1);
    expect(slots[0]!.back?.pagination?.page).toBe(2);
    expect(slots[1]!.front.pagination?.page).toBe(3);
    expect(slots[1]!.back?.pagination?.page).toBe(4);
  });

  test("two distinct 1-page cards stay unpaired", () => {
    const cardA = itemCardFactory.build();
    const cardB = itemCardFactory.build();
    const slots = pairSlots([physical(cardA), physical(cardB)], {
      contentOnBack: true,
    });
    expect(slots).toHaveLength(2);
    expect(slots[0]!.front.card).toBe(cardA);
    expect(slots[0]!.back).toBeUndefined();
    expect(slots[1]!.front.card).toBe(cardB);
    expect(slots[1]!.back).toBeUndefined();
  });

  test("two consecutive 2-page cards each pair within their own card", () => {
    const cardA = itemCardFactory.build();
    const cardB = itemCardFactory.build();
    const cards = [
      physical(cardA, 1, 2),
      physical(cardA, 2, 2),
      physical(cardB, 1, 2),
      physical(cardB, 2, 2),
    ];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(2);
    expect(slots[0]!.front.card).toBe(cardA);
    expect(slots[0]!.back?.card).toBe(cardA);
    expect(slots[1]!.front.card).toBe(cardB);
    expect(slots[1]!.back?.card).toBe(cardB);
  });
});
```

- [ ] **Step 1.2: Run the test, confirm it fails**

Run: `npm test -- src/cards/pairSlots.test.ts`

Expected: FAIL — `pairSlots` is not defined / module not found.

- [ ] **Step 1.3: Implement `pairSlots`**

Create `src/cards/pairSlots.ts`:

```ts
import type { PhysicalCard } from "./expandCard";

export type PrintSlot = {
  front: PhysicalCard;
  back?: PhysicalCard;
};

// Assumes consecutive PhysicalCards with matching card.id are pages of the
// same card in order — the invariant established by useExpandedCards.
export function pairSlots(
  cards: PhysicalCard[],
  opts: { contentOnBack: boolean },
): PrintSlot[] {
  if (!opts.contentOnBack) return cards.map((front) => ({ front }));

  const slots: PrintSlot[] = [];
  for (let i = 0; i < cards.length; i++) {
    const front = cards[i]!;
    const next = cards[i + 1];
    if (next && next.card.id === front.card.id) {
      slots.push({ front, back: next });
      i++;
    } else {
      slots.push({ front });
    }
  }
  return slots;
}
```

- [ ] **Step 1.4: Run the test, confirm it passes**

Run: `npm test -- src/cards/pairSlots.test.ts`

Expected: PASS, all 8 cases green.

- [ ] **Step 1.5: Commit**

```bash
git add src/cards/pairSlots.ts src/cards/pairSlots.test.ts
git commit -m "feat(print): add pairSlots for grouping consecutive card pages"
```

---

## Task 2: PrintView refactor to PrintSlot pipeline (regression-safe, no behavior change)

This task changes the data the front/back render code consumes from
`PhysicalCard[]` to `PrintSlot[]`, and adds the `slot.back ? <Card> : <CardBack>`
branch. The wiring uses a hardcoded `contentOnBack: false` so observable
behavior is identical — every existing test must still pass.

**Files:**
- Modify: `src/views/PrintView.tsx`

- [ ] **Step 2.1: Update imports**

In `src/views/PrintView.tsx`, replace the existing `import type { PhysicalCard }` line with the `pairSlots` import. The `PhysicalCard` type stops being referenced directly — TypeScript infers it through `PrintSlot`.

Change:
```ts
import type { PhysicalCard } from "../cards/expandCard";
```
to:
```ts
import { pairSlots, type PrintSlot } from "../cards/pairSlots";
```

- [ ] **Step 2.2: Update the top-level `getBackContentFor` helper**

Replace the existing helper near the top of the file:

```ts
const getBackContentFor = (entry: PhysicalCard, perPage: CardsPerPage) => (
  <CardBack card={entry.card} cardsPerPage={perPage} />
);
```

with:

```ts
const getBackContentFor = (slot: PrintSlot, perPage: CardsPerPage) =>
  slot.back ? (
    <Card
      card={slot.back.card}
      cardsPerPage={perPage}
      bodyOverride={slot.back.bodyChunk}
      pagination={slot.back.pagination}
    />
  ) : (
    <CardBack card={slot.front.card} cardsPerPage={perPage} />
  );
```

- [ ] **Step 2.3: Add `printSlots` derivation in the component body**

Inside `PrintView`, after the existing `const { physicalCards } = useExpandedCards(printable, perPage);` line, add:

```ts
const printSlots = pairSlots(physicalCards, { contentOnBack: false });
```

(The `false` is a placeholder — Task 4 wires the real toggle.)

- [ ] **Step 2.4: Switch chunking to operate on slots**

Replace:
```ts
const pages = physicalCards.length === 0 ? [] : chunk(physicalCards, perPage);
```
with:
```ts
const pages = printSlots.length === 0 ? [] : chunk(printSlots, perPage);
```

- [ ] **Step 2.5: Update the page-render loop to consume slots**

Inside `pages.map((pageCards) => { ... })`, rename `pageCards` to `pageSlots` and update the page key + slot rendering. The whole block becomes:

```tsx
{pages.map((pageSlots) => {
  const pageKey = `${pageSlots[0]?.front.card.id ?? "empty"}-${pageSlots[0]?.front.pagination?.page ?? 0}`;
  return (
    <Fragment key={`page-${pageKey}`}>
      <div
        data-testid="page"
        data-page-side="front"
        className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
      >
        {pageSlots.map((slot) => (
          <div
            key={`${slot.front.card.id}-${slot.front.pagination?.page ?? 0}`}
            className={styles.slot}
          >
            <Card
              card={slot.front.card}
              cardsPerPage={perPage}
              bodyOverride={slot.front.bodyChunk}
              pagination={slot.front.pagination}
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
          {imposeBackPage(pageSlots, perPage, COLS).map((slot, slotIndex) => {
            const slotKey = slot
              ? `${slot.front.card.id}-${slot.front.pagination?.page ?? 0}`
              : `${pageKey}-empty-${slotIndex}`;
            return (
              <div key={`back-${slotKey}`} className={styles.slot}>
                {slot ? getBackContentFor(slot, perPage) : null}
              </div>
            );
          })}
        </div>
      )}
    </Fragment>
  );
})}
```

- [ ] **Step 2.6: Run all tests, confirm no regressions**

Run: `npm test -- src/views/PrintView.test.tsx src/cards/pairSlots.test.ts`

Expected: PASS — every existing PrintView test continues to pass, plus the pairSlots tests from Task 1. Because `contentOnBack: false` is hardcoded, no slot has a `back`, so behavior is byte-for-byte unchanged from before this task.

- [ ] **Step 2.7: Run typecheck and biome**

Run: `npm run build`

Expected: PASS — no TypeScript errors. (Biome runs in the pre-commit hook; if it reformats anything in the next step, accept the reformatting.)

- [ ] **Step 2.8: Commit**

```bash
git add src/views/PrintView.tsx
git commit -m "refactor(print): consume PrintSlot[] in PrintView pipeline"
```

---

## Task 3: Sub-toggle UI with disabled state (TDD)

This task adds the visible sub-toggle, helptext, CSS, and the disabled-state test. The toggle's value is held in component state but is *not yet wired* into `pairSlots` — that happens in Task 4. So adding the toggle here changes no behavior on paper output.

**Files:**
- Modify: `src/views/PrintView.test.tsx`
- Modify: `src/views/PrintView.tsx`
- Modify: `src/views/PrintView.module.css`

- [ ] **Step 3.1: Write the failing tests**

Append these tests inside the `describe("<PrintView>")` block in `src/views/PrintView.test.tsx`:

```tsx
test("renders a 'Continue content on back' switch", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  expect(
    screen.getByRole("switch", { name: /continue content on back/i }),
  ).toBeInTheDocument();
});

test("'Continue content on back' is disabled when 'Print backs' is off", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  const continueSwitch = screen.getByRole("switch", {
    name: /continue content on back/i,
  });
  expect(continueSwitch).toBeDisabled();
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  expect(continueSwitch).not.toBeDisabled();
});

test("sub-toggle helptext shows the disabled-state hint only when 'Print backs' is off", async () => {
  const cards = makeCardRow.buildList(2);
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  expect(
    screen.getByText(/Print page 2 of a multi-page card on the back of page 1/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Enable Print backs to use this option/i),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  expect(
    screen.queryByText(/Enable Print backs to use this option/i),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 3.2: Run the new tests, confirm they fail**

Run: `npm test -- src/views/PrintView.test.tsx`

Expected: FAIL — the "Continue content on back" switch and helptext aren't rendered yet.

- [ ] **Step 3.3: Add `contentOnBack` state and the sub-toggle markup**

In `src/views/PrintView.tsx`:

After the existing `const [printBacks, setPrintBacks] = useState(false);`, add:
```ts
const [contentOnBack, setContentOnBack] = useState(false);
```

Replace the existing `<div className={styles.switchBlock}>` block in the sidebar with:

```tsx
<div className={styles.switchBlock}>
  <Switch isSelected={printBacks} onChange={setPrintBacks}>
    Print backs
  </Switch>
  <div className={styles.helptext}>
    <p>Adds a second page of card backs for double-sided printing.</p>
    {printBacks && (
      <p>
        In the print dialog, choose <em>Flip on {flipEdge}</em> (sometimes labelled{" "}
        <em>{flipLabel}</em>).
      </p>
    )}
  </div>
  <div className={styles.subSwitch}>
    <Switch
      isSelected={contentOnBack}
      onChange={setContentOnBack}
      isDisabled={!printBacks}
    >
      Continue content on back
    </Switch>
    <div className={styles.helptext}>
      <p>
        Print page 2 of a multi-page card on the back of page 1, instead of using
        a separate slot.
      </p>
      {!printBacks && <p>Enable Print backs to use this option.</p>}
    </div>
  </div>
</div>
```

- [ ] **Step 3.4: Add `.subSwitch` CSS**

Append to `src/views/PrintView.module.css` inside the screen-only UI section (after the existing `.switchBlock` and `.helptext` rules, before the `.divider` rule):

```css
.subSwitch {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-left: var(--space-4);
}
```

- [ ] **Step 3.5: Run the tests, confirm they pass**

Run: `npm test -- src/views/PrintView.test.tsx`

Expected: PASS — all three new tests green; all pre-existing PrintView tests still green.

- [ ] **Step 3.6: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.module.css src/views/PrintView.test.tsx
git commit -m "feat(print): add 'Continue content on back' sub-toggle with disabled state"
```

---

## Task 4: Wire `contentOnBack` and verify paired-flow behavior (TDD)

This is the task where the toggle becomes load-bearing. Tests for the actual paired flow come first; then the one-line wiring change in `pairSlots`'s argument flips them green.

**Files:**
- Modify: `src/views/PrintView.test.tsx`
- Modify: `src/views/PrintView.tsx`

- [ ] **Step 4.1: Write the failing paired-flow tests**

Append these tests inside the `describe("<PrintView>")` block in `src/views/PrintView.test.tsx`:

```tsx
test("places page-2 on the back of page-1's slot when both toggles are on (mixed deck)", async () => {
  const twoPager = makeCardRow.build({ body: "TWO" });
  const onePager = makeCardRow.build({ body: "ONE" });
  vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
    body === "TWO" ? ["TWO-pg1", "TWO-pg2"] : [body],
  );
  server.use(
    http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([twoPager, onePager])),
  );
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  await userEvent.click(
    screen.getByRole("switch", { name: /continue content on back/i }),
  );
  // Front page: two slots — twoPager pg1 (slot 0), onePager (slot 1).
  // Back imposition: back-slot 0 = back-of front-slot-1 (onePager → icon),
  //                  back-slot 1 = back-of front-slot-0 (twoPager pg2).
  const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
  expect(backPage).not.toBeNull();
  const slots = Array.from(backPage.children) as HTMLElement[];
  expect(slots).toHaveLength(2);
  expect(slots[0]!.querySelector('[data-role="card-back-root"]')).not.toBeNull();
  expect(slots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("TWO-pg2");
});

test("4-page card paired flow at 4-up", async () => {
  const card = makeCardRow.build({ body: "X" });
  vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
    body === "X" ? ["pg1", "pg2", "pg3", "pg4"] : [body],
  );
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  await userEvent.click(
    screen.getByRole("switch", { name: /continue content on back/i }),
  );
  // Front: slot 0 = pg1, slot 1 = pg3.
  // Back imposition: back-slot 0 = back-of front-slot-1 (pg4),
  //                  back-slot 1 = back-of front-slot-0 (pg2).
  const frontPage = document.querySelector('[data-page-side="front"]') as HTMLElement;
  const frontSlots = Array.from(frontPage.children) as HTMLElement[];
  expect(frontSlots[0]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg1");
  expect(frontSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg3");

  const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
  const backSlots = Array.from(backPage.children) as HTMLElement[];
  expect(backSlots[0]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg4");
  expect(backSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg2");
});

test("3-page card paired flow at 4-up — last back slot falls back to icon", async () => {
  const card = makeCardRow.build({ body: "X" });
  vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
    body === "X" ? ["pg1", "pg2", "pg3"] : [body],
  );
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
  await userEvent.click(
    screen.getByRole("switch", { name: /continue content on back/i }),
  );
  // Front: slot 0 = pg1, slot 1 = pg3.
  // Back imposition: back-slot 0 = back-of front-slot-1 (pg3 → no back → icon),
  //                  back-slot 1 = back-of front-slot-0 (pg2).
  const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
  const backSlots = Array.from(backPage.children) as HTMLElement[];
  expect(backSlots[0]!.querySelector('[data-role="card-back-root"]')).not.toBeNull();
  expect(backSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg2");
});

test("'Continue content on back' selected state persists across disable/re-enable", async () => {
  const card = makeCardRow.build({ body: "X" });
  vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
    body === "X" ? ["pg1", "pg2"] : [body],
  );
  server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
  render(wrap(<PrintView deckId="d1" />));
  await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  const printBacks = screen.getByRole("switch", { name: /print backs/i });
  const continueOnBack = screen.getByRole("switch", {
    name: /continue content on back/i,
  });
  await userEvent.click(printBacks);
  await userEvent.click(continueOnBack);
  expect(continueOnBack).toBeChecked();
  await userEvent.click(printBacks); // disable backs
  expect(continueOnBack).toBeDisabled();
  expect(continueOnBack).toBeChecked(); // selection persists
  await userEvent.click(printBacks); // re-enable backs
  expect(continueOnBack).not.toBeDisabled();
  expect(continueOnBack).toBeChecked();
  // Paired flow resumes: pg2 lands on the back.
  const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
  const backSlots = Array.from(backPage.children) as HTMLElement[];
  expect(backSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg2");
});
```

- [ ] **Step 4.2: Run the new tests, confirm they fail**

Run: `npm test -- src/views/PrintView.test.tsx`

Expected: FAIL — the four new tests fail because `pairSlots` is still called with `contentOnBack: false`. The earlier tests still pass.

- [ ] **Step 4.3: Wire the toggle**

In `src/views/PrintView.tsx`, change:

```ts
const printSlots = pairSlots(physicalCards, { contentOnBack: false });
```
to:
```ts
const printSlots = pairSlots(physicalCards, {
  contentOnBack: printBacks && contentOnBack,
});
```

The `printBacks &&` guard means the sub-toggle has no effect when "Print backs" is off — see the spec's *Risks / things to watch* for why this guard belongs here.

- [ ] **Step 4.4: Run the full test suite, confirm everything passes**

Run: `npm test`

Expected: PASS — all PrintView tests (existing + new), pairSlots tests, and every other test in the suite green. If any pre-existing test fails, the wiring or refactor introduced a regression — investigate before moving on.

- [ ] **Step 4.5: Run typecheck**

Run: `npm run build`

Expected: PASS — no TypeScript errors.

- [ ] **Step 4.6: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.test.tsx
git commit -m "feat(print): print page 2+ on card backs when 'Continue content on back' is on"
```

---

## Task 5: Manual print verification

CSS testing only confirms the DOM. The actual goal is paper that aligns when duplexed. This task is a manual procedure — there is no automated assertion. Document the result in the PR description (photo, or a one-line "verified on Brother HL-L2350DW, both 4-up and 2-up").

**Files:** none (manual procedure)

- [ ] **Step 5.1: Start the dev server**

Run: `npm run dev`

Open the printed app in a browser; sign in if needed; navigate to a deck.

- [ ] **Step 5.2: Build a deck containing one 2-page card and verify**

Add an item or spell card to the deck whose body is long enough to overflow a single physical page (use `src/views/EditorView.tsx`, paste roughly two paragraphs of body content). Open the deck's print view, set 4-up portrait, toggle both "Print backs" and "Continue content on back" on. The screen preview should show one front page with one slot and one back page with one slot containing page 2's content.

Print to real paper, duplex long-edge.

Expected on paper: a single sheet, page 1 of the card on the front face, page 2 on the back face, oriented so flipping the card the long way reveals page 2 right-side-up.

- [ ] **Step 5.3: Verify the mixed-deck case**

Add a second short (1-page) card to the same deck. Reload the print view. Screen preview should show one front page with two slots (the 2-pager's pg1 and the 1-pager) and one back page with two slots (the 2-pager's pg2 in the slot mirroring its pg1, and an icon back in the slot mirroring the 1-pager).

Print, duplex. Verify alignment within ~1 mm.

- [ ] **Step 5.4: Verify the 3-page card case**

Replace the 2-pager with a longer card whose body produces 3 physical pages. Screen preview should show one front page with two slots (pg1 and pg3) and one back page with pg2 in the slot mirroring pg1 and an icon back in the slot mirroring pg3.

Print, duplex. Confirm the 3-page card is printed across two physical card slots: one double-sided (pg1/pg2), one with pg3 on the front and the icon on the back.

- [ ] **Step 5.5: Document in the PR description**

When opening the PR, include:
- Hardware tested (printer model, paper size).
- Screenshot or photo of one verification case.
- Any printer-specific quirks (e.g., minor margin shifts).

If a duplex printer isn't available, single-sided front + single-sided back overlaid against a window is an acceptable proxy. State this explicitly in the PR description.

---

## Notes for the implementer

- **Don't reach for `data-card-id` on paired slots.** Front and back of a paired slot share `card.id`, so reading `data-card-id` to disambiguate which page landed where will mislead. The test plan uses rendered body text inside `[data-role="card-body"]` for paired-flow assertions — follow the same approach if you add cases.
- **Footer "Card 2 of 2" stays on a back-rendered page.** This is intentional (see the spec's *Risks*). Don't suppress it on the back face — that would require new props on `<Card>` and is explicitly out of scope.
- **Imposition is content-agnostic.** `imposeBackPage` and `backSlotIndex` are not modified. If a back slot prints in the wrong location, the bug is in `pairSlots` or `getBackContentFor`, not the imposition helper.
- **`isDisabled` on `Switch` is a passthrough.** `src/lib/ui/Switch.tsx` simply forwards props to react-aria-components' `Switch`, which handles `aria-disabled` automatically.
- **Biome is authoritative.** If the pre-commit hook reformats, accept the reformatting and move on.
