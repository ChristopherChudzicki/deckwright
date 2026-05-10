# Mobile header & footer cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclaim header space at narrow viewports by stopping the brand from wrapping, hiding the redundant single-segment breadcrumb, unifying the signed-out CTA into a compact `Sign in` link, and moving the GitHub link into a new site footer.

**Architecture:** All changes are scoped to the app shell (`src/app/`) and the existing `UserMenu` primitive. A new `Footer` component is added; the header loses one element (GitHub icon link) and one wrap target (the lone `Decks` breadcrumb). `UserMenu` collapses two signed-out branches into one. Touches no view code (`HomeView`, `EditorView`, `PrintView`, etc.) and no print rules.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Router, CSS modules, Vitest + RTL, react-aria-components.

**Spec:** `docs/superpowers/specs/2026-05-09-mobile-header-footer-design.md`

---

## File map

**New:**
- `src/app/Footer.tsx` — site footer (GitHub link)
- `src/app/Footer.module.css` — footer styles
- `src/app/Footer.test.tsx` — footer unit tests
- `src/app/Root.test.tsx` — chrome split tests (banner vs. contentinfo)

**Modified:**
- `src/app/Root.tsx` — mount `<Footer />`; remove GitHub icon `<a>` and `REPO_URL`; add a flex spacer between breadcrumb and `UserMenu`
- `src/app/root.module.css` — `white-space: nowrap` on `.brand`; new `.spacer { flex: 1 }`; mobile `@media (max-width: 640px)` rule for `.header { gap }`; delete `.iconLink` rules
- `src/app/DeckBreadcrumb.tsx` — return `null` when no deck id is in the route
- `src/app/DeckBreadcrumb.test.tsx` — flip the two tests that asserted a lone `Decks` link
- `src/lib/ui/UserMenu.tsx` — collapse `unauthenticated` + `is_anonymous` branches into one `Sign in` link
- `src/lib/ui/UserMenu.module.css` — delete `.pillCta` rules
- `src/lib/ui/UserMenu.test.tsx` — update the anonymous-user test to assert the unified `Sign in` link

---

## Task 1: Footer component

**Files:**
- Create: `src/app/Footer.tsx`
- Create: `src/app/Footer.module.css`
- Test: `src/app/Footer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/Footer.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "../test/render";
import { Footer } from "./Footer";

describe("<Footer>", () => {
  it("renders a contentinfo landmark", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("links to the GitHub repo with a visible label", () => {
    render(<Footer />);
    const link = within(screen.getByRole("contentinfo")).getByRole("link", {
      name: /view source on github/i,
    });
    expect(link).toHaveAttribute("href", "https://github.com/ChristopherChudzicki/dnd-cards");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
    expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/Footer.test.tsx`
Expected: FAIL — `Cannot find module './Footer'`.

- [ ] **Step 3: Write the styles**

Create `src/app/Footer.module.css`:

```css
.footer {
  text-align: center;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: inherit;
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.link:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.link:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

@media print {
  .footer {
    display: none;
  }
}
```

- [ ] **Step 4: Write the component**

Create `src/app/Footer.tsx`:

```tsx
import { GitHubLogo } from "../lib/ui/icons/GitHubLogo";
import styles from "./Footer.module.css";

const REPO_URL = "https://github.com/ChristopherChudzicki/dnd-cards";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>
        <GitHubLogo size={16} />
        <span>View source on GitHub</span>
      </a>
    </footer>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/app/Footer.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/Footer.tsx src/app/Footer.module.css src/app/Footer.test.tsx
git commit -m "feat(app): add site footer with GitHub source link"
```

---

## Task 2: Mount the footer in Root and drop the header GitHub icon

This task TDDs the chrome split: GitHub link must move from header to footer in one atomic change so the link is never absent.

**Files:**
- Test: `src/app/Root.test.tsx` (new)
- Modify: `src/app/Root.tsx`
- Modify: `src/app/root.module.css`

- [ ] **Step 1: Write the failing test**

Create `src/app/Root.test.tsx`. The Root pulls in router, session, and Supabase queries; mock all three minimally so the test only exercises the chrome split.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionContext, type SessionState } from "../auth/useSession";
import { render, screen, within } from "../test/render";
import { Root } from "./Root";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...rest
    }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
      <a href={to as string} {...rest}>
        {children}
      </a>
    ),
    Outlet: () => null,
    useLocation: () => ({ pathname: "/" }),
  };
});

const loadingSession: SessionState = { status: "loading", user: null, session: null };

