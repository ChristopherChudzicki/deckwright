# RLS + RPC Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the universal-read RLS posture on `decks` and `cards` with owner-only SELECT policies plus three SECURITY DEFINER RPC functions that encode the intended access model (owner-private deck listing, public-by-UUID deck viewing). Refactor TypeScript callers and tests to match.

**Architecture:** SQL migration tightens SELECT policies and adds three RPCs (`list_my_decks`, `get_public_deck`, `get_public_deck_cards`). `get_public_deck` returns an `is_owner` boolean computed server-side from `auth.uid()`, so the client never sees other users' UUIDs. Client-side: `src/decks/queries.ts` calls the RPCs; `DeckView` / `RequireOwner` consume `is_owner` instead of comparing `owner_id` themselves; `decksKey` becomes a no-arg helper; `anonImport` switches to a v2 localStorage payload that stores deck IDs (not the anon UUID) and iterates via the public RPCs. Mutations stay on direct-table operations — owner-only SELECT permits `INSERT/UPDATE … RETURNING` for owner rows.

**Tech Stack:** PostgreSQL + Supabase (RLS, SECURITY DEFINER), React 18 + TypeScript, TanStack Query, `@supabase/supabase-js`, Vitest + RTL + MSW, fishery factories.

**Reference spec:** `docs/superpowers/specs/2026-05-08-rls-rpc-hardening-design.md`

---

## File map

**Create:**

- `supabase/migrations/20260508000000_rls_rpc_hardening.sql` — migration

**Modify:**

- `src/decks/types.ts` — add `DeckSummary`, `PublicDeck` types
- `src/decks/queries.ts` — `decksKey` no-arg; `useDecks` no-arg + RPC; `useDeck` → RPC returning `PublicDeck`; `useDeckCards` → RPC
- `src/decks/mutations.ts` — drop arg from two `decksKey(...)` invalidation calls
- `src/views/HomeView.tsx` — `useDecks()` no arg
- `src/views/DeckView.tsx` — `isOwner` from `deck.is_owner`
- `src/auth/RequireOwner.tsx` — `is_owner` instead of `owner_id` comparison
- `src/auth/anonImport.ts` — v2 payload + RPC-based `tryResume`
- `src/auth/LoginView.tsx` — two `fetchQuery` blocks switch to RPC + drop `decksKey` arg; `onImportConfirm` prefetches deck ids before stash
- `src/auth/AuthCallback.tsx` — `onImport` prefetches deck ids before stash
- `src/test/factories.ts` — add `makeDeckSummary`, `makePublicDeck` factories

**Test files to update:**

- `src/decks/queries.test.tsx` — RPC handlers replace REST GETs; new `useDecks` no-arg signature; `is_owner` on `useDeck`
- `src/decks/mutations.test.tsx` — drop `decksKey(arg)` if asserted
- `src/views/HomeView.test.tsx` — RPC handler for `list_my_decks`
- `src/views/DeckView.test.tsx` — RPC handler for `get_public_deck` + `get_public_deck_cards`; assert on `is_owner` instead of session-vs-owner_id
- `src/views/EditorView.test.tsx` — RPC handlers for both deck/cards
- `src/views/PrintView.test.tsx` — same
- `src/views/BrowseApiModal.test.tsx` — same
- `src/app/DeckBreadcrumb.test.tsx` — `get_public_deck` handler
- `src/auth/RequireOwner.test.tsx` — `get_public_deck` with `is_owner`
- `src/auth/LoginView.test.tsx` — `list_my_decks` handler for the deck-count and stash-prefetch flows
- `src/auth/AuthCallback.test.tsx` — supabase stub swap from `from('decks')` to `rpc('list_my_decks')`
- `src/auth/anonImport.test.ts` — v2 payload; fake supabase gains an `rpc` method
- `e2e/fixtures.ts` — only if it stubs deck reads at the network layer

---

## Order of work

```
Task 1   Migration (no code dependencies)
Task 2   Type additions + factories
Task 3   useDecks + decksKey + all callers
Task 4   useDeck + PublicDeck + DeckView + RequireOwner
Task 5   useDeckCards
Task 6   anonImport v2 (storage + tryResume)
Task 7   LoginView + AuthCallback stash sites
Task 8   Final verification (full suite + manual smoke)
```

Each task is one commit. The full Vitest suite is green at the end of every task.

---

## Task 1: SQL migration

**Files:**

- Create: `supabase/migrations/20260508000000_rls_rpc_hardening.sql`

This task has no direct test coverage. Vitest mocks Supabase at the HTTP layer; the migration is verified end-to-end in Task 8.

