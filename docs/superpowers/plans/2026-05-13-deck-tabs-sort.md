# Deck view kind filter & sort — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a kind filter (All / Items / Spells) and a sort dropdown (Last updated / Name) to the deck list at `/deck/$deckId`, with state in URL search params.

**Architecture:** Two pure functions — `deckListing(cards, opts)` (filter + sort + counts) and `validateDeckSearch(raw)` (URL param coercion). `DeckView` reads search params via `useSearch`, runs cards through `deckListing`, and renders a toolbar with `ToggleButtonGroup` (filter) + `MenuTrigger` (sort). Selection writes back to URL via `navigate({ search: prev => ... })`.

**Tech Stack:** React 18, TypeScript (strict, `noUncheckedIndexedAccess`), TanStack Router, react-aria-components, Vitest + RTL + `@testing-library/user-event`, MSW.

**Spec:** [`docs/superpowers/specs/2026-05-13-deck-tabs-sort-design.md`](../specs/2026-05-13-deck-tabs-sort-design.md)

**Conventions used in every task:**
- TDD: write failing test → confirm red → minimal impl → confirm green → commit.
- Tests live next to the module they cover (`foo.ts` + `foo.test.ts`).
- Factories pass only fields the test asserts on (CLAUDE.md rule).
- `getByRole` over text/class selectors.
- Every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- After each task: `npm test -- --run` (full suite) **and** `npm run build` (typecheck) before committing — vitest doesn't enforce `noUncheckedIndexedAccess` (memory note).

---

## Task 1: `deckListing` helper — types, filter, sort, counts

**Files:**
- Create: `src/decks/deckListing.ts`
- Create: `src/decks/deckListing.test.ts`

- [ ] **Step 1: Write failing tests for the helper**

Create `src/decks/deckListing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Card } from "../cards/types";
import { deckListing } from "./deckListing";

function card(overrides: Partial<Card> & Pick<Card, "id" | "kind" | "name" | "updatedAt">): Card {
  return {
    body: "",
    source: "custom",
    headerTags: [],
    footerTags: [],
    createdAt: overrides.updatedAt,
    ...overrides,
  } as Card;
}

describe("deckListing", () => {
  it("returns counts for items, spells, and total across all kinds", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "spell", name: "C", updatedAt: "2026-01-03T00:00:00.000Z" }),
      card({ id: "4", kind: "ability", name: "D", updatedAt: "2026-01-04T00:00:00.000Z" }),
    ];
    const { counts } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(counts).toEqual({ all: 4, item: 2, spell: 1 });
  });

  it("kind=all includes ability cards", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "ability", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("kind=item excludes spells and abilities", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "spell", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "ability", name: "C", updatedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "item", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["1"]);
  });

  it("kind=spell excludes items and abilities", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "spell", name: "B", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "ability", name: "C", updatedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "spell", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["2"]);
  });

  it("sort=updated orders newest first by updatedAt", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "B", updatedAt: "2026-03-01T00:00:00.000Z" }),
      card({ id: "3", kind: "item", name: "C", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(out.map((c) => c.id)).toEqual(["2", "3", "1"]);
  });

  it("sort=name orders A->Z with locale-aware comparison", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "banana", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "Apple", updatedAt: "2026-01-02T00:00:00.000Z" }),
      card({ id: "3", kind: "item", name: "Éclair", updatedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "name" });
    // localeCompare with sensitivity: "base" treats É as E, A < B < É < ... but
    // case-insensitive: Apple, banana, Éclair.
    expect(out.map((c) => c.id)).toEqual(["2", "1", "3"]);
  });

  it("sort=updated tie-break falls through to name ascending", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const cards = [
      card({ id: "1", kind: "item", name: "Bravo", updatedAt: t }),
      card({ id: "2", kind: "item", name: "Alpha", updatedAt: t }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(out.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("sort=updated tie-break falls through to id when name also ties", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const cards = [
      card({ id: "b", kind: "item", name: "Same", updatedAt: t }),
      card({ id: "a", kind: "item", name: "Same", updatedAt: t }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "updated" });
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("sort=name tie-break falls through to id", () => {
    const cards = [
      card({ id: "b", kind: "item", name: "Same", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "a", kind: "item", name: "Same", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const { cards: out } = deckListing(cards, { kind: "all", sort: "name" });
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const cards = [
      card({ id: "1", kind: "item", name: "B", updatedAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", kind: "item", name: "A", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const snapshot = cards.map((c) => c.id);
    deckListing(cards, { kind: "all", sort: "name" });
    expect(cards.map((c) => c.id)).toEqual(snapshot);
  });

  it("returns empty cards with zero counts for empty input", () => {
    const result = deckListing([], { kind: "all", sort: "updated" });
    expect(result).toEqual({ cards: [], counts: { all: 0, item: 0, spell: 0 } });
  });
});
```

