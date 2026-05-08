# Anonymous Supabase Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors use the full app without signing in. Their work persists under a real `auth.users` row created via Supabase's anonymous sign-in. Sign-in via OAuth converts the anon account in place (same UUID); if the OAuth identity is already linked elsewhere, offer a resumable client-side clone into the existing account.

**Architecture:** Gated behind `VITE_ANON_USERS_ENABLED`. `AuthProvider` calls `signInAnonymously()` on boot when no session exists; `LoginView` branches on the anon's deck count to choose `linkIdentity` vs `signInWithOAuth`; `AuthCallback` parses the URL for `error_code=identity_already_exists` and runs the resumable import via `localStorage.dndCards.pendingAnonImport`; a small `Announcement` primitive replaces the toasts referenced in early drafts of the spec.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Router + TanStack Query, `@supabase/supabase-js`, react-aria-components, CSS modules, Vitest + RTL + `@testing-library/user-event`, MSW for HTTP mocks, Fishery + faker for factories.

**Spec:** [`docs/superpowers/specs/2026-05-07-anon-supabase-users-design.md`](../specs/2026-05-07-anon-supabase-users-design.md). The spec is the source of truth for any decision not spelled out here.

---

## File structure

**Files to create:**
- `src/lib/ui/Announcement.tsx` — `<AnnouncementProvider>`, `useSetNextAnnouncement()`, `<Announcement />`
- `src/lib/ui/Announcement.module.css`
- `src/lib/ui/Announcement.test.tsx`
- `src/auth/anonImport.ts` — `stash`, `tryResume`, `clear`, `PendingAnonImport` type
- `src/auth/anonImport.test.ts`
- `src/views/FirstDeckDialog.tsx` — modal explainer (uses `DialogShell` + `DialogHeader`)
- `src/views/FirstDeckDialog.test.tsx`
- `src/auth/ImportAccountDialog.tsx` — "you already have an account" dialog
- `src/auth/ImportAccountDialog.test.tsx`

**Files to modify:**
- `src/auth/AuthProvider.tsx` — call `signInAnonymously()` when no session and flag on
- `src/auth/AuthProvider.test.tsx` — flag-on path test
- `src/lib/ui/UserMenu.tsx` — render pill CTA when anon
- `src/lib/ui/UserMenu.module.css` — `.pillCta` class
- `src/lib/ui/UserMenu.test.tsx` — anon-CTA case
- `src/auth/LoginView.tsx` — anon-aware OAuth click handlers; two-step `updateUser` for dev path
- `src/auth/LoginView.test.tsx` — anon paths
- `src/auth/AuthCallback.tsx` — URL parsing, import progress, `tryResume()`, set Announcement on success
- `src/auth/AuthCallback.test.tsx` — failure-URL → dialog; success → announcement
- `src/views/HomeView.tsx` — trigger `FirstDeckDialog` after first anon deck create
- `src/views/HomeView.test.tsx` — dialog trigger; anon-create flow
- `src/app/Root.tsx` — wrap children with `AnnouncementProvider`; render `<Announcement />` near top of main
- `src/test/msw.ts` — handlers for `signInAnonymously`, `linkIdentity`, `updateUser`, public-read SELECTs by `owner_id`
- `supabase/config.toml` — `enable_anonymous_sign_ins = true`
- `.env.example` (or README env section) — document `VITE_ANON_USERS_ENABLED`

**Tests run with:** `npm test -- --run path/to/file` (Vitest). Pre-approved per CLAUDE.md.

---

## Task 1: Foundation — env var helper and supabase local config

**Files:**
- Create: `src/lib/anonEnabled.ts`
- Create: `src/lib/anonEnabled.test.ts`
- Modify: `supabase/config.toml`
- Modify: `.env.example` (create if missing)

The flag is read in three call sites (`AuthProvider`, `UserMenu`, `LoginView`); centralize via a tiny helper so tests can stub one place.

- [ ] **Step 1: Write the failing test for the helper**

```ts
// src/lib/anonEnabled.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnonUsersEnabled } from "./anonEnabled";

describe("isAnonUsersEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when VITE_ANON_USERS_ENABLED === "true"', () => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
    expect(isAnonUsersEnabled()).toBe(true);
  });

  it("returns false when the env var is unset", () => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "");
    expect(isAnonUsersEnabled()).toBe(false);
  });

  it('returns false for any non-"true" value', () => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "1");
    expect(isAnonUsersEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npm test -- --run src/lib/anonEnabled.test.ts`
Expected: fails with "Cannot find module './anonEnabled'".

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/anonEnabled.ts
export function isAnonUsersEnabled(): boolean {
  return import.meta.env.VITE_ANON_USERS_ENABLED === "true";
}
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `npm test -- --run src/lib/anonEnabled.test.ts`
Expected: 3/3 pass.

- [ ] **Step 5: Update local Supabase config**

In `supabase/config.toml`, find `enable_anonymous_sign_ins = false` and change to `true`.

- [ ] **Step 6: Document the env var**

Add to `.env.example` (create if missing):

```
# Enable anonymous Supabase users on app boot. Default off.
VITE_ANON_USERS_ENABLED=false
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/anonEnabled.ts src/lib/anonEnabled.test.ts supabase/config.toml .env.example
git commit -m "feat: add VITE_ANON_USERS_ENABLED flag and helper"
```

---

## Task 2: Announcement primitive

**Files:**
- Create: `src/lib/ui/Announcement.tsx`
- Create: `src/lib/ui/Announcement.module.css`
- Create: `src/lib/ui/Announcement.test.tsx`

A small primitive: provider holds the next announcement in a ref-backed slot; `<Announcement />` reads on mount, displays it, auto-dismisses after 5s. `useSetNextAnnouncement()` writes the slot.

- [ ] **Step 1: Write a failing test for the basic render-then-dismiss flow**

```tsx
// src/lib/ui/Announcement.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Announcement, AnnouncementProvider, useSetNextAnnouncement } from "./Announcement";

function Setter({ message }: { message: string | null }) {
  const setNext = useSetNextAnnouncement();
  return (
    <button type="button" onClick={() => setNext(message)}>
      set
    </button>
  );
}

describe("<Announcement>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when no announcement is queued", () => {
    const { container } = render(
      <AnnouncementProvider>
        <Announcement />
      </AnnouncementProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the queued message when mounted after the setter ran", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    function Harness() {
      return (
        <AnnouncementProvider>
          <Setter message="Signed in" />
          <Announcement />
        </AnnouncementProvider>
      );
    }
    render(<Harness />);
    await user.click(screen.getByText("set"));
    // The setter writes the slot; the existing <Announcement /> picks it up
    // on its next render. We trigger that by advancing the dismiss timer.
    expect(screen.getByRole("status")).toHaveTextContent("Signed in");
  });

  it("auto-dismisses after 5 seconds", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AnnouncementProvider>
        <Setter message="Imported 3 decks" />
        <Announcement />
      </AnnouncementProvider>,
    );
    await user.click(screen.getByText("set"));
    expect(screen.getByRole("status")).toBeInTheDocument();
    vi.advanceTimersByTime(5000);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses on user click of the close button", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AnnouncementProvider>
        <Setter message="Imported 3 decks" />
        <Announcement />
      </AnnouncementProvider>,
    );
    await user.click(screen.getByText("set"));
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it('marks the message with role="status" and aria-live="polite"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AnnouncementProvider>
        <Setter message="Hello" />
        <Announcement />
      </AnnouncementProvider>,
    );
    await user.click(screen.getByText("set"));
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npm test -- --run src/lib/ui/Announcement.test.tsx`
Expected: fails with "Cannot find module './Announcement'".

