# Print Range Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google-Drive-style range selection (Shift-click, Cmd/Ctrl-click, and keyboard Shift+Arrow parity) to the "Choose cards to print" modal's card list.

**Architecture:** Replace the modal's hand-rolled `<ul>` of per-row `Checkbox`es with a `react-aria-components` `ListBox` (`selectionMode="multiple"`, `selectionBehavior="toggle"`). `draft: Set<CardId>` stays the source of truth; the ListBox is a controlled view over only the *visible* (post-filter/search) cards, reconciled with selected-but-hidden cards by a pure helper `mergeVisibleSelection`. The per-row checkbox becomes a decorative `aria-hidden` glyph driven by the option's `data-selected`.

**Tech Stack:** React 18 + TypeScript, `react-aria-components@1.17.0`, CSS modules, Vitest + RTL + `@testing-library/user-event`, Fishery factories.

---

## Background the engineer needs

- The modal lives in `src/views/PrintSelectionModal.tsx` (+ `.module.css` + `.test.tsx`). It is opened by `PrintView.tsx`; **do not touch** `PrintView.tsx`, `usePrintSelection.ts`, `deckListing.ts`, or any print-output code.
- **Verified RAC facts** (against the installed source) this plan relies on: ListBox supports `selectionMode="multiple"` + `selectionBehavior="toggle"`; Shift-extend is **additive** (selects the anchor→target range, never deselects); `escapeKeyBehavior="none"` lets Escape close the parent Dialog; ListBox ships **no** selection live-announcer (so the modal's existing polite total region is the sole announcer); a real focusable checkbox inside `role="option"` is invalid — use a decorative glyph; the selection-checkbox accessible name is generic, so tests query the **option** (`getByRole("option", { name })`) not a checkbox.
- **House rules** (from `CLAUDE.md`): prefer `getByRole`; factories pass no values they don't assert on; **no `!` non-null assertions** (use `const [x] = arr; if (!x) throw new Error(...)`); `npm test` / `npm run build` are pre-approved; Biome's formatter is authoritative.
- **Run tests/build from the worktree.** The worktree has a `node_modules` symlink to the repo root, so `npx vitest` / `npm run build` work.
- **Two listboxes after this change:** the Sort control (`src/lib/ui/Select.tsx`) is itself a RAC `ListBox` whose items are `role="option"`. The card list also becomes a listbox. So tests **must scope** card-row queries to the card listbox (`within(screen.getByRole("listbox", { name: /cards to print/i }))`) to avoid matching the Sort dropdown's options.

## File Structure

- **Create** `src/views/printSelectionMerge.ts` — pure `mergeVisibleSelection(draft, visibleIds, keys)`; one responsibility (reconcile the ListBox's visible selection with hidden-selected cards). Colocated with the existing `printSelectionLabel.ts`.
- **Create** `src/views/printSelectionMerge.test.ts` — unit tests for the helper (correctness lives here, RAC-independent).
- **Modify** `src/views/PrintSelectionModal.tsx` — swap the `<ul>`/`Checkbox` list for a `ListBox`; wire `selectedKeys`/`onSelectionChange` through the helper; reuse the helper for the header toggle; add the one-line hint. Header checkbox, search, filters, sort, footer, Apply/Cancel unchanged.
- **Modify** `src/views/PrintSelectionModal.module.css` — move the row grid onto listbox options; add the decorative glyph, option focus ring, and hint styles.
- **Modify** `src/views/PrintSelectionModal.test.tsx` — migrate per-row selectors (`checkbox`→`option`, `toBeChecked`→`aria-selected`), keep header queries as `checkbox`, scope to the card listbox, and add new range/keyboard/structure tests.

---

## Task 1: Pure selection-merge helper

**Files:**
- Create: `src/views/printSelectionMerge.ts`
- Test: `src/views/printSelectionMerge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/printSelectionMerge.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { CardId } from "../cards/types";
import { mergeVisibleSelection } from "./printSelectionMerge";

const ids = (...xs: string[]) => xs as CardId[];

describe("mergeVisibleSelection", () => {
  test("keeps selected-but-hidden cards when the visible selection changes", () => {
    const draft = new Set(ids("a", "b", "hidden"));
    const visibleIds = ids("a", "b"); // 'hidden' is filtered out of the list
    const next = mergeVisibleSelection(draft, visibleIds, new Set(ids("a")));
    expect(next).toEqual(new Set(ids("a", "hidden")));
  });

  test('the "all" sentinel selects every visible id, plus hidden', () => {
    const draft = new Set(ids("hidden"));
    const visibleIds = ids("a", "b");
    const next = mergeVisibleSelection(draft, visibleIds, "all");
    expect(next).toEqual(new Set(ids("hidden", "a", "b")));
  });

  test("drops a key that is not in visibleIds (intersection invariant)", () => {
    const draft = new Set<CardId>();
    const visibleIds = ids("a", "b");
    const next = mergeVisibleSelection(draft, visibleIds, new Set(ids("a", "ghost")));
    expect(next).toEqual(new Set(ids("a")));
  });

  test("an empty visible set does not drop hidden-selected cards", () => {
    const draft = new Set(ids("hidden1", "hidden2"));
    const visibleIds: CardId[] = [];
    const next = mergeVisibleSelection(draft, visibleIds, new Set<CardId>());
    expect(next).toEqual(new Set(ids("hidden1", "hidden2")));
  });

  test("is idempotent: re-applying the current visible selection is content-equal", () => {
    const draft = new Set(ids("a", "hidden"));
    const visibleIds = ids("a", "b");
    const current = new Set(visibleIds.filter((id) => draft.has(id))); // { a }
    expect(mergeVisibleSelection(draft, visibleIds, current)).toEqual(draft);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/views/printSelectionMerge.test.ts`
Expected: FAIL — "Failed to resolve import ... ./printSelectionMerge" (module doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/views/printSelectionMerge.ts`:

```ts
import type { Key } from "react-aria-components";
import type { CardId } from "../cards/types";

/**
 * Merge the ListBox's visible selection back into the full print draft,
 * preserving cards that are selected but currently hidden by a filter/search.
 * RAC's `onSelectionChange` emits "all" (Cmd/Ctrl+A) or a Set of the visible keys.
 */
export function mergeVisibleSelection(
  draft: ReadonlySet<CardId>,
  visibleIds: readonly CardId[],
  keys: "all" | ReadonlySet<Key>,
): Set<CardId> {
  const visible = new Set<CardId>(visibleIds);
  const next = new Set<CardId>();
  // Selected-but-hidden cards (in the draft, not currently visible) survive untouched.
  for (const id of draft) {
    if (!visible.has(id)) next.add(id);
  }
  // Add back the visible selection — intersection with visibleIds narrows Key -> CardId
  // and guarantees the result is a subset of (hidden ∪ visibleIds).
  for (const id of visibleIds) {
    if (keys === "all" || keys.has(id)) next.add(id);
  }
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/views/printSelectionMerge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: builds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/printSelectionMerge.ts src/views/printSelectionMerge.test.ts
git commit -m "feat(print): add mergeVisibleSelection helper for the picker"
```

---

## Task 2: Migrate the modal list to a ListBox (preserve existing behavior)

This task rewrites the list rendering and migrates the existing test selectors together (the DOM shape changes, so old `checkbox` selectors can't be kept). Behavior is preserved; new gestures are tested in Task 3.

**Files:**
- Modify: `src/views/PrintSelectionModal.test.tsx` (full replacement below)
- Modify: `src/views/PrintSelectionModal.tsx` (full replacement below)
- Modify: `src/views/PrintSelectionModal.module.css` (full replacement below)

- [ ] **Step 1: Replace the test file with the migrated selectors**

Overwrite `src/views/PrintSelectionModal.test.tsx` with:

```tsx
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { itemCardFactory, spellCardFactory } from "../cards/factories";
import type { CardId, RenderableCard } from "../cards/types";
import { render, screen, within } from "../test/render";
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

// The card list is one of two listboxes in the modal (the Sort control is the
// other), so scope row queries to it by its accessible name.
const cardList = () => screen.getByRole("listbox", { name: /cards to print/i });
const cardOption = (name: string | RegExp) => within(cardList()).getByRole("option", { name });
const cardOptions = (name: RegExp) => within(cardList()).getAllByRole("option", { name });

describe("<PrintSelectionModal>", () => {
  test("lists every renderable card as an option, recency-sorted (newest first)", () => {
    const older = itemCardFactory.build({ name: "Older", updatedAt: "2026-05-01T00:00:00Z" });
    const newer = itemCardFactory.build({ name: "Newer", updatedAt: "2026-05-20T00:00:00Z" });
    const cards = [older, newer];
    open(cards, allIds(cards));
    const rows = cardOptions(/Older|Newer/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName("Newer");
    expect(rows[1]).toHaveAccessibleName("Older");
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
    const committed = onApply.mock.calls[0]?.[0] as Set<string>;
    expect([...committed].sort()).toEqual([...allIds(cards)].sort());
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("Cancel discards the draft (onApply not called) and closes", async () => {
    const cards = itemCardFactory.buildList(2);
    const { onApply } = open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected cards");
    await userEvent.click(cardOption(first.name));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("toggling a card updates the Apply total", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
    const [first] = cards;
    if (!first) throw new Error("expected cards");
    await userEvent.click(cardOption(first.name));
    expect(screen.getByRole("button", { name: "Apply (2 cards)" })).toBeInTheDocument();
  });

  test("kind and timestamp are decorative — the option's name is just the card name", () => {
    const card = itemCardFactory.build({ name: "Cloak", updatedAt: "2026-05-23T11:00:00Z" });
    open([card], allIds([card]));
    expect(cardOption("Cloak")).toHaveAccessibleName("Cloak");
  });

  test("a spell and an item both appear when present", () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    expect(cardOption("Cloak")).toBeInTheDocument();
    expect(cardOption("Bless")).toBeInTheDocument();
  });

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

  test("header checkbox is indeterminate (mixed) when some visible are selected", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(cardOption(first.name));
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    expect(header).toBePartiallyChecked();
  });

  test("clicking an indeterminate header clears all visible", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(cardOption(first.name)); // now 2 of 3
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    await userEvent.click(header);
    expect(screen.getByRole("button", { name: "Apply (0 cards)" })).toBeInTheDocument();
  });

  test("header shows 'X of Y shown' status, associated with the checkbox", () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    expect(screen.getByText("3 of 3 shown")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /select all shown cards/i }),
    ).toHaveAccessibleDescription(/3 of 3 shown/);
  });

  test("the Kind filter defaults to All", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(screen.getByRole("radio", { name: /^all/i })).toBeChecked();
  });

  test("shows an empty state when no cards match, hiding the Updated header", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "zzzzz");
    expect(screen.getByText("No cards match.")).toBeInTheDocument();
    expect(screen.getByText("0 of 0 shown")).toBeInTheDocument();
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
  });

  test("Kind filter hides the other kind without deselecting it", async () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("radio", { name: /items/i }));
    expect(within(cardList()).queryByRole("option", { name: "Bless" })).not.toBeInTheDocument();
    expect(cardOption("Cloak")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /all/i }));
    expect(cardOption("Bless")).toHaveAttribute("aria-selected", "true");
  });

  test("name search narrows the list case-insensitively", async () => {
    const a = itemCardFactory.build({ name: "Acid Arrow" });
    const b = itemCardFactory.build({ name: "Bless" });
    open([a, b], allIds([a, b]));
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "acid");
    expect(cardOption("Acid Arrow")).toBeInTheDocument();
    expect(within(cardList()).queryByRole("option", { name: "Bless" })).not.toBeInTheDocument();
  });

  test("hidden-checked line appears when a filter hides a selected card", async () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("radio", { name: /items/i }));
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    expect(screen.getByText("1 of 1 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply (2 cards)" })).toBeInTheDocument();
  });

  test("Clear filters link restores the full list and removes the hidden-checked line", async () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("radio", { name: /items/i }));
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(cardOption("Bless")).toBeInTheDocument();
    expect(screen.queryByText(/hidden by filters/i)).not.toBeInTheDocument();
  });

  test("exposes a polite live region announcing the selected total", () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const live = screen.getByText(/3 cards selected/i);
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  test("Clear filters resets a name search and restores hidden selected cards", async () => {
    const cloak = itemCardFactory.build({ name: "Cloak" });
    const bless = spellCardFactory.build({ name: "Bless" });
    const cards = [cloak, bless];
    open(cards, allIds(cards));
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "cloak");
    expect(within(cardList()).queryByRole("option", { name: "Bless" })).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(cardOption("Bless")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search cards/i })).toHaveValue("");
  });

  test("sorting by name reorders rows alphabetically", async () => {
    // Recency order (default) is Bravo (newer) then Alpha (older); name sort flips it.
    const bravo = itemCardFactory.build({ name: "Bravo", updatedAt: "2026-05-20T00:00:00Z" });
    const alpha = itemCardFactory.build({ name: "Alpha", updatedAt: "2026-05-01T00:00:00Z" });
    const cards = [bravo, alpha];
    open(cards, allIds(cards));
    let rows = cardOptions(/Alpha|Bravo/);
    expect(rows[0]).toHaveAccessibleName("Bravo");
    expect(rows[1]).toHaveAccessibleName("Alpha");
    const sortTrigger = screen.getByRole("button", { name: /sort/i });
    expect(sortTrigger).toHaveTextContent(/recently edited/i);
    await userEvent.click(sortTrigger);
    // The Sort dropdown is a separate listbox; its "Name" option is unambiguous here.
    await userEvent.click(screen.getByRole("option", { name: "Name" }));
    rows = cardOptions(/Alpha|Bravo/);
    expect(rows[0]).toHaveAccessibleName("Alpha");
    expect(rows[1]).toHaveAccessibleName("Bravo");
  });
});
```

- [ ] **Step 2: Run the modal tests to verify they fail**

Run: `npx vitest run src/views/PrintSelectionModal.test.tsx`
Expected: FAIL — `cardList()` finds no `listbox` named "Cards to print" (the list is still a `<ul>`), so most tests error.

- [ ] **Step 3: Rewrite the component**

Overwrite `src/views/PrintSelectionModal.tsx` with:

```tsx
import { useId, useMemo, useState } from "react";
import { ListBox, ListBoxItem, TextField } from "react-aria-components";
import type { CardId, RenderableCard } from "../cards/types";
import { type DeckKindFilter, type DeckSort, deckListing } from "../decks/deckListing";
import { pluralize } from "../lib/pluralize";
import { relativeTime } from "../lib/relativeTime";
import { Button } from "../lib/ui/Button";
import { Checkbox } from "../lib/ui/Checkbox";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { Select } from "../lib/ui/Select";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import { mergeVisibleSelection } from "./printSelectionMerge";
import styles from "./PrintSelectionModal.module.css";

