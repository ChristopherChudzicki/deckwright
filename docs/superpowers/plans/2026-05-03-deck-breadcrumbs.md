# Deck Breadcrumbs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global header's static "Decks" nav link with a breadcrumb (`Decks › <deckName>`) that resolves the current deck from the URL on all `/deck/$deckId/...` routes.

**Architecture:** A new `DeckBreadcrumb` component reads the current pathname via TanStack Router's `useLocation`, parses out `deckId`, and uses the existing `useDeck` query to fetch the name. On the deck root the name renders as plain text with `aria-current="page"`; on the editor and print routes it renders as a link back to the deck. The component is mounted from `Root.tsx` in the existing nav slot.

**Tech Stack:** React 18 + TypeScript, TanStack Router (`useLocation`), TanStack Query (`useDeck`), CSS Modules. Tests with Vitest + RTL + MSW; the router is mocked the same way `HomeView.test.tsx` and `DeckView.test.tsx` mock it.

**Spec:** `docs/superpowers/specs/2026-05-03-deck-breadcrumbs-design.md`

---

## File Structure

- **Create:** `src/app/DeckBreadcrumb.tsx` — the component, all render branches.
- **Create:** `src/app/DeckBreadcrumb.test.tsx` — covers no-deck, deck-root, editor, print, loading, not-found, long-name states.
- **Modify:** `src/app/Root.tsx` — replace the static `<Link to="/">Decks</Link>` with `<DeckBreadcrumb />`.
- **Modify:** `src/app/root.module.css` — add `.breadcrumb`, `.crumbList`, `.separator`, `.crumbCurrent`, `.crumbName` styles.

No new factories, no shared primitive in `src/lib/ui/` (it's a one-off header element).

---

### Task 1: Failing test — "no deck context renders a single Decks link"

**Files:**
- Create: `src/app/DeckBreadcrumb.test.tsx`
- (Will create) `src/app/DeckBreadcrumb.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/DeckBreadcrumb.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeckBreadcrumb } from "./DeckBreadcrumb";

let mockPathname = "/";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => ({ pathname: mockPathname }),
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
  };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("DeckBreadcrumb", () => {
  it("renders just a Decks link when not under a deck route", () => {
    mockPathname = "/";
    render(wrap(<DeckBreadcrumb />));
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    const links = screen.getAllByRole("link", { name: /decks/i });
    expect(nav).toContainElement(links[0]);
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: FAIL — module `./DeckBreadcrumb` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/DeckBreadcrumb.tsx`:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import styles from "./root.module.css";

export function DeckBreadcrumb() {
  const { pathname } = useLocation();
  const deckId = parseDeckId(pathname);

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol className={styles.crumbList}>
        <li>
          <Link to="/" className={styles.link}>
            Decks
          </Link>
        </li>
        {deckId && (
          <>
            <li aria-hidden="true" className={styles.separator}>
              ›
            </li>
            <li>…</li>
          </>
        )}
      </ol>
    </nav>
  );
}

function parseDeckId(pathname: string): string | undefined {
  const m = pathname.match(/^\/deck\/([^/]+)/);
  return m?.[1];
}
```

(The `…` placeholder will be replaced in Task 2.)

- [ ] **Step 4: Run test to confirm it passes**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/DeckBreadcrumb.tsx src/app/DeckBreadcrumb.test.tsx
git commit -m "Add DeckBreadcrumb skeleton with no-deck state"
```

---

### Task 2: Deck-root state — name rendered as current page

**Files:**
- Modify: `src/app/DeckBreadcrumb.test.tsx`
- Modify: `src/app/DeckBreadcrumb.tsx`

- [ ] **Step 1: Write the failing test**

Append to `DeckBreadcrumb.test.tsx`:

```tsx
import { HttpResponse, http } from "msw";
import { makeDeckRow } from "../test/factories";
import { server } from "../test/msw";

const SB = "http://localhost:54321";
```

(Add those imports near the existing imports — preserve alphabetical order Biome may enforce.)

Then add inside `describe("DeckBreadcrumb", ...)`:

```tsx
it("renders the deck name as current page on /deck/$id", async () => {
  const deck = makeDeckRow.build();
  mockPathname = `/deck/${deck.id}`;
  server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
  render(wrap(<DeckBreadcrumb />));

  expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/");
  const current = await screen.findByText(deck.name);
  expect(current).toHaveAttribute("aria-current", "page");
  expect(current.tagName).not.toBe("A");
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: 1 PASS, 1 FAIL — the new test fails because the component renders `…` instead of the deck name.

- [ ] **Step 3: Implement deck-root branch**

Replace the body of `DeckBreadcrumb.tsx`:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { useDeck } from "../decks/queries";
import styles from "./root.module.css";

export function DeckBreadcrumb() {
  const { pathname } = useLocation();
  const { deckId, isAtDeckRoot } = parsePathname(pathname);
  const deckQuery = useDeck(deckId);

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol className={styles.crumbList}>
        <li>
          <Link to="/" className={styles.link}>
            Decks
          </Link>
        </li>
        {deckId && (
          <>
            <li aria-hidden="true" className={styles.separator}>
              ›
            </li>
            <li>{renderDeckCrumb(deckQuery.data?.name, isAtDeckRoot)}</li>
          </>
        )}
      </ol>
    </nav>
  );
}

function renderDeckCrumb(name: string | undefined, isAtDeckRoot: boolean) {
  if (!name) return "…";
  if (isAtDeckRoot) {
    return (
      <span aria-current="page" className={styles.crumbCurrent}>
        {name}
      </span>
    );
  }
  // Editor / print — link back to the deck. Wired up in Task 3.
  return name;
}

function parsePathname(pathname: string): { deckId: string | undefined; isAtDeckRoot: boolean } {
  const m = pathname.match(/^\/deck\/([^/]+)(\/.*)?$/);
  if (!m) return { deckId: undefined, isAtDeckRoot: false };
  return { deckId: m[1], isAtDeckRoot: !m[2] };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/DeckBreadcrumb.tsx src/app/DeckBreadcrumb.test.tsx
git commit -m "Render deck name as current page on /deck/\$id"
```

---

### Task 3: Editor + print states — deck name as link

**Files:**
- Modify: `src/app/DeckBreadcrumb.test.tsx`
- Modify: `src/app/DeckBreadcrumb.tsx`

- [ ] **Step 1: Write the failing tests**

Append two tests inside `describe("DeckBreadcrumb", ...)`:

```tsx
it("renders the deck name as a link on the editor route", async () => {
  const deck = makeDeckRow.build();
  mockPathname = `/deck/${deck.id}/edit/new`;
  server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
  render(wrap(<DeckBreadcrumb />));

  const deckLink = await screen.findByRole("link", { name: deck.name });
  expect(deckLink).toHaveAttribute("href", "/deck/$deckId");
  expect(deckLink).not.toHaveAttribute("aria-current");
});

it("renders the deck name as a link on the print route", async () => {
  const deck = makeDeckRow.build();
  mockPathname = `/deck/${deck.id}/print`;
  server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
  render(wrap(<DeckBreadcrumb />));

  const deckLink = await screen.findByRole("link", { name: deck.name });
  expect(deckLink).toHaveAttribute("href", "/deck/$deckId");
});
```

(Note: the test mock replaces `Link` with `<a href={to}>`, so the `href` is the literal `to` prop, not a resolved URL — same convention as `DeckView.test.tsx`.)

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: 2 PASS, 2 FAIL — the deck name renders as plain text on these routes, not as a link.

- [ ] **Step 3: Update `renderDeckCrumb` to emit a Link when not at root**

In `DeckBreadcrumb.tsx`, replace `renderDeckCrumb`:

```tsx
function renderDeckCrumb(
  name: string | undefined,
  isAtDeckRoot: boolean,
  deckId: string,
) {
  if (!name) return "…";
  if (isAtDeckRoot) {
    return (
      <span aria-current="page" className={styles.crumbCurrent}>
        {name}
      </span>
    );
  }
  return (
    <Link
      to="/deck/$deckId"
      params={{ deckId }}
      className={styles.link}
      title={name}
    >
      {name}
    </Link>
  );
}
```