- [ ] **Step 2: Run tests to verify red**

```bash
npm test -- --run src/decks/deckListing.test.ts
```

Expected: All tests fail — `deckListing` doesn't exist yet.

- [ ] **Step 3: Implement the helper**

Create `src/decks/deckListing.ts`:

```ts
import type { Card } from "../cards/types";

export const DECK_KIND_FILTERS = ["all", "item", "spell"] as const;
export const DECK_SORTS = ["updated", "name"] as const;

export type DeckKindFilter = (typeof DECK_KIND_FILTERS)[number];
export type DeckSort = (typeof DECK_SORTS)[number];

export type DeckListing = {
  cards: Card[];
  counts: { all: number; item: number; spell: number };
};

const nameCollator = new Intl.Collator(undefined, { sensitivity: "base" });

function compareByName(a: Card, b: Card): number {
  return nameCollator.compare(a.name, b.name);
}

function compareById(a: Card, b: Card): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareByUpdated(a: Card, b: Card): number {
  if (a.updatedAt === b.updatedAt) return 0;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

export function deckListing(
  cards: Card[],
  opts: { kind: DeckKindFilter; sort: DeckSort },
): DeckListing {
  let item = 0;
  let spell = 0;
  for (const c of cards) {
    if (c.kind === "item") item++;
    else if (c.kind === "spell") spell++;
  }

  const filtered =
    opts.kind === "all" ? cards.slice() : cards.filter((c) => c.kind === opts.kind);

  if (opts.sort === "updated") {
    filtered.sort((a, b) => compareByUpdated(a, b) || compareByName(a, b) || compareById(a, b));
  } else {
    filtered.sort((a, b) => compareByName(a, b) || compareById(a, b));
  }

  return { cards: filtered, counts: { all: cards.length, item, spell } };
}
```

- [ ] **Step 4: Run tests to verify green**

```bash
npm test -- --run src/decks/deckListing.test.ts
```

Expected: All 11 tests pass.

- [ ] **Step 5: Run full suite + typecheck**

```bash
npm test -- --run
npm run build
```

Expected: 604+ tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/decks/deckListing.ts src/decks/deckListing.test.ts
git commit -m "$(cat <<'EOF'
feat(decks): add deckListing helper (filter + sort + counts)

Pure function over Card[]. Supports kind filter (all/item/spell),
sort (updated desc / name asc with locale-aware comparison), and
returns counts for the toolbar. Ability cards are visible only
under "all".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `validateDeckSearch` — URL param validator