function renderRoot() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={loadingSession}>
        <Root />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("<Root>", () => {
  it("does not render the GitHub link inside the header", () => {
    renderRoot();
    const banner = screen.getByRole("banner");
    expect(within(banner).queryByRole("link", { name: /github/i })).not.toBeInTheDocument();
  });

  it("renders the GitHub link inside the footer", () => {
    renderRoot();
    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: /view source on github/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/Root.test.tsx`
Expected: FAIL — first test fails because the GitHub `<a>` is still in the header; second test fails because there is no `<footer>` element.

- [ ] **Step 3: Update `Root.tsx` — mount footer, drop GitHub `<a>`**

Replace the contents of `src/app/Root.tsx`:

```tsx
import { Link, Outlet } from "@tanstack/react-router";
import { Announcement, AnnouncementProvider } from "../lib/ui/Announcement";
import { UserMenu } from "../lib/ui/UserMenu";
import { DeckBreadcrumb } from "./DeckBreadcrumb";
import { Footer } from "./Footer";
import styles from "./root.module.css";

export function Root() {
  return (
    <AnnouncementProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link to="/" className={styles.brand}>
            D&amp;D Cards
          </Link>
          <DeckBreadcrumb />
          <UserMenu />
        </header>
        <main className={styles.main}>
          <Announcement />
          <Outlet />
        </main>
        <Footer />
      </div>
    </AnnouncementProvider>
  );
}
```

The `REPO_URL` constant and `GitHubLogo` import are gone (the footer owns them now).

- [ ] **Step 4: Delete the dead `.iconLink` styles**

In `src/app/root.module.css`, delete this block (lines 47–64 in the current file):

```css
.iconLink {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
}

.iconLink:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.iconLink:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/app/Root.test.tsx src/app/Footer.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/Root.tsx src/app/root.module.css src/app/Root.test.tsx
git commit -m "feat(app): move GitHub link from header to footer"
```

---

## Task 3: Brand `nowrap` and mobile header gap

CSS-only. No unit test — verified manually in Task 7.

**Files:**
- Modify: `src/app/root.module.css`

- [ ] **Step 1: Add `white-space: nowrap` to `.brand`**

In `src/app/root.module.css`, the `.brand` block currently reads:

```css
.brand {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-lg);
  color: var(--color-text);
  text-decoration: none;
  letter-spacing: 0.02em;
  border-radius: var(--radius-sm);
}
```

Add one line so it becomes:

```css
.brand {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-lg);
  color: var(--color-text);
  text-decoration: none;
  letter-spacing: 0.02em;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
```

- [ ] **Step 2: Add a mobile gap rule**

Append to `src/app/root.module.css`, **before** the existing `@media print` block at the bottom:

```css
@media (max-width: 640px) {
  .header {
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
}
```

(The padding tweak from `--space-5` to `--space-4` on the horizontal axis trims a few extra pixels at narrow widths. Vertical padding stays at `--space-3`.)

- [ ] **Step 3: Re-run the existing chrome tests as a regression guard**

Run: `npm test -- src/app/`
Expected: PASS — Footer, Root, DeckBreadcrumb tests all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/root.module.css
git commit -m "style(header): nowrap brand and tighten gap on mobile"
```

---

## Task 4: Conditional breadcrumb + Root spacer

Make the breadcrumb render nothing when there's no sub-deck context. Add an explicit flex spacer in `Root.tsx` so the right-aligned `UserMenu` stays right-aligned when the breadcrumb is empty.

**Files:**
- Modify: `src/app/DeckBreadcrumb.tsx`
- Modify: `src/app/DeckBreadcrumb.test.tsx`
- Modify: `src/app/Root.tsx`
- Modify: `src/app/root.module.css`

- [ ] **Step 1: Update the two failing-target tests in `DeckBreadcrumb.test.tsx`**

In `src/app/DeckBreadcrumb.test.tsx`:

Replace the first test (currently "renders just a Decks link when not under a deck route", around lines 43–51) with:

```tsx
it("renders nothing when not under a deck route", () => {
  mockPathname = "/";
  const { container } = render(wrap(<DeckBreadcrumb />));
  expect(container).toBeEmptyDOMElement();
});
```

Replace the second test (currently "renders just a Decks link on the deck root route", around lines 53–62) with:

```tsx
it("renders nothing on the deck root route", () => {
  const deck = makePublicDeck.build();
  mockPathname = `/deck/${deck.id}`;
  server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)));
  const { container } = render(wrap(<DeckBreadcrumb />));
  expect(container).toBeEmptyDOMElement();
});
```

Update the "collapses to just Decks when the deck is not found" test (around lines 107–115) so it asserts the entire breadcrumb collapses:

```tsx
it("collapses to nothing when the deck is not found", async () => {
  mockPathname = "/deck/missing/edit/new";
  server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(null)));
  const { container } = render(wrap(<DeckBreadcrumb />));

  await waitFor(() => expect(container).toBeEmptyDOMElement());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/app/DeckBreadcrumb.test.tsx`
Expected: FAIL — the three updated tests fail because the current `DeckBreadcrumb` always renders a `<nav>` with at least the `Decks` link.

- [ ] **Step 3: Update `DeckBreadcrumb.tsx` to return null when there's no deck id**

Replace the contents of `src/app/DeckBreadcrumb.tsx`:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { useDeck } from "../decks/queries";
import styles from "./root.module.css";

export function DeckBreadcrumb() {
  const { pathname } = useLocation();
  const deckId = parseSubdeckRoute(pathname);
  const deckQuery = useDeck(deckId);

  if (!deckId) return null;
  if (!deckQuery.isPending && !deckQuery.data) return null;

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol className={styles.crumbList}>
        <li>
          <Link to="/" className={styles.link}>
            Decks
          </Link>
        </li>
        <li aria-hidden="true" className={styles.separator}>
          ›
        </li>
        <li>{renderDeckLink(deckQuery.data?.name, deckId)}</li>
      </ol>
    </nav>
  );
}

function renderDeckLink(name: string | undefined, deckId: string) {
  if (!name) return "…";
  return (
    <Link to="/deck/$deckId" params={{ deckId }} className={styles.link} title={name}>
      {name}
    </Link>
  );
}

// Matches /deck/$deckId/<something>. Returns undefined on the deck root itself,
// so the breadcrumb stays hidden there (the deck name is already shown as the
// page H2; chrome doesn't repeat it).
function parseSubdeckRoute(pathname: string): string | undefined {
  const m = pathname.match(/^\/deck\/([^/]+)\/.+$/);
  return m?.[1];
}
```

The two new short-circuits — `if (!deckId) return null` and `if (!deckQuery.isPending && !deckQuery.data) return null` — replace the previous behavior of always rendering at least a `Decks` crumb.

- [ ] **Step 4: Add a spacer to `Root.tsx`**

In `src/app/Root.tsx`, add a `<div className={styles.spacer} />` between `<DeckBreadcrumb />` and `<UserMenu />`. The full updated `<header>` block:

```tsx
<header className={styles.header}>
  <Link to="/" className={styles.brand}>
    D&amp;D Cards
  </Link>
  <DeckBreadcrumb />
  <div className={styles.spacer} />
  <UserMenu />
</header>
```

- [ ] **Step 5: Add `.spacer` to `root.module.css`**

Append (anywhere above the `@media print` and `@media (max-width: 640px)` blocks at the bottom — alphabetical/positional order isn't enforced in this file):

```css
.spacer {
  flex: 1;
}
```

- [ ] **Step 6: Run the affected tests to verify they pass**

Run: `npm test -- src/app/`
Expected: PASS — DeckBreadcrumb, Root, Footer all green. The remaining DeckBreadcrumb tests (sub-route rendering, ellipsis-while-pending, long-name title) keep working because the deck-id branch is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/app/DeckBreadcrumb.tsx src/app/DeckBreadcrumb.test.tsx src/app/Root.tsx src/app/root.module.css
git commit -m "refactor(breadcrumb): hide single-segment crumb; add header spacer"
```

---

## Task 5: Unify the signed-out `UserMenu` branches

**Files:**
- Modify: `src/lib/ui/UserMenu.tsx`
- Modify: `src/lib/ui/UserMenu.module.css`
- Modify: `src/lib/ui/UserMenu.test.tsx`

- [ ] **Step 1: Update the anonymous-user test**

In `src/lib/ui/UserMenu.test.tsx`, replace the test at lines 78–86 ("renders an accent pill linking to /login when the user is anonymous") with:

```tsx
it("renders the same Sign in link when the user is anonymous", () => {
  wrap({
    status: "authenticated",
    user: { id: "anon-1", email: null, is_anonymous: true } as never,
    session: {} as never,
  });
  const link = screen.getByRole("link", { name: "Sign in" });
  expect(link).toHaveAttribute("href", "/login");
});
```

The exact name match (`"Sign in"`, not the regex `/sign in/i`) ensures the test would catch a regression to the longer `Sign in to save your work` copy.

(The "does NOT render the avatar/menu when the user is anonymous" test at lines 88–95 stays unchanged — it still passes since the unified branch returns a link, not a menu trigger.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/ui/UserMenu.test.tsx`
Expected: FAIL on the updated test — the rendered link reads `Sign in to save your work`, which doesn't match `name: "Sign in"`.

- [ ] **Step 3: Update `UserMenu.tsx` to unify the branches**

Replace the contents of `src/lib/ui/UserMenu.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { Menu, MenuItem, MenuTrigger, Popover, Button as RACButton } from "react-aria-components";
import { supabase } from "../../api/supabase";
import { useSession } from "../../auth/useSession";
import styles from "./UserMenu.module.css";

function initialFor(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim();
  if (!trimmed) return "?";
  return trimmed[0]?.toUpperCase() ?? "?";
}

export function UserMenu() {
  const session = useSession();

  if (session.status === "loading") return null;

  const signInLink = (
    <Link to="/login" className={styles.signInLink}>
      Sign in
    </Link>
  );

  if (session.status === "unauthenticated") return signInLink;
  if (session.user.is_anonymous) return signInLink;

  const email = session.user.email ?? "";

  return (
    <MenuTrigger>
      <RACButton aria-label={`Account menu for ${email}`} className={styles.trigger}>
        <span aria-hidden="true">{initialFor(email)}</span>
      </RACButton>
      <Popover className={styles.popover} placement="bottom end">
        <div className={styles.email}>{email}</div>
        <Menu className={styles.menu}>
          <MenuItem
            className={styles.menuItem}
            onAction={() => {
              void supabase.auth.signOut();
            }}
          >
            Sign out
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
```

Two branches now return the shared `signInLink`. `session.user` is correctly narrowed to non-null after the `unauthenticated` check.

- [ ] **Step 4: Delete the dead `.pillCta` styles**

In `src/lib/ui/UserMenu.module.css`, delete this block (lines 75–99 in the current file):

```css
.pillCta {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent);
  color: var(--color-accent-fg);
  border-radius: var(--radius-md);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--fs-sm);
  transition:
    background 0.12s,
    box-shadow 0.12s,
    transform 0.05s;
}

.pillCta:hover {
  background: var(--color-accent-hover);
  box-shadow: var(--shadow-accent);
}

.pillCta:active {
  background: var(--color-accent-active);
  transform: translateY(1px);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/lib/ui/UserMenu.test.tsx`
Expected: PASS — all six tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/UserMenu.tsx src/lib/ui/UserMenu.module.css src/lib/ui/UserMenu.test.tsx
git commit -m "refactor(user-menu): unify anonymous and unauthenticated Sign in"
```

---

## Task 6: Full test pass and build

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, no skipped tests beyond the project's existing ones.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build succeeds (TypeScript + Vite). Any TS error here usually means the `UserMenu` narrowing in Task 5 went wrong — re-check the order of the early returns.

- [ ] **Step 3: No commit (verification only)**

If the suite or build fails, fix and re-run before moving on. Don't proceed to manual verification with a broken build.

---

## Task 7: Manual verification

No automated coverage exists for visual layout; verify by hand.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Anonymous-user mobile check**

Open the app (anonymous session — i.e., `VITE_ANON_USERS_ENABLED=true` and signed in anonymously). In Chrome DevTools, switch to a mobile viewport (e.g., iPhone SE 375×667). On the home route `/`:

- `D&D Cards` brand sits on one line.
- The `Sign in` link is compact (no two-line pill).
- No GitHub icon in the header.
- Footer is visible at the bottom of the viewport with `View source on GitHub` (icon + text).
- Empty-state hero ("No decks yet" + "Create your first deck") is unchanged.

- [ ] **Step 3: Sub-deck route check**

Create a deck if needed, then navigate to `/deck/$id/edit/$cardId`:

- Breadcrumb reads `Decks › <deck name>`.
- All three crumb behaviors still work (clicking `Decks` returns home; clicking the deck name goes to the deck root; the deck name truncates with an ellipsis title at very long names).

- [ ] **Step 4: Print-preview check**

On a deck print page (`/deck/$id/print`), open print preview (`Cmd-P`). The header and the footer are both hidden; the printed sheet looks identical to before.

- [ ] **Step 5: Desktop regression check**

Resize the viewport to a typical desktop width (≥1024px). Header gap returns to `--space-5`, brand and `Sign in` link sit on one row, footer remains at the bottom.

- [ ] **Step 6: Stop the dev server**

Ctrl-C the `npm run dev` process.

---

## Done

After Task 7, all spec items are implemented:

- ✅ Brand no longer wraps (Task 3)
- ✅ Breadcrumb hidden when single-segment (Task 4)
- ✅ Anonymous CTA collapsed to plain `Sign in` (Task 5)
- ✅ GitHub link relocated to footer (Tasks 1–2)
- ✅ Mobile-tightened header gap (Task 3)
- ✅ Header/footer print rules preserved (Tasks 1, 6 verification)

The branch `worktree-mobile-header-footer` is ready for review/PR per project conventions (don't push or open the PR without explicit instruction).