type Props = {
  cards: RenderableCard[];
  initialSelection: Set<CardId>;
  onApply: (next: Set<CardId>) => void;
  onClose: () => void;
};

export function PrintSelectionModal({ cards, initialSelection, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Set<CardId>>(() => new Set(initialSelection));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DeckSort>("updated");
  const [kind, setKind] = useState<DeckKindFilter>("all");

  const { cards: listed, counts } = useMemo(
    () => deckListing(cards, { kind, sort }),
    [cards, kind, sort],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? listed.filter((c) => c.name.toLowerCase().includes(q)) : listed;
  }, [listed, search]);

  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const visibleCheckedCount = useMemo(
    () => visibleIds.filter((id) => draft.has(id)).length,
    [visibleIds, draft],
  );
  const allVisibleChecked = visible.length > 0 && visibleCheckedCount === visible.length;
  const headerIndeterminate = !allVisibleChecked && visibleCheckedCount > 0;

  const selectedKeys = useMemo(
    () => new Set(visibleIds.filter((id) => draft.has(id))),
    [visibleIds, draft],
  );

  // Intentionally ignores RAC's onChange boolean: RAC passes `true` when clicked
  // from the indeterminate state, but the rule is always "any visible checked → clear".
  const onHeaderToggle = () => {
    const next = visibleCheckedCount > 0 ? new Set<CardId>() : ("all" as const);
    setDraft((prev) => mergeVisibleSelection(prev, visibleIds, next));
  };

  const hiddenSelectedCount = useMemo(() => {
    const visibleIdSet = new Set(visibleIds);
    return cards.filter((c) => draft.has(c.id) && !visibleIdSet.has(c.id)).length;
  }, [cards, draft, visibleIds]);

  const clearFilters = () => {
    setKind("all");
    setSearch("");
  };

  const total = draft.size;
  const shownCountId = useId();
  const hintId = useId();

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
        <div className={styles.modalContainer}>
          <DialogHeader title="Choose cards to print" onClose={onClose} />

          <div className={styles.searchRow}>
            <TextField aria-label="Search cards" className={styles.searchField}>
              <Input
                type="search"
                placeholder="Search cards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </TextField>
          </div>

          <div className={styles.toolbar}>
            <ToggleButtonGroup
              aria-label="Filter by kind"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[kind]}
              onSelectionChange={(keys) => {
                const next = Array.from(keys)[0];
                if (next === "all" || next === "item" || next === "spell") setKind(next);
              }}
            >
              <ToggleButton id="all">All ({counts.all})</ToggleButton>
              <ToggleButton id="item">Items ({counts.item})</ToggleButton>
              <ToggleButton id="spell">Spells ({counts.spell})</ToggleButton>
            </ToggleButtonGroup>
            <Select
              label="Sort"
              selectedKey={sort}
              onSelectionChange={(key) => setSort(key as DeckSort)}
              items={[
                { id: "updated", label: "Recently edited" },
                { id: "name", label: "Name" },
              ]}
            />
          </div>

          <div className={styles.bulkRow}>
            <Checkbox
              aria-label="Select all shown cards"
              aria-describedby={shownCountId}
              isSelected={allVisibleChecked}
              isIndeterminate={headerIndeterminate}
              onChange={onHeaderToggle}
            />
            <span id={shownCountId} className={styles.shownCount}>
              {visibleCheckedCount} of {visible.length} shown
            </span>
            {visible.length > 0 && (
              <span className={styles.colHeader} aria-hidden="true">
                Updated
              </span>
            )}
          </div>

          <p className={styles.hint} id={hintId}>
            Shift-click or Shift+↑/↓ to select a range.
          </p>

          <ListBox
            aria-label="Cards to print"
            aria-describedby={hintId}
            className={styles.list}
            selectionMode="multiple"
            selectionBehavior="toggle"
            escapeKeyBehavior="none"
            selectedKeys={selectedKeys}
            onSelectionChange={(keys) =>
              setDraft((prev) => mergeVisibleSelection(prev, visibleIds, keys))
            }
            items={visible}
            renderEmptyState={() => <span className={styles.emptyState}>No cards match.</span>}
          >
            {(c) => (
              <ListBoxItem id={c.id} textValue={c.name} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.box} aria-hidden="true" />
                  <span className={styles.rowName}>{c.name}</span>
                </span>
                <span className={styles.rowKind} aria-hidden="true">
                  {c.kind}
                </span>
                <time className={styles.rowTime} dateTime={c.updatedAt} aria-hidden="true">
                  {relativeTime(c.updatedAt)}
                </time>
              </ListBoxItem>
            )}
          </ListBox>

          <div className={styles.footer}>
            {hiddenSelectedCount > 0 && (
              <p className={styles.hiddenLine}>
                {`${hiddenSelectedCount} selected ${hiddenSelectedCount === 1 ? "card" : "cards"} ${
                  hiddenSelectedCount === 1 ? "is" : "are"
                } hidden by filters — still included when you Apply.`}{" "}
                <button type="button" className={styles.clearFiltersLink} onClick={clearFilters}>
                  Clear filters
                </button>
              </p>
            )}
            <span className={styles.srOnly} aria-live="polite">
              {`${pluralize(total, "card")} selected`}
            </span>
            <div className={styles.footerActions}>
              <Button variant="secondary" onPress={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
              >
                {`Apply (${pluralize(total, "card")})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogShell>
  );
}
```

- [ ] **Step 4: Rewrite the stylesheet**

Overwrite `src/views/PrintSelectionModal.module.css` with:

```css
.modalContainer {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.searchRow {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.searchField {
  display: block;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.bulkRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.shownCount {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.colHeader {
  margin-left: auto;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.hint {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.row:last-child {
  border-bottom: 0;
}

.row[data-focus-visible] {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: -2px;
}

.rowMain {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.rowName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box {
  width: 1.1rem;
  height: 1.1rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.row[data-selected] .box {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.row[data-selected] .box::after {
  content: "✓";
  color: var(--color-accent-fg);
  font-size: 0.8rem;
  line-height: 1;
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

.emptyState {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-muted);
  margin: auto;
}

.footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-2);
}

.footerActions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.hiddenLine {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
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

.clearFiltersLink:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
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

- [ ] **Step 5: Run the modal tests to verify they pass**

Run: `npx vitest run src/views/PrintSelectionModal.test.tsx`
Expected: PASS (all migrated tests). If a test still queries a row as `checkbox`, fix it to use `cardOption(...)`.

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: builds clean. If TS objects to `selectedKeys={selectedKeys}` (Set vs Selection), the value is correct — confirm the prop accepts `Iterable<Key>`; do not cast unless required.

- [ ] **Step 7: Commit**

```bash
git add src/views/PrintSelectionModal.tsx src/views/PrintSelectionModal.module.css src/views/PrintSelectionModal.test.tsx
git commit -m "feat(print): move the card picker list to a multi-select ListBox"
```

---

## Task 3: Add range, keyboard, and structure tests

These verify the new gestures (RAC-provided + our wiring) and the structural a11y contract. They are appended to `PrintSelectionModal.test.tsx` and reuse the `open`, `allIds`, `cardList`, `cardOption` helpers defined in Task 2.

**Files:**
- Modify: `src/views/PrintSelectionModal.test.tsx` (append a new `describe` block + one helper)

- [ ] **Step 1: Append the new tests**

Add this `mk` helper and `describe` block at the **end** of `src/views/PrintSelectionModal.test.tsx` (after the existing `describe(...)` block closes). `mk` builds a card with an explicit `updatedAt` so the recency-sorted DOM order is deterministic (newest first = call order); both `name` and `updatedAt` are asserted-on (name via query, updatedAt via order), so this respects the factory rules.

```tsx
// Newest-first: pass higher day numbers first so recency order == call order.
const mk = (name: string, day: string) =>
  itemCardFactory.build({ name, updatedAt: `2026-05-${day}T00:00:00Z` });

describe("<PrintSelectionModal> range + keyboard selection", () => {
  test("the card list is a multi-selectable listbox; options expose aria-selected", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(cardList()).toHaveAttribute("aria-multiselectable", "true");
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    expect(cardOption(first.name)).toHaveAttribute("aria-selected", "true");
  });

  test("the listbox is described by the range hint", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(cardList()).toHaveAccessibleDescription(/shift-click/i);
  });

  test("Escape closes the modal rather than only clearing selection", async () => {
    const cards = itemCardFactory.buildList(3);
    const { onApply } = open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(cardOption(first.name)); // moves focus into the listbox
    await userEvent.keyboard("{Escape}");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("bare ArrowDown moves focus without changing selection", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, new Set()); // none selected
    const [first, second] = cards;
    if (!first || !second) throw new Error("expected cards");
    cardOption(first.name).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(cardOption(second.name)).toHaveFocus();
    expect(cardOption(first.name)).toHaveAttribute("aria-selected", "false");
    expect(cardOption(second.name)).toHaveAttribute("aria-selected", "false");
  });

  test("a plain click toggles a single card and never replaces the selection", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18")];
    open(cards, allIds(cards)); // all selected
    await user.click(cardOption("A")); // toggle A off; B and C stay
    expect(cardOption("A")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
  });

  test("Shift-click selects the inclusive range (additive)", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18"), mk("D", "17")];
    open(cards, new Set());
    await user.click(cardOption("A"));
    await user.keyboard("{Shift>}");
    await user.click(cardOption("C"));
    await user.keyboard("{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("D")).toHaveAttribute("aria-selected", "false");
  });

  test("Cmd/Ctrl-click toggles a single card without disturbing others", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18")];
    open(cards, new Set());
    await user.click(cardOption("A"));
    await user.keyboard("{Meta>}");
    await user.click(cardOption("C"));
    await user.keyboard("{/Meta}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
  });

  test("Shift+ArrowDown extends the selection by keyboard", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18")];
    open(cards, new Set());
    await user.click(cardOption("A")); // select + anchor + focus A
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "false");
  });

  test("range selection spans only visible rows; a filtered-out selected card is preserved", async () => {
    const user = userEvent.setup();
    const a = itemCardFactory.build({ name: "A", updatedAt: "2026-05-20T00:00:00Z" });
    const b = spellCardFactory.build({ name: "B", updatedAt: "2026-05-19T00:00:00Z" });
    const c = itemCardFactory.build({ name: "C", updatedAt: "2026-05-18T00:00:00Z" });
    const cards = [a, b, c];
    open(cards, new Set([b.id])); // only the spell B is selected
    await user.click(screen.getByRole("radio", { name: /items/i })); // hides B; A, C visible
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    await user.click(cardOption("A"));
    await user.keyboard("{Shift>}");
    await user.click(cardOption("C"));
    await user.keyboard("{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
    // A + C (visible) + B (hidden, preserved) = 3
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
  });

  test("range selection works after changing the sort order", async () => {
    const user = userEvent.setup();
    const bravo = itemCardFactory.build({ name: "Bravo", updatedAt: "2026-05-20T00:00:00Z" });
    const alpha = itemCardFactory.build({ name: "Alpha", updatedAt: "2026-05-18T00:00:00Z" });
    const cards = [bravo, alpha];
    open(cards, new Set());
    await user.click(screen.getByRole("button", { name: /sort/i }));
    await user.click(screen.getByRole("option", { name: "Name" })); // order -> Alpha, Bravo
    await user.click(cardOption("Alpha"));
    await user.keyboard("{Shift>}");
    await user.click(cardOption("Bravo"));
    await user.keyboard("{/Shift}");
    expect(cardOption("Alpha")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("Bravo")).toHaveAttribute("aria-selected", "true");
  });

  test("Cmd/Ctrl+A selects all shown and the header reads checked", async () => {
    const user = userEvent.setup();
    const cards = itemCardFactory.buildList(3);
    open(cards, new Set()); // none
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    cardOption(first.name).focus();
    // jsdom is treated as non-Mac, so Ctrl+A is select-all. If this env resolves as
    // Mac, switch to "{Meta>}a{/Meta}".
    await user.keyboard("{Control>}a{/Control}");
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /select all shown cards/i })).toBeChecked();
  });
});
```

- [ ] **Step 2: Run the modal tests to verify they pass**

Run: `npx vitest run src/views/PrintSelectionModal.test.tsx`
Expected: PASS (all migrated + new tests).
Troubleshooting if any interaction test fails:
- Modifier-held click not registering → ensure `userEvent.setup()` is used and the modifier is held with `user.keyboard("{Shift>}")` *before* `user.click(...)` and released after.
- `Cmd/Ctrl+A` test fails with 0 selected → the env resolved as Mac; change `{Control>}a{/Control}` to `{Meta>}a{/Meta}`.
- `.focus()` doesn't move roving focus → click the option first to enter the listbox, then drive arrows.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run build`
Expected: entire suite passes; build is clean.