**Files:**
- Modify: `src/app/router.tsx` (add validator + types, do NOT wire yet)
- Create: `src/app/router.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/router.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDeckSearch } from "./router";

describe("validateDeckSearch", () => {
  it("returns defaults for empty input", () => {
    expect(validateDeckSearch({})).toEqual({ kind: "all", sort: "updated" });
  });

  it("passes valid values through", () => {
    expect(validateDeckSearch({ kind: "spell", sort: "name" })).toEqual({
      kind: "spell",
      sort: "name",
    });
    expect(validateDeckSearch({ kind: "item", sort: "updated" })).toEqual({
      kind: "item",
      sort: "updated",
    });
  });

  it("coerces unknown kind to 'all'", () => {
    expect(validateDeckSearch({ kind: "weapons" }).kind).toBe("all");
  });

  it("coerces unknown sort to 'updated'", () => {
    expect(validateDeckSearch({ sort: "rarity" }).sort).toBe("updated");
  });

  it("coerces non-string values to defaults", () => {
    expect(validateDeckSearch({ kind: 42, sort: null })).toEqual({
      kind: "all",
      sort: "updated",
    });
  });

  it("ignores unknown keys in the input", () => {
    expect(validateDeckSearch({ kind: "spell", sort: "name", extra: "x" })).toEqual({
      kind: "spell",
      sort: "name",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify red**

```bash
npm test -- --run src/app/router.test.ts
```

Expected: All tests fail — `validateDeckSearch` not exported.

- [ ] **Step 3: Add validator + types to `src/app/router.tsx`**

Add these imports near the top (after the existing imports):

```ts
import { DECK_KIND_FILTERS, DECK_SORTS, type DeckKindFilter, type DeckSort } from "../decks/deckListing";
```

Add these exports above the route declarations (e.g., right after `const rootRoute = createRootRoute({ component: Root });`):

```ts
export type DeckSearch = { kind: DeckKindFilter; sort: DeckSort };

export function validateDeckSearch(raw: Record<string, unknown>): DeckSearch {
  const rawKind = raw.kind;
  const rawSort = raw.sort;
  const kind = (DECK_KIND_FILTERS as readonly string[]).includes(rawKind as string)
    ? (rawKind as DeckKindFilter)
    : "all";
  const sort = (DECK_SORTS as readonly string[]).includes(rawSort as string)
    ? (rawSort as DeckSort)
    : "updated";
  return { kind, sort };
}
```

Do NOT wire `validateSearch` into `deckViewRoute` yet — that's Task 3.

- [ ] **Step 4: Run tests to verify green**

```bash
npm test -- --run src/app/router.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 5: Run full suite + typecheck**

```bash
npm test -- --run
npm run build
```

Expected: All tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/router.tsx src/app/router.test.ts
git commit -m "$(cat <<'EOF'
feat(router): add validateDeckSearch for kind+sort URL params

Pure validator that coerces unknown values to defaults. Not yet
wired into deckViewRoute. Unit-tested independently because view
tests mock useNavigate and don't render the real router.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `validateSearch` into `deckViewRoute`

**Files:**
- Modify: `src/app/router.tsx`

This task is structural — no new tests; the validator's own tests already cover behavior. The wire-up is verified by `npm run build` (TS catches a misuse) and by the existing/upcoming `DeckView` tests still passing.

- [ ] **Step 1: Update `deckViewRoute` to call `validateSearch`**

In `src/app/router.tsx`, change the `deckViewRoute` definition to:

```ts
const deckViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId",
  validateSearch: validateDeckSearch,
  component: function DeckViewRoute() {
    const { deckId } = deckViewRoute.useParams();
    return <DeckView deckId={deckId} />;
  },
});
```

- [ ] **Step 2: Typecheck + full suite**

```bash
npm run build
npm test -- --run
```

Expected: build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/router.tsx
git commit -m "$(cat <<'EOF'
feat(router): wire validateDeckSearch onto deckViewRoute

URL search params kind+sort are now coerced to valid values
before reaching DeckView.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: DeckView toolbar — render filter buttons, sort dropdown, and apply listing

**Files:**
- Modify: `src/views/DeckView.tsx`
- Modify: `src/views/DeckView.module.css`
- Modify: `src/views/DeckView.test.tsx` (update existing mock, add new tests)

This is the largest task. The toolbar reads search params, runs cards through `deckListing`, renders filter buttons + sort dropdown, and replaces the list with the filtered+sorted output. Selecting a filter or sort writes back via `navigate({ search })`.

- [ ] **Step 1: Update the router mock at the top of `DeckView.test.tsx`**

Replace lines 16–37 of `src/views/DeckView.test.tsx` with:

```tsx
const navigate = vi.fn();
const useSearchMock = vi.fn<() => { kind: "all" | "item" | "spell"; sort: "updated" | "name" }>(
  () => ({ kind: "all", sort: "updated" }),
);

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      params: _params,
      ...rest
    }: {
      children: ReactNode;
      to?: string;
      params?: Record<string, string>;
    } & Record<string, unknown>) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => navigate,
    useSearch: () => useSearchMock(),
  };
});
```