- [ ] **Step 3: Create the CSS module**

```css
/* src/lib/ui/Announcement.module.css */
.root {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--space-3);
  color: var(--color-text);
  font-size: var(--fs-sm);
}

.message {
  flex: 1;
}

.dismiss {
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: var(--fs-md);
  color: var(--color-text-muted);
  padding: 0 var(--space-1);
}

.dismiss:hover {
  color: var(--color-text);
}
```

- [ ] **Step 4: Implement the primitive**

```tsx
// src/lib/ui/Announcement.tsx
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./Announcement.module.css";

const AUTO_DISMISS_MS = 5000;

type Slot = { message: string | null };

const AnnouncementContext = createContext<{ slotRef: { current: Slot } } | null>(null);

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const slotRef = useRef<Slot>({ message: null });
  return (
    <AnnouncementContext.Provider value={{ slotRef }}>{children}</AnnouncementContext.Provider>
  );
}

export function useSetNextAnnouncement() {
  const ctx = useContext(AnnouncementContext);
  if (!ctx) {
    throw new Error("useSetNextAnnouncement must be used inside <AnnouncementProvider>");
  }
  return useCallback(
    (message: string | null) => {
      ctx.slotRef.current.message = message;
    },
    [ctx],
  );
}

export function Announcement() {
  const ctx = useContext(AnnouncementContext);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const queued = ctx.slotRef.current.message;
    if (queued) {
      setMessage(queued);
      ctx.slotRef.current.message = null;
    }
  });

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [message]);

  if (!message) return null;
  return (
    <div className={styles.root} role="status" aria-live="polite">
      <span className={styles.message}>{message}</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss announcement"
        onClick={() => setMessage(null)}
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests, confirm pass**

Run: `npm test -- --run src/lib/ui/Announcement.test.tsx`
Expected: 5/5 pass.

- [ ] **Step 6: Wire into Root**

In `src/app/Root.tsx`, import and wrap children, render `<Announcement />` near the top of `<main>`:

```tsx
// src/app/Root.tsx
import { Link, Outlet } from "@tanstack/react-router";
import { Announcement, AnnouncementProvider } from "../lib/ui/Announcement";
import { GitHubLogo } from "../lib/ui/icons/GitHubLogo";
import { UserMenu } from "../lib/ui/UserMenu";
import { DeckBreadcrumb } from "./DeckBreadcrumb";
import styles from "./root.module.css";

const REPO_URL = "https://github.com/ChristopherChudzicki/dnd-cards";

export function Root() {
  return (
    <AnnouncementProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link to="/" className={styles.brand}>
            D&amp;D Cards
          </Link>
          <DeckBreadcrumb />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.iconLink}
            aria-label="View source on GitHub"
          >
            <GitHubLogo size={20} />
          </a>
          <UserMenu />
        </header>
        <main className={styles.main}>
          <Announcement />
          <Outlet />
        </main>
      </div>
    </AnnouncementProvider>
  );
}
```

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `npm test -- --run`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ui/Announcement.tsx src/lib/ui/Announcement.module.css src/lib/ui/Announcement.test.tsx src/app/Root.tsx
git commit -m "feat(ui): add Announcement primitive and wire into Root"
```

---

## Task 3: anonImport pure module

**Files:**
- Create: `src/auth/anonImport.ts`
- Create: `src/auth/anonImport.test.ts`

Pure module: stash/tryResume/clear of `localStorage.dndCards.pendingAnonImport`. The shape carries a `version: 1` field so a future shape change can be ignored gracefully.

- [ ] **Step 1: Write failing tests for stash/clear/read**

```ts
// src/auth/anonImport.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { clear, readPending, stash, type PendingAnonImport } from "./anonImport";

describe("anonImport storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is stashed", () => {
    expect(readPending()).toBeNull();
  });

  it("round-trips a stashed payload", () => {
    const payload: PendingAnonImport = {
      version: 1,
      anonUuid: "00000000-0000-0000-0000-000000000001",
      importedDeckIds: [],
    };
    stash(payload);
    expect(readPending()).toEqual(payload);
  });

  it("clears the stashed payload", () => {
    stash({ version: 1, anonUuid: "x", importedDeckIds: [] });
    clear();
    expect(readPending()).toBeNull();
  });

  it("returns null and does not throw on a malformed value", () => {
    window.localStorage.setItem("dndCards.pendingAnonImport", "not json");
    expect(readPending()).toBeNull();
  });

  it("returns null on a stashed value with an unknown version", () => {
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({ version: 999, anonUuid: "x", importedDeckIds: [] }),
    );
    expect(readPending()).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm failing**

Run: `npm test -- --run src/auth/anonImport.test.ts`
Expected: fails with "Cannot find module './anonImport'".

- [ ] **Step 3: Implement the module skeleton (storage helpers)**

```ts
// src/auth/anonImport.ts
const STORAGE_KEY = "dndCards.pendingAnonImport";

export type PendingAnonImport = {
  version: 1;
  anonUuid: string;
  importedDeckIds: string[];
};

export function stash(payload: PendingAnonImport): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clear(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function readPending(): PendingAnonImport | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number };
    if (parsed.version !== 1) return null;
    return parsed as PendingAnonImport;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- --run src/auth/anonImport.test.ts`
Expected: 5/5 pass.

- [ ] **Step 5: Add a failing test for `tryResume` happy path**

Append to `src/auth/anonImport.test.ts`:

```ts
import { tryResume } from "./anonImport";
// (existing imports already cover stash/clear/readPending/PendingAnonImport)

type FakeSupabase = {
  decks: { ownerId: string; id: string; name: string }[];
  cards: { id: string; deck_id: string; position: number; payload: unknown }[];
  inserts: { decks: unknown[]; cards: unknown[] };
};