And update the call site (now passes `deckId` since it's required):

```tsx
<li>{renderDeckCrumb(deckQuery.data?.name, isAtDeckRoot, deckId)}</li>
```

(The `deckId &&` outer guard ensures this branch only runs when `deckId` is a string.)

- [ ] **Step 4: Run tests**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/DeckBreadcrumb.tsx src/app/DeckBreadcrumb.test.tsx
git commit -m "Make deck crumb a link on editor and print routes"
```

---

### Task 4: Loading state — show ellipsis while query is pending

**Files:**
- Modify: `src/app/DeckBreadcrumb.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
it("shows an ellipsis while the deck query is pending", async () => {
  const deck = makeDeckRow.build();
  mockPathname = `/deck/${deck.id}`;
  let resolve: ((res: Response) => void) | undefined;
  server.use(
    http.get(
      `${SB}/rest/v1/decks`,
      () => new Promise<Response>((r) => { resolve = r; }),
    ),
  );
  render(wrap(<DeckBreadcrumb />));

  expect(await screen.findByText("…")).toBeInTheDocument();
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument();

  resolve?.(HttpResponse.json([deck]));
  await screen.findByText(deck.name);
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: 5 PASS — this should already work because Task 2's `renderDeckCrumb` returns `"…"` when `name` is undefined.

If it does pass: skip step 3 and go to step 4.

- [ ] **Step 3 (only if test failed):** Investigate. The `useDeck` query starts in `pending` state, so `deckQuery.data` should be `undefined`. If the test fails, check that the `…` is rendered inside the `<li>` — adjust the assertion to `getByRole("listitem")` if needed.

- [ ] **Step 4: Commit**

```bash
git add src/app/DeckBreadcrumb.test.tsx
git commit -m "Pin loading state behavior"
```

---

### Task 5: Not-found state — collapse to just "Decks"

**Files:**
- Modify: `src/app/DeckBreadcrumb.test.tsx`
- Modify: `src/app/DeckBreadcrumb.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
it("collapses to just Decks when the deck is not found", async () => {
  mockPathname = "/deck/missing";
  server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([])));
  render(wrap(<DeckBreadcrumb />));

  // Wait until the query resolves (the ellipsis disappears).
  await screen.findByRole("link", { name: "Decks" });
  // Give React Query a tick to settle, then assert the trail is collapsed.
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText("›")).not.toBeInTheDocument();
  expect(screen.queryByText("…")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: FAIL — separator and ellipsis are still rendered.

- [ ] **Step 3: Distinguish "loading" from "loaded but empty"**

In `DeckBreadcrumb.tsx`, change the gating around the separator + deck crumb so that once the query is no longer pending and returned no deck, we collapse:

```tsx
{deckId && (deckQuery.isPending || deckQuery.data) && (
  <>
    <li aria-hidden="true" className={styles.separator}>
      ›
    </li>
    <li>{renderDeckCrumb(deckQuery.data?.name, isAtDeckRoot, deckId)}</li>
  </>
)}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/DeckBreadcrumb.tsx src/app/DeckBreadcrumb.test.tsx
git commit -m "Collapse breadcrumb to 'Decks' when deck not found"
```

---

### Task 6: Long deck name — title attribute carries full name

**Files:**
- Modify: `src/app/DeckBreadcrumb.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
it("sets the full deck name on title for a truncated link", async () => {
  const longName = "A Very Long Deck Name That Will Overflow Twenty Four Characters";
  const deck = makeDeckRow.build({ name: longName });
  mockPathname = `/deck/${deck.id}/edit/new`;
  server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
  render(wrap(<DeckBreadcrumb />));

  const link = await screen.findByRole("link", { name: longName });
  expect(link).toHaveAttribute("title", longName);
});
```

(This is one of the rare cases where overriding the factory `name` is justified — the test specifically exercises the long-name code path.)

- [ ] **Step 2: Run test**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: PASS — the link branch already sets `title={name}` in Task 3.

If it fails (e.g., title not yet wired): add `title={name}` to the editor/print Link.

- [ ] **Step 3: Add the same title to the current-page span**

For consistency on the deck root (where the name is plain text):

```tsx
return (
  <span aria-current="page" className={styles.crumbCurrent} title={name}>
    {name}
  </span>
);
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run src/app/DeckBreadcrumb.test.tsx`
Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/DeckBreadcrumb.tsx src/app/DeckBreadcrumb.test.tsx
git commit -m "Set title attr on deck crumb for truncation hover"
```

---

### Task 7: Wire the breadcrumb into Root, remove the static link

**Files:**
- Modify: `src/app/Root.tsx`

- [ ] **Step 1: Replace the `<nav>` block with `<DeckBreadcrumb />`**

Open `src/app/Root.tsx`. Current:

```tsx
import { Link, Outlet } from "@tanstack/react-router";
import { UserMenu } from "../lib/ui/UserMenu";
import styles from "./root.module.css";

export function Root() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          D&amp;D Cards
        </Link>
        <nav aria-label="Primary" className={styles.nav}>
          <Link to="/" className={styles.link} activeProps={{ className: styles.active }}>
            Decks
          </Link>
        </nav>
        <UserMenu />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
```

Replace with:

```tsx
import { Link, Outlet } from "@tanstack/react-router";
import { UserMenu } from "../lib/ui/UserMenu";
import { DeckBreadcrumb } from "./DeckBreadcrumb";
import styles from "./root.module.css";

export function Root() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          D&amp;D Cards
        </Link>
        <DeckBreadcrumb />
        <UserMenu />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`
Expected: all 226 tests pass (225 baseline + 7 new − 6 since some count toward existing files… actually new test file adds 7 tests, total ≈ 232). Confirm 0 failures.

- [ ] **Step 3: Commit**

```bash
git add src/app/Root.tsx
git commit -m "Use DeckBreadcrumb in global header"
```

---

### Task 8: CSS — separator, current crumb, truncation

**Files:**
- Modify: `src/app/root.module.css`

- [ ] **Step 1: Add new rules**

Append to `src/app/root.module.css` (after `.active`, before `.main`):

```css
.breadcrumb {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.crumbList {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.crumbList li {
  display: flex;
  align-items: center;
  min-width: 0;
}

.separator {
  color: var(--color-text-muted, var(--color-text));
  opacity: 0.5;
}

.crumbCurrent {
  font-weight: 600;
  max-width: 24ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crumbList .link {
  max-width: 24ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Also remove the now-unused `.nav` and `.active` rules (the static nav is gone). Check first whether anything else references them — `grep -rn "styles.nav\|styles.active" src` — and only delete if no remaining users.

- [ ] **Step 2: Verify nothing else references the deleted classes**

Run: `grep -rn "styles\\.nav\\|styles\\.active" src`
Expected: no matches (or only matches that are inside `Root.tsx` which we just edited — there should be none).

- [ ] **Step 3: Delete `.nav` and `.active` from `root.module.css`** (only if grep was clean).

- [ ] **Step 4: Re-run tests**

Run: `npm test -- --run`
Expected: still all green. CSS changes don't affect test assertions (they assert on roles/text/attrs).

- [ ] **Step 5: Commit**

```bash
git add src/app/root.module.css
git commit -m "Style breadcrumb separator, current crumb, and truncation"
```

---

### Task 9: Final verification — biome, build, manual visual check

- [ ] **Step 1: Biome check**

Run: `npx biome check src/app/DeckBreadcrumb.tsx src/app/DeckBreadcrumb.test.tsx src/app/Root.tsx src/app/root.module.css`
Expected: no errors. If Biome reformats anything, accept the reformat (`npx biome check --write` on the same files), then re-run.

- [ ] **Step 2: Type check + build**

Run: `npm run build`
Expected: succeeds with no TS errors.

- [ ] **Step 3: Full test run**

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev` (in background or new shell). Open the browser and verify:
1. On `/` (Decks list) — header shows `Decks` only, as a link.
2. Click into a deck — header shows `Decks › <DeckName>`, with `Decks` clickable, name as plain bold text.
3. Click "Edit" on a card — header shows `Decks › <DeckName>` with both clickable. Click `<DeckName>` — should navigate back to the deck.
4. Click "Print" — same two-link breadcrumb. Click `<DeckName>` — back to deck.
5. Hard-refresh `/deck/<id>/edit/<cardId>` — verify the `…` placeholder appears briefly (or not at all if cache is warm), then the deck name resolves.
6. Visit `/deck/missing-id` — header collapses to just `Decks`.
7. Verify the UserMenu is still visible at far right; resize narrower until truncation kicks in.

- [ ] **Step 5: Commit only if any changes were needed**

(Steps 1–3 should require no code changes. Step 4 is verification only.)

---

## Self-review checklist

(Run after writing the plan, before handoff.)

- **Spec coverage:**
  - Render rules per route → Task 1 (no-deck), 2 (deck root), 3 (editor + print) ✓
  - Loading state → Task 4 ✓
  - Error / not-found state → Task 5 ✓
  - Long deck names → Task 6 + Task 8 (CSS truncation) ✓
  - Component placement (Root.tsx) → Task 7 ✓
  - Accessibility (`<nav aria-label="Breadcrumb">`, `<ol>`/`<li>`, `aria-current="page"`, `aria-hidden` separator) → Task 1 (nav+ol), Task 2 (aria-current), Task 5 (separator aria-hidden) ✓
  - Tests cover each state → Tasks 1–6 ✓

- **Placeholder scan:** No "TBD"/"TODO"/"add appropriate" in steps. Code blocks present where steps change code. ✓

- **Type consistency:** `parsePathname` defined in Task 2, used in Tasks 2–5; signature unchanged. `renderDeckCrumb` signature evolves (Task 2: 2 args; Task 3: 3 args) — Task 3 explicitly updates the call site. ✓