Add to `beforeEach` blocks (both `describe`s):

```tsx
beforeEach(async () => {
  navigate.mockClear();
  useSearchMock.mockReturnValue({ kind: "all", sort: "updated" });
  await supabase.auth.signOut();
});
```

- [ ] **Step 2: Write failing tests for toolbar rendering, filtering, and sorting**

Add a new `describe` block to `src/views/DeckView.test.tsx`:

```tsx
import { makeSpellPayload, makeItemPayload } from "../test/factories";

describe("DeckView toolbar", () => {
  beforeEach(async () => {
    navigate.mockClear();
    useSearchMock.mockReturnValue({ kind: "all", sort: "updated" });
    await supabase.auth.signOut();
  });

  function setupDeck(opts: { is_owner?: boolean } = {}) {
    const deck = makePublicDeck.build({ is_owner: opts.is_owner ?? true });
    const item1 = makeCardRow.build({
      deck_id: deck.id,
      payload: makeItemPayload.build({
        name: "Alpha Item",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    const item2 = makeCardRow.build({
      deck_id: deck.id,
      payload: makeItemPayload.build({
        name: "Bravo Item",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    });
    const spell1 = makeCardRow.build({
      deck_id: deck.id,
      payload: makeSpellPayload.build({
        name: "Cantrip",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    });
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () =>
        HttpResponse.json([item1, item2, spell1]),
      ),
    );
    return { deck, item1, item2, spell1 };
  }

  it("renders All/Items/Spells filter buttons with counts", async () => {
    setupDeck();
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Items (2)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Spells (1)" })).toBeInTheDocument();
  });

  it("All is selected by default; default sort is Last updated", async () => {
    setupDeck();
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeChecked();
    expect(screen.getByRole("button", { name: /sort.*last updated/i })).toBeInTheDocument();
  });

  it("default render sorts by updatedAt descending", async () => {
    const { item1, item2, spell1 } = setupDeck();
    render(wrap(<DeckView deckId="d" />));
    const rows = await screen.findAllByRole("listitem");
    const names = rows.map((li) => li.querySelector("strong")?.textContent);
    expect(names).toEqual([item2.payload.name, spell1.payload.name, item1.payload.name]);
  });

  it("mounting at kind=spell shows only spells with the Spells filter checked", async () => {
    const { spell1 } = setupDeck();
    useSearchMock.mockReturnValue({ kind: "spell", sort: "updated" });
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "Spells (1)" })).toBeChecked();
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toContain(spell1.payload.name);
  });

  it("mounting at sort=name reorders by name", async () => {
    setupDeck();
    useSearchMock.mockReturnValue({ kind: "all", sort: "name" });
    render(wrap(<DeckView deckId="d" />));
    const rows = await screen.findAllByRole("listitem");
    const names = rows.map((li) => li.querySelector("strong")?.textContent);
    expect(names).toEqual(["Alpha Item", "Bravo Item", "Cantrip"]);
  });

  it("counts stay correct after filtering (counts reflect unfiltered totals)", async () => {
    setupDeck();
    useSearchMock.mockReturnValue({ kind: "item", sort: "updated" });
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Items (2)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Spells (1)" })).toBeInTheDocument();
  });

  it("read-only deck still shows the toolbar", async () => {
    setupDeck({ is_owner: false });
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sort.*last updated/i })).toBeInTheDocument();
  });
});
```

NOTE: `wrap` is the existing helper at lines 39–46 of the file (named `wrap` there). If it's imported under a different name, use that.

- [ ] **Step 3: Run tests to verify red**

```bash
npm test -- --run src/views/DeckView.test.tsx
```

Expected: All new toolbar tests fail — toolbar doesn't render yet.

- [ ] **Step 4: Implement the toolbar in `src/views/DeckView.tsx`**

Update imports at the top of the file:

```tsx
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Button as RACButton,
} from "react-aria-components";
import { deckListing } from "../decks/deckListing";
import { useDeleteCard, useRenameDeck } from "../decks/mutations";
import { useDeck, useDeckCards } from "../decks/queries";
import { Button } from "../lib/ui/Button";
import { IconButton } from "../lib/ui/IconButton";
import { Input } from "../lib/ui/Input";
import { PencilIcon } from "../lib/ui/icons/PencilIcon";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import { TrashIcon } from "../lib/ui/icons/TrashIcon";
import { LoadingState } from "../lib/ui/LoadingState";
import { BrowseApiModal } from "./BrowseApiModal";
import styles from "./DeckView.module.css";
```

Add at the top of the `DeckView` function body, replacing the current `const cards = cardsQuery.data ?? [];` line:

```tsx
const search = useSearch({ from: "/deck/$deckId" });
const navigate = useNavigate();
const rawCards = cardsQuery.data ?? [];
const { cards, counts } = deckListing(rawCards, { kind: search.kind, sort: search.sort });
```

Add the toolbar right above the existing `{cards.length === 0 ? ( ... ) : (` block:

```tsx
{rawCards.length > 0 && (
  <div className={styles.toolbar}>
    <ToggleButtonGroup
      aria-label="Filter by kind"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[search.kind]}
      onSelectionChange={(keys) => {
        const next = Array.from(keys)[0];
        if (next === "all" || next === "item" || next === "spell") {
          navigate({ search: (prev) => ({ ...prev, kind: next }) });
        }
      }}
    >
      <ToggleButton id="all">All ({counts.all})</ToggleButton>
      <ToggleButton id="item">Items ({counts.item})</ToggleButton>
      <ToggleButton id="spell">Spells ({counts.spell})</ToggleButton>
    </ToggleButtonGroup>
    <MenuTrigger>
      <RACButton
        aria-label={`Sort: ${search.sort === "updated" ? "Last updated" : "Name"}`}
        className={styles.sortTrigger}
      >
        Sort: {search.sort === "updated" ? "Last updated" : "Name"}{" "}
        <span aria-hidden="true">▾</span>
      </RACButton>
      <Popover className={styles.sortPopover} placement="bottom end">
        <Menu
          className={styles.sortMenu}
          onAction={(key) => {
            if (key === "updated" || key === "name") {
              navigate({ search: (prev) => ({ ...prev, sort: key }) });
            }
          }}
        >
          <MenuItem id="updated" className={styles.sortMenuItem}>
            Last updated
          </MenuItem>
          <MenuItem id="name" className={styles.sortMenuItem}>
            Name
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  </div>
)}
```

The list section continues to iterate over `cards` (now the filtered+sorted output) — no further change needed to the `<ul>`.

- [ ] **Step 5: Add toolbar styles to `src/views/DeckView.module.css`**

Append to the file:

```css
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.sortTrigger {
  font: inherit;
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.sortTrigger[data-hovered] {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
}

.sortTrigger[data-pressed] {
  background: var(--color-border);
}

.sortTrigger[data-focus-visible] {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.sortPopover {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  outline: none;
}

.sortMenu {
  padding: var(--space-1);
  outline: none;
}

.sortMenuItem {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  cursor: pointer;
  outline: none;
}

.sortMenuItem[data-hovered],
.sortMenuItem[data-focused] {
  background: var(--color-surface-2);
}
```

- [ ] **Step 6: Run tests to verify green**

```bash
npm test -- --run src/views/DeckView.test.tsx
```

Expected: New toolbar tests pass; existing logged-out/owner tests still pass.

- [ ] **Step 7: Run full suite + typecheck**

```bash
npm test -- --run
npm run build
```

Expected: all tests pass; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/views/DeckView.tsx src/views/DeckView.module.css src/views/DeckView.test.tsx
git commit -m "$(cat <<'EOF'
feat(deck): kind filter + sort dropdown on deck view

Renders three filter buttons (All/Items/Spells, with counts) and
a sort dropdown (Last updated/Name) above the deck list. Reads
state from URL search params and applies deckListing to filter +
sort the rendered cards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire filter and sort selection to URL via navigate

**Files:**
- Modify: `src/views/DeckView.test.tsx` (add interaction tests)

Task 4 already wired `onSelectionChange` and `onAction` to `navigate`. This task adds explicit tests verifying the navigate calls so a future regression in those handlers is caught.

