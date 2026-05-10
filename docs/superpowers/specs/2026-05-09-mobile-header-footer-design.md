# Mobile header & footer cleanup

## Goal

Reclaim header space at narrow viewports (and reduce noise on desktop) by:

1. Stopping the `D&D Cards` brand from wrapping.
2. Removing the redundant single-segment breadcrumb (`Decks`) when it isn't accompanied by a deck name.
3. Collapsing the anonymous-user CTA from a two-line pill to the same plain `Sign in` link unauthenticated users see.
4. Moving the GitHub link out of the header and into a new site footer.

Out of scope: the empty-state hero on `HomeView`, any other view-specific responsive work, changes to user-state semantics, changes to print output.

## Background

The screenshot that prompted this work is the **anonymous** session state on a narrow viewport:

- The brand wraps to two lines because `.brand` (`src/app/root.module.css:16`) has no `white-space` rule.
- The breadcrumb on `/` renders just a single `Decks` link (`src/app/DeckBreadcrumb.tsx:14`), which duplicates the brand's home link and looks faint next to it.
- Anonymous users get the verbose two-line pill `Sign in to save your work` (`src/lib/ui/UserMenu.tsx:27`); unauthenticated users already get a compact `Sign in` text link (`src/lib/ui/UserMenu.tsx:19`).
- The header carries a GitHub icon link (`src/app/Root.tsx:19`) that doesn't need to be there at every breakpoint.

The `unauthenticated` branch in `UserMenu.tsx` is **not** dead code: with `VITE_ANON_USERS_ENABLED=true` (production) it's the fallback when `signInAnonymously()` errors at the server (`src/auth/AuthProvider.tsx:29`); with the flag off it's the default for everyone. The branch must remain — both code paths just render the same compact link.

## Changes

### 1. Brand: stop wrapping

**File:** `src/app/root.module.css`

Add `white-space: nowrap` to `.brand`. No font-size change. Affects every breakpoint.

### 2. Breadcrumb: only render when there's a deck context

**File:** `src/app/DeckBreadcrumb.tsx`

Replace the current `return (...)` with conditional rendering: when `parseSubdeckRoute(pathname)` returns no id (i.e., on `/`, on `/deck/$id` directly, on `/login`, etc.), render nothing — return `null`.

When it does return an id, render the existing `<nav aria-label="Breadcrumb">` with both crumbs: `Decks › <name|…>`. The `flex: 1` on `.breadcrumb` keeps right-side actions pushed to the edge in that state.