- [ ] **Step 1: Create the migration file**

```sql
-- Replace the universal-read SELECT policies with owner-only.
-- Cross-identity reads (share-by-link, anon-import) go through the
-- SECURITY DEFINER RPC functions defined below.
drop policy if exists decks_select_all on public.decks;
drop policy if exists cards_select_all on public.cards;

create policy decks_select_owner on public.decks for select
  using (owner_id = auth.uid());

create policy cards_select_owner on public.cards for select
  using (exists (
    select 1 from public.decks d
    where d.id = cards.deck_id and d.owner_id = auth.uid()
  ));

-- Owner-scoped: HomeView's deck list.
create or replace function public.list_my_decks()
returns table(
  id          uuid,
  name        text,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, name, created_at, updated_at
  from public.decks
  where owner_id = auth.uid()
  order by created_at desc
$$;

comment on function public.list_my_decks() is
  'Owner-scoped read. Returns decks owned by the calling user.';

-- Public read by UUID.
create or replace function public.get_public_deck(deck_id uuid)
returns table(
  id          uuid,
  name        text,
  created_at  timestamptz,
  updated_at  timestamptz,
  is_owner    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    id,
    name,
    created_at,
    updated_at,
    coalesce(owner_id = auth.uid(), false) as is_owner
  from public.decks
  where id = deck_id
$$;

comment on function public.get_public_deck(uuid) is
  'Public read by UUID — anyone with the deck id can read it. Decks '
  'are intentionally public-by-link. owner_id is NOT in the return '
  'shape; is_owner is computed server-side instead.';

create or replace function public.get_public_deck_cards(deck_id uuid)
returns table(
  id          uuid,
  deck_id     uuid,
  position    integer,
  payload     jsonb,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.deck_id, c.position, c.payload, c.created_at, c.updated_at
  from public.cards c
  where c.deck_id = get_public_deck_cards.deck_id
  order by c.created_at asc
$$;

comment on function public.get_public_deck_cards(uuid) is
  'Public read by UUID — returns cards for a deck readable by anyone '
  'with the deck id. Same trust model as get_public_deck.';

revoke execute on function public.list_my_decks() from public;
revoke execute on function public.get_public_deck(uuid) from public;
revoke execute on function public.get_public_deck_cards(uuid) from public;

grant execute on function public.list_my_decks() to authenticated;
grant execute on function public.get_public_deck(uuid) to authenticated;
grant execute on function public.get_public_deck_cards(uuid)
  to authenticated;
```

- [ ] **Step 2: Verify the migration parses (syntactically)**

```bash
npx supabase db reset --debug 2>&1 | tail -20
```

Expected: migration applies cleanly. If `supabase` CLI isn't available, skip — Task 8 verifies end-to-end. If it errors, fix the SQL inline.

- [ ] **Step 3: Run the existing test suite — should still pass**

```bash
npm test -- --run
```

Expected: green. Tests don't talk to the DB, so the migration alone changes nothing in test land.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000000_rls_rpc_hardening.sql
git commit -m "feat(db): owner-only SELECT + public RPCs for decks/cards (#49)"
```

---

## Task 2: Add `DeckSummary` and `PublicDeck` types and factories

**Files:**

- Modify: `src/decks/types.ts`
- Modify: `src/test/factories.ts`

These types are net-additive in this task. The existing `DeckRow` stays — it's still the wire shape for `mutations.ts` (insert/update RETURNING).

- [ ] **Step 1: Add types in `src/decks/types.ts`**

Append to the file (after the existing `CardRow` type):

```ts
// Returned by list_my_decks() RPC.
export type DeckSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

// Returned by get_public_deck(deck_id) RPC. Adds is_owner so callers
// can gate UI without learning the owner's UUID.
export type PublicDeck = DeckSummary & {
  is_owner: boolean;
};
```

- [ ] **Step 2: Add factories in `src/test/factories.ts`**

Append:

```ts
import type { DeckSummary, PublicDeck } from "../decks/types";

export const makeDeckSummary = Factory.define<DeckSummary>(() => {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    name: faker.lorem.words({ min: 2, max: 4 }),
    created_at: now,
    updated_at: now,
  };
});