- [ ] **Step 1: Write failing tests for interactions**

Add to the `describe("DeckView toolbar", ...)` block:

```tsx
it("clicking Items navigates with kind=item, leaving sort untouched", async () => {
  setupDeck();
  render(wrap(<DeckView deckId="d" />));
  await userEvent.click(await screen.findByRole("radio", { name: "Items (2)" }));
  expect(navigate).toHaveBeenCalledWith({ search: expect.any(Function) });
  const [{ search }] = navigate.mock.calls[navigate.mock.calls.length - 1] as [
    { search: (prev: { kind: string; sort: string }) => { kind: string; sort: string } },
  ];
  expect(search({ kind: "all", sort: "updated" })).toEqual({ kind: "item", sort: "updated" });
});

it("selecting Name from sort menu navigates with sort=name, leaving kind untouched", async () => {
  setupDeck();
  useSearchMock.mockReturnValue({ kind: "spell", sort: "updated" });
  render(wrap(<DeckView deckId="d" />));
  await userEvent.click(await screen.findByRole("button", { name: /sort.*last updated/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Name" }));
  expect(navigate).toHaveBeenCalledWith({ search: expect.any(Function) });
  const [{ search }] = navigate.mock.calls[navigate.mock.calls.length - 1] as [
    { search: (prev: { kind: string; sort: string }) => { kind: string; sort: string } },
  ];
  expect(search({ kind: "spell", sort: "updated" })).toEqual({ kind: "spell", sort: "name" });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --run src/views/DeckView.test.tsx
```

Expected: both new tests pass (handlers are already wired from Task 4).

- [ ] **Step 3: Full suite + typecheck**

```bash
npm test -- --run
npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/DeckView.test.tsx
git commit -m "$(cat <<'EOF'
test(deck): assert navigate calls for filter and sort selection

Captures the search callback and invokes it with a sample prev to
verify produced search object, per the spec's URL assertion pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Empty states — hide toolbar for empty deck, show contextual message for empty filter

**Files:**
- Modify: `src/views/DeckView.tsx`
- Modify: `src/views/DeckView.module.css`
- Modify: `src/views/DeckView.test.tsx`

Task 4 already guards the toolbar render with `rawCards.length > 0`. The list section, however, still uses the old `cards.length === 0 ? "No cards yet."` check — which now also fires when a filter has zero matches, showing the wrong message. Fix the messaging.

- [ ] **Step 1: Write failing tests**

Add to the `describe("DeckView toolbar", ...)` block:

```tsx
it("hides the toolbar when the deck has zero cards", async () => {
  const deck = makePublicDeck.build({ is_owner: true });
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([])),
  );
  render(wrap(<DeckView deckId="d" />));
  await waitFor(() => expect(screen.getByText(/no cards yet/i)).toBeInTheDocument());
  expect(screen.queryByRole("radio", { name: /^all/i })).not.toBeInTheDocument();
});