function makeFakeSupabase(initial: FakeSupabase) {
  return {
    state: initial,
    from(table: string) {
      const state = initial;
      return {
        select() {
          return {
            eq(_col: string, val: string) {
              if (table === "decks") {
                return Promise.resolve({
                  data: state.decks.filter((d) => d.ownerId === val).map((d) => ({
                    id: d.id,
                    owner_id: d.ownerId,
                    name: d.name,
                  })),
                  error: null,
                });
              }
              if (table === "cards") {
                return Promise.resolve({
                  data: state.cards.filter((c) => c.deck_id === val),
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
        insert(rows: unknown) {
          state.inserts[table as "decks" | "cards"].push(rows);
          return {
            select() {
              return {
                single() {
                  // Pretend the DB minted an id and timestamps.
                  return Promise.resolve({
                    data: { id: "new-deck-id", ...(Array.isArray(rows) ? rows[0] : rows) },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("tryResume", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clones each anon-owned deck and its cards under the new user, then clears the key", async () => {
    stash({
      version: 1,
      anonUuid: "anon-1",
      importedDeckIds: [],
    });
    const fake = makeFakeSupabase({
      decks: [{ ownerId: "anon-1", id: "d1", name: "Goblins" }],
      cards: [{ id: "c1", deck_id: "d1", position: 0, payload: { kind: "item", name: "Sword" } }],
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(1);
    expect(fake.state.inserts.cards).toHaveLength(1);
    expect(readPending()).toBeNull();
  });

  it("skips decks already in importedDeckIds (resumable)", async () => {
    stash({
      version: 1,
      anonUuid: "anon-1",
      importedDeckIds: ["d1"],
    });
    const fake = makeFakeSupabase({
      decks: [
        { ownerId: "anon-1", id: "d1", name: "Done" },
        { ownerId: "anon-1", id: "d2", name: "Pending" },
      ],
      cards: [{ id: "c2", deck_id: "d2", position: 0, payload: {} }],
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(1);
  });

  it("treats zero-rows as already-imported and clears the key without inserting", async () => {
    stash({
      version: 1,
      anonUuid: "missing-anon",
      importedDeckIds: [],
    });
    const fake = makeFakeSupabase({
      decks: [],
      cards: [],
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(0);
    expect(readPending()).toBeNull();
  });

  it("is a no-op when there is no pending import", async () => {
    const fake = makeFakeSupabase({ decks: [], cards: [], inserts: { decks: [], cards: [] } });
    const result = await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(result).toEqual({ kind: "noop" });
  });
});
```

- [ ] **Step 6: Run, confirm failing**

Run: `npm test -- --run src/auth/anonImport.test.ts`
Expected: tryResume tests fail with "tryResume is not exported".

- [ ] **Step 7: Implement tryResume**

Append to `src/auth/anonImport.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResumeResult =
  | { kind: "noop" }
  | { kind: "completed"; importedCount: number }
  | { kind: "partial"; importedCount: number; total: number };

export async function tryResume(args: {
  supabase: SupabaseClient;
  currentUserId: string;
  onProgress?: (imported: number, total: number) => void;
}): Promise<ResumeResult> {
  const pending = readPending();
  if (!pending) return { kind: "noop" };

  const { data: anonDecks, error: deckError } = await args.supabase
    .from("decks")
    .select("id, name")
    .eq("owner_id", pending.anonUuid);
  if (deckError) throw deckError;
  if (!anonDecks || anonDecks.length === 0) {
    clear();
    return { kind: "completed", importedCount: 0 };
  }

  const total = anonDecks.length;
  let imported = pending.importedDeckIds.length;
  args.onProgress?.(imported, total);

  for (const deck of anonDecks as Array<{ id: string; name: string }>) {
    if (pending.importedDeckIds.includes(deck.id)) continue;

    const { data: newDeck, error: insertDeckError } = await args.supabase
      .from("decks")
      .insert({ owner_id: args.currentUserId, name: deck.name })
      .select()
      .single();
    if (insertDeckError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    const { data: cards, error: cardsError } = await args.supabase
      .from("cards")
      .select("position, payload")
      .eq("deck_id", deck.id);
    if (cardsError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    if (cards && cards.length > 0) {
      const rows = (cards as Array<{ position: number; payload: unknown }>).map((c) => ({
        deck_id: (newDeck as { id: string }).id,
        position: c.position,
        payload: c.payload,
      }));
      const { error: insertCardsError } = await args.supabase.from("cards").insert(rows);
      if (insertCardsError) {
        stash(pending);
        return { kind: "partial", importedCount: imported, total };
      }
    }

    pending.importedDeckIds.push(deck.id);
    imported += 1;
    stash(pending);
    args.onProgress?.(imported, total);
  }

  clear();
  return { kind: "completed", importedCount: imported };
}
```

- [ ] **Step 8: Run, confirm pass**

Run: `npm test -- --run src/auth/anonImport.test.ts`
Expected: 9/9 pass.

- [ ] **Step 9: Commit**

```bash
git add src/auth/anonImport.ts src/auth/anonImport.test.ts
git commit -m "feat(auth): add anonImport module for resumable cross-account clone"
```

---

## Task 4: AuthProvider boot path — anonymous sign-in

**Files:**
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.tsx`
- Modify: `src/test/msw.ts` (add handler for `/auth/v1/signup`)

When the flag is on and INITIAL_SESSION fires with no session, call `signInAnonymously()` and stay in `loading` until the next auth event resolves. Never transition through `unauthenticated`.

- [ ] **Step 1: Add MSW handler for the anonymous signup endpoint**

Read `src/test/msw.ts` first to find where the auth handlers are registered. Add this handler inside the `supabaseDefaultHandlers` array (next to the existing `/auth/v1/user` handler):

```ts
http.post(`${SB_URL}/auth/v1/signup`, async ({ request }) => {
  const body = (await request.json()) as { is_anonymous?: boolean };
  if (!body.is_anonymous) {
    return new HttpResponse("only anon signup mocked", { status: 400 });
  }
  return HttpResponse.json({
    access_token: "fake-anon-jwt",
    refresh_token: "fake-anon-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: { id: "anon-test-id", is_anonymous: true, email: null },
  });
}),
```

- [ ] **Step 2: Write a failing test for the flag-on path**

Append to `src/auth/AuthProvider.test.tsx`:

```tsx
import { vi } from "vitest";

describe("AuthProvider with anon flag on", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls signInAnonymously and transitions to authenticated, never unauthenticated", async () => {
    const spy = vi.spyOn(supabase.auth, "signInAnonymously");
    render(
      <AuthProvider>
        <ShowSession />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("loading");
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // Status should not transition to "unauthenticated" while we wait.
    // We assert by observing it goes from "loading" directly to "authenticated"
    // after the SIGNED_IN event resolves through the listener.
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
    });
  });
});
```

You'll also need to add `afterEach` to the import list at the top: `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`

- [ ] **Step 3: Run, confirm the new test fails**

Run: `npm test -- --run src/auth/AuthProvider.test.tsx`
Expected: existing test passes; new test fails because nothing currently calls `signInAnonymously()`.

- [ ] **Step 4: Modify AuthProvider to call signInAnonymously on the flag-on no-session path**

Replace the contents of `src/auth/AuthProvider.tsx`:

```tsx
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "../api/supabase";
import { isAnonUsersEnabled } from "../lib/anonEnabled";
import { SessionContext, type SessionState } from "./useSession";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: "loading",
    user: null,
    session: null,
  });

  useEffect(() => {
    let cancelled = false;
    const anonEnabled = isAnonUsersEnabled();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session) {
        setState({ status: "authenticated", user: session.user, session });
        return;
      }
      if (event === "INITIAL_SESSION" && anonEnabled) {
        // Stay "loading"; signInAnonymously will fire SIGNED_IN, which we'll
        // pick up on the next listener invocation.
        void supabase.auth.signInAnonymously();
        return;
      }
      setState({ status: "unauthenticated", user: null, session: null });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
```

- [ ] **Step 5: Run the full AuthProvider test suite**

Run: `npm test -- --run src/auth/AuthProvider.test.tsx`
Expected: both tests pass (the original `unauthenticated` baseline still works because the flag is off in that test by default).

- [ ] **Step 6: Run the full test suite for regressions**

Run: `npm test -- --run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/auth/AuthProvider.tsx src/auth/AuthProvider.test.tsx src/test/msw.ts
git commit -m "feat(auth): sign in anonymously on boot when flag is on"
```

---

## Task 5: UserMenu — anon CTA pill

**Files:**
- Modify: `src/lib/ui/UserMenu.tsx`
- Modify: `src/lib/ui/UserMenu.module.css`
- Modify: `src/lib/ui/UserMenu.test.tsx`

When `session.user.is_anonymous`, render an accent-pill link to `/login` instead of the avatar/menu.

- [ ] **Step 1: Write a failing test for the anon CTA**

Append to `src/lib/ui/UserMenu.test.tsx`:

```tsx
it('renders an accent pill linking to /login when the user is anonymous', () => {
  wrap({
    status: "authenticated",
    user: { id: "anon-1", email: null, is_anonymous: true } as never,
    session: {} as never,
  });
  const link = screen.getByRole("link", { name: /sign in to save your work/i });
  expect(link).toHaveAttribute("href", "/login");
});

it('does NOT render the avatar/menu when the user is anonymous', () => {
  wrap({
    status: "authenticated",
    user: { id: "anon-1", email: null, is_anonymous: true } as never,
    session: {} as never,
  });
  expect(screen.queryByRole("button", { name: /account menu/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run, confirm failing**

Run: `npm test -- --run src/lib/ui/UserMenu.test.tsx`
Expected: new tests fail (the avatar still renders for anon users).

- [ ] **Step 3: Add the `.pillCta` styles**

Append to `src/lib/ui/UserMenu.module.css`:

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

- [ ] **Step 4: Branch UserMenu on `is_anonymous`**

In `src/lib/ui/UserMenu.tsx`, replace the `if (session.status === "unauthenticated")` block area with the anon-aware version. Full updated file:

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

  if (session.status === "unauthenticated") {
    return (
      <Link to="/login" className={styles.signInLink}>
        Sign in
      </Link>
    );
  }

  if (session.user.is_anonymous) {
    return (
      <Link to="/login" className={styles.pillCta}>
        Sign in to save your work
      </Link>
    );
  }

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

- [ ] **Step 5: Run, confirm pass**

Run: `npm test -- --run src/lib/ui/UserMenu.test.tsx`
Expected: all UserMenu tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/UserMenu.tsx src/lib/ui/UserMenu.module.css src/lib/ui/UserMenu.test.tsx
git commit -m "feat(ui): UserMenu pill CTA for anonymous users"
```

---

## Task 6: FirstDeckDialog and HomeView trigger

**Files:**
- Create: `src/views/FirstDeckDialog.tsx`
- Create: `src/views/FirstDeckDialog.module.css`
- Create: `src/views/FirstDeckDialog.test.tsx`
- Modify: `src/views/HomeView.tsx`
- Modify: `src/views/HomeView.test.tsx`

Modal explainer shown once per browser when an anon user creates their first deck. Gated via `localStorage.dndCards.firstDeckExplainerSeen`.

- [ ] **Step 1: Look up the existing DialogShell API**

Run: `grep -n "DialogShell\|DialogHeader" src/lib/ui/DialogShell.tsx src/lib/ui/DialogHeader.tsx 2>&1 | head -30`

Note the exported props (you'll use them below). Most likely shape: `<DialogShell isOpen onOpenChange={...}><DialogHeader>...</DialogHeader>...</DialogShell>`. Verify before writing the component.

- [ ] **Step 2: Write a failing test for the dialog**

```tsx
// src/views/FirstDeckDialog.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FirstDeckDialog } from "./FirstDeckDialog";

describe("<FirstDeckDialog>", () => {
  it("renders the heading and copy when open", () => {
    render(<FirstDeckDialog isOpen onOpenChange={() => {}} />);
    expect(screen.getByRole("heading", { name: /your decks live on this browser/i })).toBeInTheDocument();
    expect(screen.getByText(/30 days/i)).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<FirstDeckDialog isOpen={false} onOpenChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onOpenChange(false) when "Not yet" is clicked', async () => {
    const onOpenChange = vi.fn();
    render(<FirstDeckDialog isOpen onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: /not yet/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('"Sign in now" is a link to /login', () => {
    render(<FirstDeckDialog isOpen onOpenChange={() => {}} />);
    const link = screen.getByRole("link", { name: /sign in now/i });
    expect(link).toHaveAttribute("href", "/login");
  });
});
```

- [ ] **Step 3: Run, confirm failing**

Run: `npm test -- --run src/views/FirstDeckDialog.test.tsx`
Expected: fails with "Cannot find module './FirstDeckDialog'".

- [ ] **Step 4: Implement the dialog**

```tsx
// src/views/FirstDeckDialog.tsx
import { Link } from "@tanstack/react-router";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Button } from "../lib/ui/Button";
import styles from "./FirstDeckDialog.module.css";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FirstDeckDialog({ isOpen, onOpenChange }: Props) {
  if (!isOpen) return null;
  return (
    <DialogShell isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader>Your decks live on this browser</DialogHeader>
      <div className={styles.body}>
        <p>
          You're not signed in, so your new deck only exists here on this device — not on your
          phone, your other laptop, or anywhere else. Sign in any time to save your decks to your
          account, where you can access them from any device.
        </p>
        <p>
          Otherwise, your decks may be lost if you clear browsing data, switch browsers, or don't
          visit for 30 days.
        </p>
      </div>
      <div className={styles.actions}>
        <Link to="/login" className={styles.primary}>
          Sign in now
        </Link>
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          Not yet
        </Button>
      </div>
    </DialogShell>
  );
}
```

If `DialogShell`/`DialogHeader` props differ from what's used here, adjust. The principle: a controlled `isOpen`/`onOpenChange` modal with a heading, copy, primary "Sign in now" link to `/login`, and a secondary "Not yet" dismiss action.

- [ ] **Step 5: Add CSS module**

```css
/* src/views/FirstDeckDialog.module.css */
.body {
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);
}

.body p {
  margin: 0 0 var(--space-3) 0;
}

.body p:last-child {
  margin-bottom: 0;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}

.primary {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent);
  color: var(--color-accent-fg);
  border-radius: var(--radius-md);
  text-decoration: none;
  font-weight: 600;
}

.primary:hover {
  background: var(--color-accent-hover);
}
```

- [ ] **Step 6: If button labels differ from the existing Button primitive, adapt — verify**

Run: `cat src/lib/ui/Button.tsx | head -30` to see the props. Adjust the `<Button variant="secondary" onPress={...}>` call if needed.

- [ ] **Step 7: Run the dialog tests**

Run: `npm test -- --run src/views/FirstDeckDialog.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 8: Write a failing test for HomeView's trigger**

Append to `src/views/HomeView.test.tsx` (after the existing tests, inside the `describe("HomeView")` block):

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// (existing imports already cover most needs)

describe("HomeView with anon flag on", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
    navigate.mockClear();
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("opens the FirstDeckDialog after an anonymous user creates their first deck", async () => {
    // Simulate anon-signed-in by setting the session via signInAnonymously stub
    // (signInTestUser would create a non-anon user, which is wrong here).
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "anon-1", is_anonymous: true } as never },
      error: null,
    });
    // Use the existing AuthProvider in `wrap`; with the flag on, it'll call
    // signInAnonymously and reach authenticated.
    const inserted = makeDeckRow.build({ name: "Untitled deck", owner_id: "anon-1" });
    server.use(
      http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([])),
      http.post(`${SB}/rest/v1/decks`, () => HttpResponse.json([inserted], { status: 201 })),
    );
    render(wrap(<HomeView />));
    await userEvent.click(await screen.findByRole("button", { name: /create your first deck/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /your decks live on this browser/i }),
      ).toBeInTheDocument(),
    );
  });

  it("does NOT open the FirstDeckDialog if it has been seen before", async () => {
    window.localStorage.setItem("dndCards.firstDeckExplainerSeen", "1");
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "anon-1", is_anonymous: true } as never },
      error: null,
    });
    const inserted = makeDeckRow.build({ name: "Untitled deck", owner_id: "anon-1" });
    server.use(
      http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([])),
      http.post(`${SB}/rest/v1/decks`, () => HttpResponse.json([inserted], { status: 201 })),
    );
    render(wrap(<HomeView />));
    await userEvent.click(await screen.findByRole("button", { name: /create your first deck/i }));
    // navigate is the mocked router; assert it was called instead of waiting on a dialog that won't render.
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/deck/$deckId", params: { deckId: inserted.id } }),
    );
    expect(screen.queryByRole("heading", { name: /your decks live on this browser/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run, confirm failing**

Run: `npm test -- --run src/views/HomeView.test.tsx`
Expected: existing tests pass; new tests fail (the dialog never shows).

- [ ] **Step 10: Wire the dialog into HomeView**

In `src/views/HomeView.tsx`, add the dialog render and a small `useState` + a `localStorage` check inside `handleCreate` and `handleImport`. Updated handlers and JSX:

```tsx
// Add to imports
import { useEffect, useState } from "react";  // useState is the new addition; useEffect already imported in earlier task
import { FirstDeckDialog } from "./FirstDeckDialog";

// inside HomeView():
const [showFirstDeckDialog, setShowFirstDeckDialog] = useState(false);

const maybeShowFirstDeckExplainer = () => {
  if (!session.user.is_anonymous) return false;
  if (window.localStorage.getItem("dndCards.firstDeckExplainerSeen")) return false;
  window.localStorage.setItem("dndCards.firstDeckExplainerSeen", "1");
  setShowFirstDeckDialog(true);
  return true;
};

// In handleCreate, after `const deck = await createDeck.mutateAsync(...)`:
if (maybeShowFirstDeckExplainer()) {
  // Don't navigate; the dialog primary action goes to /login or the user
  // dismisses and stays on home with the new deck visible.
  return;
}
navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });

// Same pattern in handleImport before the final navigate({ to: "/deck/$deckId" ...
```

In the JSX returned by HomeView, render the dialog at the end:

```tsx
<FirstDeckDialog
  isOpen={showFirstDeckDialog}
  onOpenChange={setShowFirstDeckDialog}
/>
```

You'll need to refactor the early returns slightly — the simplest is to render the dialog as a sibling of the main `<section>` so it's available regardless of which branch returns. Concretely, restructure HomeView to:

```tsx
return (
  <>
    {decks.isLoading ? <LoadingState /> : (!decks.data || decks.data.length === 0) ? (
      <>
        <EmptyHero ... />
        <input ... />
      </>
    ) : (
      <section>
        <header className={styles.header}>...</header>
        <ul className={styles.list}>...</ul>
      </section>
    )}
    <FirstDeckDialog isOpen={showFirstDeckDialog} onOpenChange={setShowFirstDeckDialog} />
  </>
);
```

Read the current HomeView before making the edit so the restructuring preserves all the existing branches and the file input.

- [ ] **Step 11: Run, confirm pass**

Run: `npm test -- --run src/views/HomeView.test.tsx`
Expected: all HomeView tests pass.

- [ ] **Step 12: Run the full suite**

Run: `npm test -- --run`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add src/views/FirstDeckDialog.tsx src/views/FirstDeckDialog.module.css src/views/FirstDeckDialog.test.tsx src/views/HomeView.tsx src/views/HomeView.test.tsx
git commit -m "feat(home): show FirstDeckDialog after first anonymous deck create"
```

---

## Task 7: LoginView — anon-aware OAuth click handlers

**Files:**
- Modify: `src/auth/LoginView.tsx`
- Modify: `src/auth/LoginView.test.tsx`

OAuth click branches on the anon user's deck count:
- 0 decks (or unauthenticated) → `signInWithOAuth`
- ≥1 decks → `linkIdentity`

Dev sign-in path uses two-step `updateUser` when the user is anon.

- [ ] **Step 1: Add MSW handler for `linkIdentity`**

In `src/test/msw.ts`, add to the `supabaseDefaultHandlers`:

```ts
http.post(`${SB_URL}/auth/v1/user/identities/authorize`, () =>
  HttpResponse.json({ url: "https://example.com/oauth", provider: "google" }),
),
```

(The exact URL depends on supabase-js's wire format — verify by inspecting the actual request in a manual test if the path differs. Most projects route linkIdentity through `/auth/v1/user/identities/authorize`. If the path differs, adjust.)

- [ ] **Step 2: Write a failing test for the anon-with-decks branch (linkIdentity)**

Append to `src/auth/LoginView.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { supabase } from "../api/supabase";
import { SessionContext, type SessionState } from "./useSession";
import { LoginView } from "./LoginView";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

function wrap(ui: ReactNode, session: SessionState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
    </QueryClientProvider>
  );
}

describe("LoginView OAuth branching", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
    vi.stubEnv("VITE_AUTH_GOOGLE_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("calls linkIdentity when user is anonymous and has decks", async () => {
    const linkSpy = vi.spyOn(supabase.auth, "linkIdentity").mockResolvedValue({ data: { provider: "google", url: "https://example.com" }, error: null } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({ data: { provider: "google", url: "https://example.com" }, error: null } as never);
    // Stub useDecks-equivalent: pre-populate the query cache with a deck.
    // Easiest: have the click handler use queryClient.fetchQuery — we mock its return below.

    render(
      wrap(
        <LoginView />,
        {
          status: "authenticated",
          user: { id: "anon-1", is_anonymous: true } as never,
          session: {} as never,
        },
      ),
    );
    // We need to simulate the deck-count fetch returning >=1.
    // Easiest: prefill the cache. Wrap re-render with a custom query setup
    // (see next step's implementation for the cache key).
    // For now, accept that this test will require the implementation to
    // expose a clear seam; we'll use a server.use for /rest/v1/decks.
    server.use(
      http.get(`${SB_URL}/rest/v1/decks`, () =>
        HttpResponse.json([{ id: "d1", owner_id: "anon-1", name: "Goblins" }]),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(linkSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" }));
    expect(oauthSpy).not.toHaveBeenCalled();
  });

  it("calls signInWithOAuth when user is anonymous with zero decks", async () => {
    const linkSpy = vi.spyOn(supabase.auth, "linkIdentity").mockResolvedValue({ data: {}, error: null } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({ data: { provider: "google", url: "https://example.com" }, error: null } as never);
    server.use(http.get(`${SB_URL}/rest/v1/decks`, () => HttpResponse.json([])));
    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(oauthSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" }));
    expect(linkSpy).not.toHaveBeenCalled();
  });

  it("calls signInWithOAuth when user is unauthenticated", async () => {
    const linkSpy = vi.spyOn(supabase.auth, "linkIdentity").mockResolvedValue({ data: {}, error: null } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({ data: { provider: "google", url: "https://example.com" }, error: null } as never);
    render(wrap(<LoginView />, { status: "unauthenticated", user: null, session: null }));
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(oauthSpy).toHaveBeenCalled();
    expect(linkSpy).not.toHaveBeenCalled();
  });
});
```

You'll need to import `SB_URL`, `server`, `http`, `HttpResponse` at the top:

```tsx
import { HttpResponse, http } from "msw";
import { SB_URL } from "../test/msw";
import { server } from "../test/msw";
```

(`SB_URL` is already exported from `src/test/msw.ts` per current code.)

- [ ] **Step 3: Run, confirm failing**

Run: `npm test -- --run src/auth/LoginView.test.tsx`
Expected: new tests fail; existing dev sign-in tests still pass.

- [ ] **Step 4: Implement anon-aware OAuth handlers**

Update `src/auth/LoginView.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../api/supabase";
import { useSession } from "./useSession";
import { OAuthButton } from "../lib/ui/OAuthButton";
import { decksKey } from "../decks/queries";
import styles from "./LoginView.module.css";

const DEV_EMAIL = "dev@local";
const DEV_PASSWORD = "devpass";

export function LoginView() {
  const navigate = useNavigate();
  const session = useSession();
  const queryClient = useQueryClient();

  const isAnon = session.status === "authenticated" && session.user.is_anonymous === true;
  const userId = session.status === "authenticated" ? session.user.id : null;

  const signIn = async (provider: "google" | "github") => {
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    if (isAnon && userId) {
      const decks = await queryClient.fetchQuery({
        queryKey: decksKey(userId),
        queryFn: async () => {
          const result = await supabase.from("decks").select("id").eq("owner_id", userId);
          return result.data ?? [];
        },
        staleTime: 0,
      });
      const hasDecks = (decks?.length ?? 0) > 0;
      if (hasDecks) {
        // Stash the provider so AuthCallback can use it for the second OAuth
        // round-trip after the user picks an action in the import dialog.
        window.localStorage.setItem("dndCards.lastProvider", provider);
        await supabase.auth.linkIdentity({ provider, options: { redirectTo } });
        return;
      }
    }
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  };

  const devSignIn = async () => {
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    if (isAnon) {
      const { error: emailError } = await supabase.auth.updateUser({ email: DEV_EMAIL });
      if (emailError) {
        await supabase.auth.signOut();
        await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
        navigate({ to: next });
        return;
      }
      const { error: pwError } = await supabase.auth.updateUser({ password: DEV_PASSWORD });
      if (pwError) {
        await supabase.auth.signOut();
        await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
        navigate({ to: next });
        return;
      }
      navigate({ to: next });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
    if (error?.message === "Invalid login credentials") {
      await supabase.auth.signUp({ email: DEV_EMAIL, password: DEV_PASSWORD });
    }
    navigate({ to: next });
  };

  const heading = isAnon ? "Save your work to your account" : "Sign in";
  const copy = isAnon
    ? "Sign in to save your decks to your account, where you can access them from any device."
    : "Sign in to create and edit decks. Anyone can view shared decks via link.";

  return (
    <section className={styles.login} aria-labelledby="signin-heading">
      <h1 id="signin-heading">{heading}</h1>
      <p className={styles.copy}>{copy}</p>
      {/* biome-ignore lint/a11y/noRedundantRoles: list-style:none strips the implicit role in WebKit */}
      <ul className={styles.providers} role="list">
        {import.meta.env.VITE_AUTH_GOOGLE_ENABLED === "true" && (
          <li>
            <OAuthButton provider="google" onPress={() => void signIn("google")} />
          </li>
        )}
        {import.meta.env.VITE_AUTH_GITHUB_ENABLED === "true" && (
          <li>
            <OAuthButton provider="github" onPress={() => void signIn("github")} />
          </li>
        )}
        {import.meta.env.DEV && (
          <li>
            <OAuthButton provider="dev" onPress={() => void devSignIn()} />
          </li>
        )}
      </ul>
    </section>
  );
}
```

If `decksQueryKey` doesn't exist in `src/decks/queries.ts`, define a small inline replacement: `["decks", userId] as const`. The principle is to use whatever cache key `useDecks(userId)` already uses, so the click-time fetch shares the cache.

- [ ] **Step 5: Run, confirm pass**

Run: `npm test -- --run src/auth/LoginView.test.tsx`
Expected: all LoginView tests pass.

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/auth/LoginView.tsx src/auth/LoginView.test.tsx src/test/msw.ts
git commit -m "feat(auth): anon-aware OAuth in LoginView; two-step dev updateUser"
```

---

## Task 8: ImportAccountDialog component

**Files:**
- Create: `src/auth/ImportAccountDialog.tsx`
- Create: `src/auth/ImportAccountDialog.module.css`
- Create: `src/auth/ImportAccountDialog.test.tsx`

The "you already have a dnd-cards account" dialog. Two outcomes: import (user accepts) or skip (user declines).

- [ ] **Step 1: Write a failing test**

```tsx
// src/auth/ImportAccountDialog.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportAccountDialog } from "./ImportAccountDialog";

describe("<ImportAccountDialog>", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportAccountDialog isOpen={false} deckCount={3} onImport={() => {}} onSkip={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders heading, deck count, and unrecoverable warning", () => {
    render(
      <ImportAccountDialog isOpen deckCount={3} onImport={() => {}} onSkip={() => {}} />,
    );
    expect(screen.getByRole("heading", { name: /you already have a dnd-cards account/i })).toBeInTheDocument();
    expect(screen.getByText(/3 decks/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be recovered/i)).toBeInTheDocument();
  });

  it("calls onImport when the primary action is clicked", async () => {
    const onImport = vi.fn();
    render(<ImportAccountDialog isOpen deckCount={2} onImport={onImport} onSkip={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /yes, import 2 decks/i }));
    expect(onImport).toHaveBeenCalled();
  });

  it("calls onSkip when the skip text link is clicked", async () => {
    const onSkip = vi.fn();
    render(<ImportAccountDialog isOpen deckCount={2} onImport={() => {}} onSkip={onSkip} />);
    await userEvent.click(screen.getByRole("button", { name: /skip — leave decks behind/i }));
    expect(onSkip).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, confirm failing**

Run: `npm test -- --run src/auth/ImportAccountDialog.test.tsx`
Expected: fails with "Cannot find module './ImportAccountDialog'".

- [ ] **Step 3: Implement the dialog**

```tsx
// src/auth/ImportAccountDialog.tsx
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import styles from "./ImportAccountDialog.module.css";

type Props = {
  isOpen: boolean;
  deckCount: number;
  onImport: () => void;
  onSkip: () => void;
};

export function ImportAccountDialog({ isOpen, deckCount, onImport, onSkip }: Props) {
  if (!isOpen) return null;
  return (
    <DialogShell isOpen={isOpen} onOpenChange={() => {}}>
      <DialogHeader>You already have a dnd-cards account</DialogHeader>
      <div className={styles.body}>
        <p>
          An account on dnd-cards is already linked to that identity. Want to bring your{" "}
          {deckCount} decks into that account?
        </p>
        <p className={styles.warning}>
          If you skip, those decks will be left behind. They cannot be recovered.
        </p>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onPress={onImport}>
          Yes, import {deckCount} decks
        </Button>
        <button type="button" className={styles.skip} onClick={onSkip}>
          Skip — leave decks behind
        </button>
      </div>
    </DialogShell>
  );
}
```

- [ ] **Step 4: Add CSS module**

```css
/* src/auth/ImportAccountDialog.module.css */
.body {
  padding: var(--space-3) var(--space-4);
}

.body p {
  margin: 0 0 var(--space-3) 0;
}

.warning {
  color: var(--color-warning, var(--color-text-muted));
  font-size: var(--fs-sm);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}

.skip {
  background: transparent;
  border: 0;
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
  cursor: pointer;
  padding: var(--space-2) var(--space-3);
  text-decoration: underline;
}

.skip:hover {
  color: var(--color-text);
}
```

- [ ] **Step 5: Run, confirm pass**

Run: `npm test -- --run src/auth/ImportAccountDialog.test.tsx`
Expected: 4/4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/auth/ImportAccountDialog.tsx src/auth/ImportAccountDialog.module.css src/auth/ImportAccountDialog.test.tsx
git commit -m "feat(auth): add ImportAccountDialog for the linkIdentity-conflict path"
```

---

## Task 9: AuthCallback — URL parsing, dialog wiring, and tryResume

**Files:**
- Modify: `src/auth/AuthCallback.tsx`
- Modify: `src/auth/AuthCallback.test.tsx`

AuthCallback now does three things:
1. Parse the URL hash/query for `error_code=identity_already_exists` → open `ImportAccountDialog`.
2. If `localStorage.dndCards.pendingAnonImport` exists and the user is non-anon → run `tryResume` with progress UI.
3. On clean success (no pending import, no error) → set Announcement "Signed in" and navigate.

- [ ] **Step 1: Write a failing test for the link-failure → dialog branch**

Replace `src/auth/AuthCallback.test.tsx` (existing tests preserved, plus new ones):

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementProvider } from "../lib/ui/Announcement";
import { supabase } from "../api/supabase";
import { SessionContext, type SessionState } from "./useSession";
import { AuthCallback } from "./AuthCallback";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigate };
});

function wrap(ui: ReactNode, session: SessionState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AnnouncementProvider>
        <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
      </AnnouncementProvider>
    </QueryClientProvider>
  );
}

describe("AuthCallback", () => {
  beforeEach(() => {
    navigate.mockClear();
    window.localStorage.clear();
  });

  it("opens ImportAccountDialog when URL has error_code=identity_already_exists and user is anon with decks", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...window.location,
        hash: "#error=invalid_request&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user",
        search: "",
      },
    });
    const fromSpy = vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: "d1" }, { id: "d2" }], error: null }) }),
    } as never);
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /you already have a dnd-cards account/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/2 decks/i)).toBeInTheDocument();
    fromSpy.mockRestore();
  });

  it("on import click: stashes pendingAnonImport, signs out, and signInWithOAuth", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...window.location,
        origin: "http://localhost:5173",
        hash: "#error_code=identity_already_exists",
        search: "?next=/",
      },
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: "d1" }], error: null }) }),
    } as never);
    const signOutSpy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({ data: {}, error: null } as never);

    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /yes, import 1 decks/i }));
    const stash = window.localStorage.getItem("dndCards.pendingAnonImport");
    expect(stash).not.toBeNull();
    expect(JSON.parse(stash as string)).toMatchObject({ anonUuid: "anon-1", importedDeckIds: [] });
    expect(signOutSpy).toHaveBeenCalled();
    expect(oauthSpy).toHaveBeenCalled();
  });

  it("on skip click: signs out and signInWithOAuth, no stash", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...window.location,
        origin: "http://localhost:5173",
        hash: "#error_code=identity_already_exists",
        search: "",
      },
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: "d1" }], error: null }) }),
    } as never);
    const signOutSpy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({ data: {}, error: null } as never);

    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /skip — leave decks behind/i }));
    expect(window.localStorage.getItem("dndCards.pendingAnonImport")).toBeNull();
    expect(signOutSpy).toHaveBeenCalled();
    expect(oauthSpy).toHaveBeenCalled();
  });

  it("on clean success (no error, no pendingImport, non-anon authenticated): navigates to next", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, hash: "", search: "?next=/some/path" },
    });
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "real-1", is_anonymous: false, email: "x@y.z" } as never,
        session: {} as never,
      }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/some/path" }));
  });

  it("when pendingAnonImport exists and session is non-anon: shows progress, runs import, navigates", async () => {
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({ version: 1, anonUuid: "anon-1", importedDeckIds: [] }),
    );
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, hash: "", search: "" },
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({
        eq: (col: string) =>
          col === "owner_id"
            ? Promise.resolve({ data: [{ id: "d1", name: "Goblins" }], error: null })
            : Promise.resolve({ data: [{ position: 0, payload: {} }], error: null }),
      }),
      insert: () => ({
        select: () => ({ single: () => Promise.resolve({ data: { id: "new-deck" }, error: null }) }),
      }),
    } as never);
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "real-1", is_anonymous: false, email: "x@y.z" } as never,
        session: {} as never,
      }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(window.localStorage.getItem("dndCards.pendingAnonImport")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm failing**

Run: `npm test -- --run src/auth/AuthCallback.test.tsx`
Expected: new tests fail; existing test (if any) still passes.

- [ ] **Step 3: Implement AuthCallback's new behavior**

Replace `src/auth/AuthCallback.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "../api/supabase";
import { useSetNextAnnouncement } from "../lib/ui/Announcement";
import { ImportAccountDialog } from "./ImportAccountDialog";
import { clear, readPending, stash, tryResume } from "./anonImport";
import { useSession } from "./useSession";

function parseLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("error_code") ?? search.get("error_code");
}

function getNextPath(): string {
  return new URLSearchParams(window.location.search).get("next") ?? "/";
}

export function AuthCallback() {
  const navigate = useNavigate();
  const session = useSession();
  const setAnnouncement = useSetNextAnnouncement();

  const [phase, setPhase] = useState<"checking" | "importing" | "dialog" | "error">("checking");
  const [deckCount, setDeckCount] = useState(0);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "authenticated") return;

    const linkError = parseLinkError();
    if (linkError === "identity_already_exists" && session.user.is_anonymous) {
      // Anon user with conflicting OAuth identity. Fetch the anon's deck count
      // and surface the dialog.
      void (async () => {
        const { data } = await supabase.from("decks").select("id").eq("owner_id", session.user.id);
        setDeckCount(data?.length ?? 0);
        setPhase("dialog");
      })();
      return;
    }

    if (linkError) {
      // Generic OAuth failure. Show a recoverable message and stay on this page.
      setErrorMessage("Sign-in didn't complete. Please try again.");
      setPhase("error");
      return;
    }

    // No error. If we have a pending import and the user is non-anon, run it.
    const pending = readPending();
    if (pending && !session.user.is_anonymous) {
      setPhase("importing");
      void (async () => {
        try {
          const result = await tryResume({
            supabase,
            currentUserId: session.user.id,
            onProgress: (imported, total) => setProgress({ imported, total }),
          });
          if (result.kind === "completed" && result.importedCount > 0) {
            setAnnouncement(`Imported ${result.importedCount} decks`);
          } else if (result.kind === "partial") {
            setAnnouncement(`Imported ${result.importedCount} of ${result.total} decks. We'll try again next time you sign in.`);
          }
          navigate({ to: getNextPath() });
        } catch {
          setAnnouncement("Couldn't finish importing your decks. We'll try again next time you sign in.");
          navigate({ to: getNextPath() });
        }
      })();
      return;
    }

    // Plain successful sign-in.
    if (!session.user.is_anonymous) {
      setAnnouncement("Signed in");
      // Clear the provider stash so it doesn't linger across sessions.
      window.localStorage.removeItem("dndCards.lastProvider");
    }
    navigate({ to: getNextPath() });
  }, [session, navigate, setAnnouncement]);

  const lastProvider = (): "google" | "github" => {
    const v = window.localStorage.getItem("dndCards.lastProvider");
    return v === "github" ? "github" : "google";
  };

  const onImport = async () => {
    if (session.status !== "authenticated") return;
    stash({ version: 1, anonUuid: session.user.id, importedDeckIds: [] });
    const next = getNextPath();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const provider = lastProvider();
    await supabase.auth.signOut();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  };

  const onSkip = async () => {
    clear();
    const next = getNextPath();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const provider = lastProvider();
    await supabase.auth.signOut();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  };

  if (phase === "dialog") {
    return <ImportAccountDialog isOpen deckCount={deckCount} onImport={onImport} onSkip={onSkip} />;
  }

  if (phase === "importing") {
    return (
      <section style={{ textAlign: "center", padding: "4rem" }} role="status" aria-live="polite">
        <h2>Bringing your decks over</h2>
        <p>
          Imported {progress.imported} of {progress.total} decks…
        </p>
      </section>
    );
  }

  if (phase === "error") {
    return (
      <section style={{ textAlign: "center", padding: "4rem" }}>
        <p>{errorMessage}</p>
      </section>
    );
  }

  return (
    <section style={{ textAlign: "center", padding: "4rem" }}>
      <p>Signing you in…</p>
    </section>
  );
}
```

The provider for the second OAuth round-trip is read from `localStorage.dndCards.lastProvider`, which `LoginView`'s click handler stashed before calling `linkIdentity` (see Task 7). Defaults to `"google"` if the key is missing. The key is cleared after a clean signed-in callback completes.

- [ ] **Step 4: Run, confirm pass**

Run: `npm test -- --run src/auth/AuthCallback.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test -- --run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/auth/AuthCallback.tsx src/auth/AuthCallback.test.tsx
git commit -m "feat(auth): AuthCallback parses link failures, runs tryResume, and announces"
```

---

## Task 10: Manual smoke and pre-flight check

This task has no code; it walks through the manual rollout pre-flight from the spec.

- [ ] **Step 1: Run the full test suite one more time**

Run: `npm test -- --run`
Expected: all green.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: clean build, no type errors.

- [ ] **Step 3: Local smoke with the flag on**

In a shell:

```bash
echo "VITE_ANON_USERS_ENABLED=true" >> .env.local
npm run dev
```

Open the app in a fresh browser profile (or incognito):

- [ ] App loads, no flash of unauthenticated state, header shows "Sign in to save your work" pill.
- [ ] Click "Create your first deck" → first-create dialog appears with "Your decks live on this browser" copy.
- [ ] Dismiss the dialog with "Not yet" → deck is in your list.
- [ ] Click the header pill → lands on `/login`, heading reads "Save your work to your account".
- [ ] Sign in with Google → callback runs, you land on `/`, header now shows your avatar.
- [ ] Sign out, then in another browser profile, repeat with the same Google identity → after the second OAuth round-trip you should see "Imported N decks" announcement (if the first profile had decks).

- [ ] **Step 4: Pre-flight checks against Supabase project (when ready to deploy)**

Per the spec's Rollout section:
- Confirm Supabase Auth → URL Configuration restricts redirect URLs to the prod origin and `localhost:5173`. No wildcards.
- Confirm Supabase Auth → Rate Limits has the default `anonymous_users` limit enabled (30/hr/IP).
- Flip `enable_anonymous_sign_ins = true` in the Supabase dashboard for prod.
- Set `VITE_ANON_USERS_ENABLED=true` in the prod build env (Vercel).

These steps are out of band from the code; document them in the PR description.

- [ ] **Step 5: Remove `.env.local` if you added it just for smoke**

```bash
git checkout -- .env.local 2>/dev/null || rm -f .env.local
```

- [ ] **Step 6: Open the PR**

```bash
git push -u origin worktree-anon-supabase-users
gh pr create --title "Anonymous Supabase users" --body-file docs/superpowers/specs/2026-05-07-anon-supabase-users-design.md
```

(Or write a short PR description that links to the spec instead of pasting the full thing.)

---

## Self-review checklist (run after the plan is written; this is for the plan author, not the implementer)

- [ ] **Spec coverage:** Goals 1–4 (anon users can use the app, OAuth conversion, import-into-existing-account, local-only honesty) are covered by Tasks 4–9. Cleanup goal was deliberately removed; no task is missing for it.
- [ ] **Placeholder scan:** No "TBD"/"TODO"/"add error handling here". One genuinely-deferred decision is flagged in Task 9 step 3 (provider for the second OAuth round-trip; v1 hardcoded to `google`).
- [ ] **Type consistency:** `PendingAnonImport` (Task 3) is the same shape used by AuthCallback's stash call (Task 9). `tryResume` signature `({supabase, currentUserId, onProgress})` is the same in both. `useSetNextAnnouncement()` returns `(message: string | null) => void` consistently.
- [ ] **Test coverage:** AuthProvider flag-on, UserMenu anon-CTA, FirstDeckDialog one-time, LoginView anon-with-decks/no-decks/unauth/dev paths, AuthCallback link-failure-dialog/import/skip/clean-success/pending-import paths all have tests.

If anything's missing, fix inline before handing off.