export const makePublicDeck = Factory.define<PublicDeck>(() => {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    name: faker.lorem.words({ min: 2, max: 4 }),
    created_at: now,
    updated_at: now,
    is_owner: false,
  };
});
```

Also extend the existing `export type` re-export line at the top of the file to include the new types:

```ts
export type { CardRow, DeckRow, DeckSummary, PublicDeck };
```

- [ ] **Step 3: Run typecheck + tests**

```bash
npm test -- --run
```

Expected: green. New types are unused; nothing breaks.

- [ ] **Step 4: Commit**

```bash
git add src/decks/types.ts src/test/factories.ts
git commit -m "feat(decks): add DeckSummary and PublicDeck types"
```

---

## Task 3: `useDecks` + `decksKey` no-arg + all callers

**Files:**

- Modify: `src/decks/queries.ts`
- Modify: `src/decks/mutations.ts`
- Modify: `src/views/HomeView.tsx`
- Modify: `src/auth/LoginView.tsx`
- Test: `src/decks/queries.test.tsx`
- Test: `src/views/HomeView.test.tsx`
- Test: `src/auth/LoginView.test.tsx`

This is a coordinated change: `decksKey` drops its argument, and every caller updates atomically.

- [ ] **Step 1: Update the `useDecks` test in `src/decks/queries.test.tsx`**

Replace the existing `describe("useDecks", ...)` block with:

```tsx
import { makeDeckSummary } from "../test/factories";
// ... existing imports