it("shows 'No spells in this deck.' when the Spells filter has zero matches", async () => {
  setupDeck(); // 2 items, 1 spell
  // Make it items-only by overriding the cards endpoint:
  const deck = makePublicDeck.build({ is_owner: true });
  const item = makeCardRow.build({
    deck_id: deck.id,
    payload: makeItemPayload.build({ name: "Sword" }),
  });
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([item])),
  );
  useSearchMock.mockReturnValue({ kind: "spell", sort: "updated" });
  render(wrap(<DeckView deckId="d" />));
  expect(await screen.findByText(/no spells in this deck/i)).toBeInTheDocument();
  // The Spells count still shows 0, the Items count still shows 1.
  expect(screen.getByRole("radio", { name: "Items (1)" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Spells (0)" })).toBeInTheDocument();
});

it("shows 'No items in this deck.' when the Items filter has zero matches", async () => {
  const deck = makePublicDeck.build({ is_owner: true });
  const spell = makeCardRow.build({
    deck_id: deck.id,
    payload: makeSpellPayload.build({ name: "Bolt" }),
  });
  server.use(
    http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
    http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([spell])),
  );
  useSearchMock.mockReturnValue({ kind: "item", sort: "updated" });
  render(wrap(<DeckView deckId="d" />));
  expect(await screen.findByText(/no items in this deck/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify red**

```bash
npm test -- --run src/views/DeckView.test.tsx
```

Expected: the two empty-filter tests fail (current code says "No cards yet." regardless of filter). The "hides toolbar" test should already pass from Task 4.

- [ ] **Step 3: Update `DeckView.tsx` rendering**

Replace the existing empty/list branch:

```tsx
{cards.length === 0 ? (
  <p className={styles.empty}>No cards yet.</p>
) : (
  <ul className={styles.list}> ... </ul>
)}
```

with:

```tsx
{rawCards.length === 0 ? (
  <p className={styles.empty}>No cards yet.</p>
) : cards.length === 0 ? (
  <p className={styles.empty}>
    {search.kind === "item"
      ? "No items in this deck."
      : search.kind === "spell"
        ? "No spells in this deck."
        : "No cards yet."}
  </p>
) : (
  <ul className={styles.list}> ... </ul>
)}
```

(The `<ul>...</ul>` content is unchanged.)

- [ ] **Step 4: Run tests to verify green**

```bash
npm test -- --run src/views/DeckView.test.tsx
```

Expected: all tests pass, including the two new empty-filter tests.

- [ ] **Step 5: Full suite + typecheck**

```bash
npm test -- --run
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/DeckView.tsx src/views/DeckView.test.tsx
git commit -m "$(cat <<'EOF'
feat(deck): contextual empty-filter messages

When a kind filter yields zero matches in a non-empty deck, show
"No items in this deck." / "No spells in this deck." instead of
the generic "No cards yet." Toolbar stays visible so the user
can pivot back to All.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Confirm full test suite passes**

```bash
npm test -- --run
```

Expected: all tests pass (was 604 at baseline; expect ~620+ after this plan).

- [ ] **Step 2: Confirm build (typecheck) passes**

```bash
npm run build
```

Expected: no TS errors; production build succeeds.

- [ ] **Step 3: Lint check (Biome)**

```bash
npx biome check src
```

Expected: clean. If anything is flagged, accept Biome's reformatting.

- [ ] **Step 4: Manual sanity check in dev**

```bash
npm run dev
```

Open a deck with a mix of items and spells. Verify:
- All / Items / Spells buttons show the right counts.
- Clicking each filter updates the URL and the visible cards.
- Sort dropdown toggles between Last updated / Name and updates URL.
- Refresh while on `?kind=spell&sort=name` lands on the same view.
- A deck with zero cards has no toolbar.
- A deck with only items shows "No spells in this deck." on the Spells filter, with the toolbar still visible.

Stop the dev server when done.

- [ ] **Step 5: Confirm the branch is ready**

```bash
git log --oneline worktree-deck-tabs-sort ^origin/main
```

Expected: a clean sequence of commits — one per task — ready for review.

---

## Self-review against the spec

Each spec requirement maps to a task:

| Spec requirement | Task |
|---|---|
| Three filter buttons (All/Items/Spells) with counts | 4 |
| Sort dropdown (Last updated default, Name) | 4 |
| URL state: `kind`, `sort` with defaults via `validateSearch` | 2 + 3 |
| `validateDeckSearch` coerces unknowns | 2 |
| Pure `deckListing(cards, opts)` helper | 1 |
| Helper: ability cards in `all` only | 1 |
| Sort `updated`: desc with name+id tie-breaks | 1 |
| Sort `name`: locale-aware with id tie-break | 1 |
| Filter buttons use `ToggleButtonGroup` | 4 |
| Sort uses `MenuTrigger`/`Popover`/`Menu` (BrowseApiModal pattern) | 4 |
| Toolbar hidden for zero-card deck | 6 |
| Empty-filter message ("No items/spells in this deck.") | 6 |
| Read-only deck shows toolbar | 4 |
| Counts unchanged after filtering | 4 |
| `navigate({ search: prev => ... })` writes URL on selection | 4 + 5 |

No placeholders. Type names (`DeckKindFilter`, `DeckSort`, `DeckSearch`, `deckListing`, `validateDeckSearch`) are used consistently across tasks.