To keep the right-side actions pushed to the edge when the breadcrumb is empty, `Root.tsx` adds an inline spacer between `<DeckBreadcrumb />` and `<UserMenu />` — a `<div className={styles.spacer} />` with `flex: 1`. (`UserMenu`'s `margin-left: auto` covers the same purpose, but an explicit spacer is clearer when reading `Root.tsx` and is robust to future right-aligned siblings.)

### 3. Header gap: tighter on mobile

**File:** `src/app/root.module.css`

Add a `@media (max-width: 640px)` rule that drops `.header`'s `gap` from `--space-5` to `--space-3`. Desktop unchanged.

### 4. UserMenu: one `Sign in` link for both signed-out states

**File:** `src/lib/ui/UserMenu.tsx`

Collapse the `unauthenticated` and `is_anonymous` branches so both render the same compact link. `session.user` is only non-null when `status === "authenticated"`, so the two predicates can't share a single condition expression — instead, hoist the link into a local and return it from each branch:

```tsx
const signInLink = (
  <Link to="/login" className={styles.signInLink}>
    Sign in
  </Link>
);

if (session.status === "unauthenticated") return signInLink;
if (session.user.is_anonymous) return signInLink;
```

The text changes from `Sign in to save your work` to `Sign in` for anonymous users; unauthenticated users see no copy change.

**File:** `src/lib/ui/UserMenu.module.css`

Delete the `.pillCta`, `.pillCta:hover`, and `.pillCta:active` rules — only the deleted branch used them (verified with grep).

### 5. Header: drop the GitHub icon link

**File:** `src/app/Root.tsx`

Remove the `<a href={REPO_URL} ...>` block and the `REPO_URL` constant. They move into the new footer.

**File:** `src/app/root.module.css`

Delete `.iconLink`, `.iconLink:hover`, and `.iconLink:focus-visible` — only the deleted header element used them (verified with grep).

### 6. Footer

**New file:** `src/app/Footer.tsx`

```tsx
import { GitHubLogo } from "../lib/ui/icons/GitHubLogo";
import styles from "./Footer.module.css";

const REPO_URL = "https://github.com/ChristopherChudzicki/dnd-cards";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        <GitHubLogo size={16} />
        <span>View source on GitHub</span>
      </a>
    </footer>
  );
}
```

**New file:** `src/app/Footer.module.css`

- `.footer`: centered text, full width, `padding: var(--space-3) var(--space-5)`, `border-top: 1px solid var(--color-border)`, `font-size: var(--fs-sm)`, `color: var(--color-text-muted)`.
- `.link`: `display: inline-flex; align-items: center; gap: var(--space-2)`, inherits color, no underline. Hover darkens to `--color-text`. Focus ring matches the existing pattern (`outline: 2px solid var(--color-focus-ring); outline-offset: 2px`).
- `@media print { .footer { display: none } }`.

**File:** `src/app/Root.tsx`

Render `<Footer />` after `<main>`, inside the `.shell` div. The shell is already a column flex with `min-height: 100vh` and `<main>` carries `flex: 1` (`root.module.css:101`), so the footer sits at the bottom of short pages and below the fold on long ones — no extra layout work.

## Tests

### `src/app/DeckBreadcrumb.test.tsx` (existing — update)

Two existing tests assert that a `Decks` link is rendered on `/` and on the deck root route. Update both to assert the opposite: `screen.queryByRole("navigation", { name: /breadcrumb/i })` returns `null`, and `screen.queryByRole("link", { name: /decks/i })` returns `null`.

The remaining tests (sub-routes, ellipsis-while-pending, collapse-on-not-found, long-name title) keep the same shape. The "collapses to just Decks when the deck is not found" test needs the strongest update: it should now assert the entire breadcrumb collapses (no nav, no `Decks` link), since there's no longer a single-crumb fallback to fall back to.

### `src/lib/ui/UserMenu.test.tsx` (existing — update)

The existing "anonymous user sees the save-work CTA" assertion needs to flip to "anonymous user sees the same `Sign in` link as unauthenticated". The unauthenticated case stays as-is.

### `src/app/Footer.test.tsx` (new)

- Renders a `<footer>` (queryable via `getByRole("contentinfo")`).
- Contains a link with accessible name `View source on GitHub`, `href` matching the repo URL, `target="_blank"`, and `rel` containing both `noopener` and `noreferrer`.

### `src/app/Root.test.tsx` (new — minimal)

Covers the header/footer split that no other test exercises:

- The GitHub link is **not** in the `<header>` (queryable via `getByRole("banner")`).
- The GitHub link **is** in the `<footer>`.

The existing `UserMenu` and `DeckBreadcrumb` tests cover the rest of the chrome; this file deliberately stays small.

### Manual verification

- `npm run dev`, DevTools mobile viewport, anonymous session on `/`: brand on one line, `Sign in` link compact, no GitHub icon in header, footer with GitHub link visible at the bottom of the viewport.
- Visit `/deck/$id/edit/$cardId`: breadcrumb shows `Decks › <name>` and behaves as before.
- Print preview (`Cmd-P`) on a deck print page: header and footer hidden; print sheets unchanged.

## Risks

- **Layout regression with empty breadcrumb**: removing the breadcrumb on home routes shifts the right-side actions left. The explicit `<div className={styles.spacer} />` with `flex: 1` in `Root.tsx` prevents that — verify in manual testing.
- **CSS deletion**: `.iconLink` and `.pillCta` are confirmed unused outside the deleted call sites (greps recorded above), so deleting them is safe.
- **Print output**: `@page` and print-specific rules are scoped to `Card`, `CardBack`, and `PrintView`. The footer adds its own `@media print { display: none }` matching the header's pattern, so nothing leaks into print.