describe("useDecks", () => {
  it("returns the user's decks via list_my_decks RPC", async () => {
    const decks = [makeDeckSummary.build(), makeDeckSummary.build()];
    server.use(
      http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json(decks)),
    );
    const { result } = renderHook(() => useDecks(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(decks);
  });
});
```

(The "is disabled when ownerId is undefined" case goes away — there's no
ownerId argument anymore.)

- [ ] **Step 2: Run the test — it should fail**

```bash
npm test -- queries.test
```

Expected: TypeScript error or runtime error from `useDecks()` being called with no args, plus other tests in the file likely failing because `useDecks` still expects an arg.

- [ ] **Step 3: Update `src/decks/queries.ts`**

Replace lines 1–26 with:

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import type { Card } from "../cards/types";
import { rowToCard } from "./rowMappers";
import type { CardRow, DeckSummary, PublicDeck } from "./types";

export const decksKey = () => ["decks"] as const;
export const deckKey = (deckId: string | undefined) => ["deck", deckId] as const;
export const deckCardsKey = (deckId: string | undefined) =>
  ["deck-cards", deckId] as const;

/**
 * Decks owned by the current user — for the home view's deck list.
 * Server-side: RPC list_my_decks reads auth.uid().
 */
export function useDecks() {
  return useQuery<DeckSummary[]>({
    queryKey: decksKey(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_decks");
      if (error) throw error;
      return (data ?? []) as DeckSummary[];
    },
  });
}
```

(Leave `useDeck` and `useDeckCards` untouched for now — Tasks 4 and 5
handle them.)

- [ ] **Step 4: Update `src/decks/mutations.ts`**

At line 28: `qc.invalidateQueries({ queryKey: decksKey(vars.ownerId) });`
becomes:

```ts
qc.invalidateQueries({ queryKey: decksKey() });
```

At line 49: `qc.invalidateQueries({ queryKey: decksKey(data.owner_id) });`
becomes:

```ts
qc.invalidateQueries({ queryKey: decksKey() });
```

- [ ] **Step 5: Update `src/views/HomeView.tsx`**

Find `const decks = useDecks(ownerId);` (around line 20). Change to:

```ts
const decks = useDecks();
```

Leave the surrounding `ownerId` derivation in place — it's still needed
by `createDeck.mutateAsync({ name, ownerId })` on lines 56 and 76.

- [ ] **Step 6: Update `src/auth/LoginView.tsx`**

Two `queryClient.fetchQuery` blocks (around lines 40–47 and 84–91) switch
from a direct table query to the RPC. Replace each block:

```ts
const decks = await queryClient.fetchQuery({
  queryKey: decksKey(),
  queryFn: async () => {
    const { data, error } = await supabase.rpc("list_my_decks");
    if (error) throw error;
    return data ?? [];
  },
  staleTime: 0,
});
```

(The `userId` variable in the surrounding scope is still used elsewhere
in the function — don't remove it.)

- [ ] **Step 7: Update `src/views/HomeView.test.tsx`**

Replace each `http.get(\`${SB_URL}/rest/v1/decks\`, ...)` handler with the
RPC equivalent. For example line 69:

```ts
// Before
server.use(http.get(`${SB_URL}/rest/v1/decks`, () => HttpResponse.json(decks)));
// After
server.use(http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json(decks)));
```

Apply this replacement to each `GET /rest/v1/decks` handler in this file.
The handlers that mock `POST` / `DELETE` / `PATCH` for `/rest/v1/decks`
(used by mutations) stay as-is — mutations still hit the table directly.

If existing tests build a `DeckRow` (with `owner_id`), switch to
`makeDeckSummary.build()` for the list-fetching tests since the new shape
has no `owner_id`. Tests that exercise mutations keep `makeDeckRow`.

- [ ] **Step 8: Update `src/auth/LoginView.test.tsx`**

Same pattern: GET `/rest/v1/decks` handlers used to back the deck-count
prefetch become `POST /rest/v1/rpc/list_my_decks`. The response body
shape changes from rows with `owner_id` to `DeckSummary` (use
`makeDeckSummary.build()` or simple `[{ id: "d1" }]` literals — the
prefetch only reads `decks?.length`).

- [ ] **Step 9: Run the suite**

```bash
npm test -- --run
```

Expected: all green. If a test you didn't expect to touch fails, audit
it for `useDecks(ownerId)` calls or `decksKey(arg)` references and
update.

- [ ] **Step 10: Commit**

```bash
git add src/decks/queries.ts src/decks/mutations.ts src/views/HomeView.tsx src/auth/LoginView.tsx src/decks/queries.test.tsx src/views/HomeView.test.tsx src/auth/LoginView.test.tsx
git commit -m "refactor(decks): useDecks via list_my_decks RPC; decksKey no-arg"
```

---

## Task 4: `useDeck` returns `PublicDeck` + `DeckView` + `RequireOwner`

**Files:**

- Modify: `src/decks/queries.ts`
- Modify: `src/views/DeckView.tsx`
- Modify: `src/auth/RequireOwner.tsx`
- Test: `src/decks/queries.test.tsx`
- Test: `src/views/DeckView.test.tsx`
- Test: `src/auth/RequireOwner.test.tsx`
- Test: `src/app/DeckBreadcrumb.test.tsx`
- Test: `src/views/EditorView.test.tsx`
- Test: `src/views/PrintView.test.tsx`
- Test: `src/views/BrowseApiModal.test.tsx`

- [ ] **Step 1: Update the `useDeck` test**

In `src/decks/queries.test.tsx`, replace the `useDeck` describe block:

```tsx
import { makePublicDeck } from "../test/factories";
// ...

describe("useDeck", () => {
  it("returns a PublicDeck via get_public_deck RPC", async () => {
    const deck = makePublicDeck.build({ is_owner: true });
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
    );
    const { result } = renderHook(() => useDeck(deck.id), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(deck);
  });

  it("returns null when the deck doesn't exist", async () => {
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(null)),
    );
    const { result } = renderHook(() => useDeck("missing"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — should fail**

```bash
npm test -- queries.test
```

Expected: failure on `useDeck` tests; rest still green.

- [ ] **Step 3: Update `useDeck` in `src/decks/queries.ts`**

Replace the existing `useDeck` function with:

```ts
/**
 * A single deck by id. PUBLIC READ — any caller with the deck id can
 * read it. There is no ownership filter; this matches the share-by-link
 * model. The returned row includes `is_owner`, computed server-side
 * from auth.uid(), which UI uses to gate edit affordances. Mutations
 * are still owner-gated by RLS on the underlying table.
 */
export function useDeck(deckId: string | undefined) {
  return useQuery<PublicDeck | null>({
    queryKey: deckKey(deckId),
    enabled: Boolean(deckId),
    queryFn: async () => {
      if (!deckId) return null;
      const { data, error } = await supabase
        .rpc("get_public_deck", { deck_id: deckId })
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PublicDeck | null;
    },
  });
}
```

- [ ] **Step 4: Update `src/views/DeckView.tsx`**

At line 32, replace:

```ts
const isOwner = session.status === "authenticated" && session.user.id === deck.owner_id;
```

with:

```ts
const isOwner = deck.is_owner;
```

If TypeScript flags an unused `session` import, clean it up — but the
session is likely still used elsewhere in the file. Check before
deleting.

- [ ] **Step 5: Update `src/auth/RequireOwner.tsx`**

Replace the entire body of the component (the `userId` derivation,
`ownerId`, the effect, and the render gate) so the new structure reads:

```tsx
export function RequireOwner({ deckId, children }: Props) {
  const session = useSession();
  const deckQuery = useDeck(deckId);
  const navigate = useNavigate();

  const sessionLoading = session.status === "loading";
  const userId = session.status === "authenticated" ? session.user.id : null;
  const isOwner = deckQuery.data?.is_owner;

  useEffect(() => {
    if (sessionLoading || deckQuery.isLoading) return;

    if (!userId) {
      const next = `${window.location.pathname}${window.location.search}`;
      navigate({ to: "/login", search: { next } });
      return;
    }
    if (isOwner === false) {
      navigate({ to: "/deck/$deckId", params: { deckId } });
    }
  }, [sessionLoading, deckQuery.isLoading, userId, isOwner, deckId, navigate]);

  if (sessionLoading || deckQuery.isLoading) return null;
  if (!userId) return null;
  if (isOwner !== true) return null;
  return <>{children}</>;
}
```

(Imports stay unchanged. The login-redirect path still depends on the
session, so `userId` derivation stays — only the ownership comparison
swaps from `ownerId !== userId` to `isOwner !== true`.)

- [ ] **Step 6: Update `src/views/DeckView.test.tsx`**

Replace `GET /rest/v1/decks` handlers with `POST /rest/v1/rpc/get_public_deck`.
Use `makePublicDeck.build({ is_owner: true })` for owner scenarios and
`makePublicDeck.build({ is_owner: false })` for non-owner scenarios.
Tests that previously asserted ownership via `session.user.id === owner_id`
no longer need that — the `is_owner` boolean directly carries the truth.

If a test builds `makeDeckRow.build({ owner_id: user.id })` and feeds it
to a `GET /rest/v1/decks` handler, replace with
`makePublicDeck.build({ is_owner: true })` and the RPC handler.

Same pattern for the cards mocks: any `GET /rest/v1/cards` handlers
become `POST /rest/v1/rpc/get_public_deck_cards` (in Task 5; for now the
DeckView test may still pass with default empty-array behavior from
existing handlers — verify).

- [ ] **Step 7: Update `src/auth/RequireOwner.test.tsx`**

Replace the two `http.get(\`${SB}/rest/v1/decks\`, ...)` handlers
(lines ~46 and ~56) with `POST /rest/v1/rpc/get_public_deck` returning
a `PublicDeck`. The `is_owner` flag drives the test outcome:
`makePublicDeck.build({ is_owner: true })` for the owner case,
`makePublicDeck.build({ is_owner: false })` for the non-owner case.

- [ ] **Step 8: Update `src/app/DeckBreadcrumb.test.tsx`, `src/views/EditorView.test.tsx`, `src/views/PrintView.test.tsx`, `src/views/BrowseApiModal.test.tsx`**

Each: any `http.get(\`${SB_URL}/rest/v1/decks\`, ...)` handler that
backs a `useDeck` call becomes
`http.post(\`${SB_URL}/rest/v1/rpc/get_public_deck\`, ...)` returning a
single `PublicDeck` (or null for not-found). Most consumers don't read
`is_owner` so any boolean works; default to `false` unless the test
specifically asserts owner-gated UI.

- [ ] **Step 9: Run the suite**

```bash
npm test -- --run
```

Expected: green. If `useDeckCards`-related tests fail, defer them — Task 5
handles those.

- [ ] **Step 10: Commit**

```bash
git add src/decks/queries.ts src/views/DeckView.tsx src/auth/RequireOwner.tsx src/decks/queries.test.tsx src/views/DeckView.test.tsx src/auth/RequireOwner.test.tsx src/app/DeckBreadcrumb.test.tsx src/views/EditorView.test.tsx src/views/PrintView.test.tsx src/views/BrowseApiModal.test.tsx
git commit -m "refactor(decks): useDeck via get_public_deck RPC; consume is_owner"
```

---

## Task 5: `useDeckCards` via `get_public_deck_cards` RPC

**Files:**

- Modify: `src/decks/queries.ts`
- Test: `src/decks/queries.test.tsx`
- Test: `src/views/DeckView.test.tsx`
- Test: `src/views/EditorView.test.tsx`
- Test: `src/views/PrintView.test.tsx`

- [ ] **Step 1: Update the `useDeckCards` test**

In `src/decks/queries.test.tsx`, replace the existing `useDeckCards`
describe with:

```tsx
describe("useDeckCards", () => {
  it("returns cards for a deck via get_public_deck_cards RPC", async () => {
    const [firstRow, secondRow] = [makeCardRow.build(), makeCardRow.build()];
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () =>
        HttpResponse.json([firstRow, secondRow]),
      ),
    );
    const { result } = renderHook(() => useDeckCards("deck-id"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cards = result.current.data ?? [];
    expect(cards).toHaveLength(2);
    expect(cards.at(0)?.id).toBe(firstRow.id);
  });
});
```

- [ ] **Step 2: Run the test — should fail**

```bash
npm test -- queries.test
```

Expected: failure on `useDeckCards` test.

- [ ] **Step 3: Update `useDeckCards` in `src/decks/queries.ts`**

Replace the existing function with:

```ts
/**
 * Cards for a deck. Same PUBLIC READ semantics as useDeck.
 */
export function useDeckCards(deckId: string | undefined) {
  return useQuery<Card[]>({
    queryKey: deckCardsKey(deckId),
    enabled: Boolean(deckId),
    queryFn: async () => {
      if (!deckId) return [];
      const { data, error } = await supabase.rpc(
        "get_public_deck_cards",
        { deck_id: deckId },
      );
      if (error) throw error;
      return ((data ?? []) as CardRow[]).map(rowToCard);
    },
  });
}
```

- [ ] **Step 4: Update view tests**

In each of `src/views/DeckView.test.tsx`, `src/views/EditorView.test.tsx`,
`src/views/PrintView.test.tsx`: replace any
`http.get(\`${SB_URL}/rest/v1/cards\`, ...)` handler with
`http.post(\`${SB_URL}/rest/v1/rpc/get_public_deck_cards\`, ...)`.
The response body shape (array of `CardRow`) is unchanged.

- [ ] **Step 5: Run the suite**

```bash
npm test -- --run
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/decks/queries.ts src/decks/queries.test.tsx src/views/DeckView.test.tsx src/views/EditorView.test.tsx src/views/PrintView.test.tsx
git commit -m "refactor(decks): useDeckCards via get_public_deck_cards RPC"
```

---

## Task 6: `anonImport` v2 payload + RPC-based `tryResume`

**Files:**

- Modify: `src/auth/anonImport.ts`
- Test: `src/auth/anonImport.test.ts`

- [ ] **Step 1: Update the storage tests**

In `src/auth/anonImport.test.ts`, replace the storage describe block:

```ts
describe("anonImport storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is stashed", () => {
    expect(readPending()).toBeNull();
  });

  it("round-trips a v2 payload", () => {
    const payload: PendingAnonImport = {
      version: 2,
      anonDeckIds: ["d1", "d2"],
      importedDeckIds: [],
    };
    stash(payload);
    expect(readPending()).toEqual(payload);
  });

  it("clears the stashed payload", () => {
    stash({ version: 2, anonDeckIds: ["d1"], importedDeckIds: [] });
    clear();
    expect(readPending()).toBeNull();
  });

  it("returns null and does not throw on a malformed value", () => {
    window.localStorage.setItem("dndCards.pendingAnonImport", "not json");
    expect(readPending()).toBeNull();
  });

  it("returns null on a stashed v1 payload (silently dropped)", () => {
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({
        version: 1,
        anonUuid: "00000000-0000-0000-0000-000000000001",
        importedDeckIds: [],
      }),
    );
    expect(readPending()).toBeNull();
  });
});
```

- [ ] **Step 2: Update `tryResume` tests**

The hand-rolled `makeFakeSupabase` helper needs an `rpc` method. Replace
the helper and its consumers:

```ts
type FakeRpcResult = { data: unknown; error: Error | null };

type FakeSupabase = {
  decksByOwner: Record<string, Array<{ id: string; name: string }>>;
  deckById: Record<string, { id: string; name: string } | null>;
  cardsByDeck: Record<string, Array<{ id: string; deck_id: string; position: number; payload: unknown }>>;
  inserts: { decks: unknown[]; cards: unknown[] };
  insertResults?: { table: string; error: Error | null }[];
  rpcResults?: Record<string, FakeRpcResult>;
};

function makeFakeSupabase(initial: FakeSupabase) {
  let insertCallCount = 0;
  return {
    state: initial,
    rpc(name: string, params?: Record<string, unknown>) {
      const override = initial.rpcResults?.[name];
      if (override) {
        return {
          maybeSingle: () => Promise.resolve(override),
          then: (resolve: (v: FakeRpcResult) => unknown) => Promise.resolve(override).then(resolve),
        };
      }
      if (name === "get_public_deck") {
        const id = params?.deck_id as string;
        const row = initial.deckById[id] ?? null;
        return {
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        };
      }
      if (name === "get_public_deck_cards") {
        const id = params?.deck_id as string;
        const rows = initial.cardsByDeck[id] ?? [];
        return Promise.resolve({ data: rows, error: null });
      }
      if (name === "list_my_decks") {
        // Used at stash sites, not in tryResume.
        return Promise.resolve({ data: [], error: null });
      }
      throw new Error(`unmocked rpc: ${name}`);
    },
    from(table: string) {
      // Insert path — kept from the original helper.
      return {
        insert(rows: unknown) {
          initial.inserts[table as "decks" | "cards"].push(rows);
          const callNum = insertCallCount++;
          const resultConfig = initial.insertResults?.[callNum];
          if (resultConfig?.error) {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: null, error: resultConfig.error }),
              }),
            };
          }
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: { id: "new-deck-id", ...(Array.isArray(rows) ? rows[0] : rows) },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
}
```

Update each existing `tryResume` test to (a) stash a v2 payload with
`anonDeckIds` and (b) populate `deckById` / `cardsByDeck` keyed by deck
id rather than owner. For example:

```ts
it("clones each anon-owned deck and its cards under the new user", async () => {
  stash({ version: 2, anonDeckIds: ["d1"], importedDeckIds: [] });
  const fake = makeFakeSupabase({
    decksByOwner: {},
    deckById: { d1: { id: "d1", name: "Goblins" } },
    cardsByDeck: { d1: [{ id: "c1", deck_id: "d1", position: 0, payload: { kind: "item", name: "Sword" } }] },
    inserts: { decks: [], cards: [] },
  });
  await tryResume({ supabase: fake as never, currentUserId: "real-1" });
  expect(fake.state.inserts.decks).toHaveLength(1);
  expect(fake.state.inserts.cards).toHaveLength(1);
  expect(readPending()).toBeNull();
});
```

Update the partial-resume test similarly: stash with
`anonDeckIds: ["d1", "d2"]`, populate both deck rows, configure
`insertResults` so the second deck insert errors, expect
`{ kind: "partial", importedCount: 1, total: 2 }`. Update the
"deleted between stash and resume" test (was "zero rows"): stash a
deck id, set `deckById["missing"] = null`, expect the imported count
to advance past it without inserting.

- [ ] **Step 3: Run tests — should fail**

```bash
npm test -- anonImport
```

Expected: failures on the v2 payload and `tryResume` tests.

- [ ] **Step 4: Rewrite `src/auth/anonImport.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY = "dndCards.pendingAnonImport";

export type PendingAnonImport = {
  version: 2;
  anonDeckIds: string[];
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
    if (parsed.version !== 2) return null;
    return parsed as PendingAnonImport;
  } catch {
    return null;
  }
}

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
  if (pending.anonDeckIds.length === 0) {
    clear();
    return { kind: "completed", importedCount: 0 };
  }

  const total = pending.anonDeckIds.length;
  let imported = pending.importedDeckIds.length;
  args.onProgress?.(imported, total);

  for (const deckId of pending.anonDeckIds) {
    if (pending.importedDeckIds.includes(deckId)) continue;

    const { data: oldDeck, error: deckError } = await args.supabase
      .rpc("get_public_deck", { deck_id: deckId })
      .maybeSingle();
    if (deckError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }
    if (!oldDeck) {
      // Anon deck deleted between stash and resume — mark as imported and continue.
      pending.importedDeckIds.push(deckId);
      imported += 1;
      stash(pending);
      args.onProgress?.(imported, total);
      continue;
    }

    const oldDeckRow = oldDeck as { id: string; name: string };

    const { data: newDeck, error: insertDeckError } = await args.supabase
      .from("decks")
      .insert({ owner_id: args.currentUserId, name: oldDeckRow.name })
      .select()
      .single();
    if (insertDeckError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    const { data: cards, error: cardsError } = await args.supabase.rpc(
      "get_public_deck_cards",
      { deck_id: deckId },
    );
    if (cardsError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    const cardRows = (cards ?? []) as Array<{ position: number; payload: unknown }>;
    if (cardRows.length > 0) {
      const rows = cardRows.map((c) => ({
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

    pending.importedDeckIds.push(deckId);
    imported += 1;
    stash(pending);
    args.onProgress?.(imported, total);
  }

  clear();
  return { kind: "completed", importedCount: imported };
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- anonImport
```

Expected: green.

- [ ] **Step 6: Run full suite**

```bash
npm test -- --run
```

Expected: green. (LoginView/AuthCallback may still pass with default
handlers; Task 7 cleans up.)

- [ ] **Step 7: Commit**

```bash
git add src/auth/anonImport.ts src/auth/anonImport.test.ts
git commit -m "refactor(auth): anonImport v2 payload + RPC-based tryResume"
```

---

## Task 7: `LoginView` + `AuthCallback` stash sites prefetch deck ids

**Files:**

- Modify: `src/auth/LoginView.tsx`
- Modify: `src/auth/AuthCallback.tsx`
- Test: `src/auth/LoginView.test.tsx`
- Test: `src/auth/AuthCallback.test.tsx`

- [ ] **Step 1: Update `src/auth/LoginView.tsx` `onImportConfirm`**

Find the `onImportConfirm` handler (around line 123). Replace the line
`stash({ version: 1, anonUuid, importedDeckIds: [] });` (around line 128)
with:

```ts
const { data: anonDecks, error: listError } = await supabase.rpc("list_my_decks");
if (listError) {
  setAnnouncement("Couldn't fetch your decks for import.");
  return;
}
const anonDeckIds = (anonDecks ?? []).map((d: { id: string }) => d.id);
stash({ version: 2, anonDeckIds, importedDeckIds: [] });
```

The surrounding `anonUuid` destructuring (around line 125) becomes
unused — remove it. The rest of the handler (signOut, signInWithPassword,
tryResume) is unchanged.

- [ ] **Step 2: Update `src/auth/AuthCallback.tsx` `onImport`**

Find the `onImport` handler (around line 101). Replace the line
`stash({ version: 1, anonUuid: session.user.id, importedDeckIds: [] });`
(around line 103) with:

```ts
const { data: anonDecks, error: listError } = await supabase.rpc("list_my_decks");
if (listError) {
  setAnnouncement("Couldn't fetch your decks for import.");
  return;
}
const anonDeckIds = (anonDecks ?? []).map((d: { id: string }) => d.id);
stash({ version: 2, anonDeckIds, importedDeckIds: [] });
```

- [ ] **Step 3: Update `src/auth/LoginView.test.tsx`**

For tests that exercise the import flow, add a mock for the new
`list_my_decks` call. Most tests already mock it via Task 3; verify
the mock returns the right shape (an array with `id` fields). For the
new failure-mode test:

```tsx
it("aborts import flow when list_my_decks errors", async () => {
  server.use(
    http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () =>
      HttpResponse.json({ message: "boom" }, { status: 500 }),
    ),
  );
  // ... render LoginView, trigger the import path, assert on the announcement
  // and that no signOut occurred.
});
```

Adapt the assertion shape to whatever pattern the file already uses.

- [ ] **Step 4: Update `src/auth/AuthCallback.test.tsx`**

The test stubs `supabase.from()` directly (around line 60). When the
`onImport` path runs, it now calls `supabase.rpc('list_my_decks')` first.
Extend the stub to intercept `rpc` as well:

```tsx
vi.spyOn(supabase, "rpc").mockImplementation((name: string) => {
  if (name === "list_my_decks") {
    return Promise.resolve({ data: [{ id: "d1" }], error: null }) as never;
  }
  throw new Error(`unmocked rpc: ${name}`);
});
```

Adjust to whatever style the existing file uses (jest.fn vs vi.fn vs
spyOn). The tests that currently exercise the
`from('decks').select(...).eq('owner_id', ...)` branch now exercise the
`rpc('list_my_decks')` branch instead.

- [ ] **Step 5: Run the suite**

```bash
npm test -- --run
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/auth/LoginView.tsx src/auth/AuthCallback.tsx src/auth/LoginView.test.tsx src/auth/AuthCallback.test.tsx
git commit -m "refactor(auth): prefetch anon deck ids before stash"
```

---

## Task 8: Final verification

**No file changes — verification only.**

- [ ] **Step 1: Full suite**

```bash
npm test -- --run
```

Expected: green.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Apply the migration locally and smoke-test**

```bash
npx supabase db reset
npm run dev
```

In the browser:
- Sign in. HomeView should list your own decks.
- Open one of your own decks → DeckView shows the edit affordance,
  EditorView opens.
- Open one of your own decks via someone else's session (or in an
  incognito tab) — DeckView should still load (public-by-link), but the
  edit affordance should be hidden, and navigating to `/edit/...`
  should bounce to the read-only `/deck/$deckId`.
- If `VITE_ANON_USERS_ENABLED` is on: create an anon deck, click
  sign-in, complete OAuth, observe that decks import on return.

If any step fails, fix inline and add a regression test before
committing the fix.

- [ ] **Step 5: Push (only if user explicitly asks)**

This plan does not push or open a PR automatically. Wait for explicit
direction from the user.

---

## Notes / clean-up reminders

- `DeckRow` type stays in `src/decks/types.ts` — `mutations.ts`
  `insert(...).select()` returns the full table row. Don't delete it.
- `supabaseDefaultHandlers` in `src/test/msw.ts` keeps its
  `GET /rest/v1/decks` and `GET /rest/v1/cards` defaults: the
  `insertOrUpdate-with-Prefer: return=representation` round-trip uses
  `POST` / `PATCH`, so the GET defaults are no longer hit by query
  paths but are inert and harmless. Leave them — removing is out of
  scope.
- Don't push, don't open a PR. The user has standing direction not to
  push without explicit instruction.