- [ ] **Step 4: Commit**

```bash
git add src/views/PrintSelectionModal.test.tsx
git commit -m "test(print): cover range, keyboard, and listbox a11y for the picker"
```

---

## Self-review (author's checklist — already run)

**Spec coverage:** range select (Task 3 Shift-click) · keyboard parity Shift+Arrow/Space/bare-arrow-no-select/Cmd+A (Task 3) · additive single toggle Cmd-click (Task 3) · plain-click never replaces / touch (Task 3) · preserved search/filter/sort/header/hidden-line/Apply/Cancel (Task 2 migrated) · merge + intersection + idempotency (Task 1) · `escapeKeyBehavior` (Task 3 Escape) · one-line hint + `aria-describedby` (Task 2 component + Task 3 describedby) · `aria-multiselectable`/`aria-selected` (Task 3 structure) · decorative kind/time, option name == card name (Task 2 component + decorative test) · `renderEmptyState` (Task 2 empty-state test) · two-listbox scoping (Task 2 helpers + sort test) · focus-visible on option (Task 2 CSS). `PrintView`/pipeline untouched, so no print-output task. Type-ahead and Cmd/Ctrl+Shift+Home/End are RAC-provided and not separately tested (acceptable — pure library behavior).

**Type consistency:** `mergeVisibleSelection(draft, visibleIds, keys)` signature is identical in Task 1 (definition), the component's `onSelectionChange` and `onHeaderToggle` (Task 2), and is RAC-independent. `cardList`/`cardOption`/`cardOptions`/`allIds`/`open`/`mk` are defined once and reused.

**Placeholder scan:** none — every step has full file content or an exact command + expected result.
