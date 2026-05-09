# Harden RLS via RPC functions

## Problem

`decks_select_all` and `cards_select_all` use `using (true)`. Any
authenticated principal — including anonymous JWTs from the recently
merged anon-users feature — can `SELECT *` from `public.decks` and
`public.cards`. One API call mints an anon JWT, then a caller can
enumerate every deck and card in the database.

The exposure has a second axis. The app's intended access model is:

- **Deck listing is private** — only the owner sees their own decks on
  HomeView.
- **Deck viewing is public-by-UUID** — anyone with the deck id can read
  it (share-by-link). Surfaced in `LoginView.tsx:172` as
  "Anyone can view shared decks via link."

These semantics live entirely inside the SQL RLS policies. Nothing in
the TypeScript code, function names, or schema reflects them. A reader
(human or LLM) inspecting `useDeck` cannot tell whether decks are meant
to be private or public, and the `using (true)` policy is
indistinguishable from a bug.

A subtler issue: today's `select *` on `decks` returns `owner_id` to any
link-holder. `DeckView` and `RequireOwner` use that field to decide
whether to show the edit affordance / allow editing. Two fixes are
possible — either keep `owner_id` on the wire (status quo, leaks the
owner's UUID to anyone with a share link) or have the server compute
the boolean and return that instead. We do the latter.

## Solution

Three changes, shipped together:

1. **Tighten the SELECT policies on `decks` and `cards`** from
   `using (true)` to owner-only. This closes the enumeration exposure
   directly: a hostile caller doing `from('decks').select('id')` now
   sees only their own rows, so anon JWTs can no longer enumerate.

2. **Add SECURITY DEFINER RPC functions for the access patterns the
   tightened policy doesn't support** — specifically, the
   public-by-UUID reads required by share-by-link and the anon-import
   resume flow. Three functions: `list_my_decks()` (owner-scoped),
   `get_public_deck(deck_id)` (public-by-UUID, returns an `is_owner`
   boolean computed from `auth.uid()`), `get_public_deck_cards(deck_id)`
   (public-by-UUID). All three return explicit columns, not
   `setof public.<table>`, so future columns added to the underlying
   tables don't become silently public.

3. **Make the public-by-UUID model legible in code.** Function names
   carry "public" explicitly. SQL `comment on function` documents the
   trust model at the database. JSDoc on the matching React hooks
   mirrors it at the call site.

Mutations (`insert` / `update` / `delete`) stay on the existing
direct-table RLS policies, which already gate on `owner_id = auth.uid()`.

### Why not `revoke select` from authenticated?

The original issue proposed revoking direct SELECT entirely. That breaks
`mutations.ts`. `useCreateDeck`, `useRenameDeck`, and `useSaveCard` all
use `insert(...).select().maybeSingle()` /
`update(...).select().maybeSingle()`, which PostgREST translates to
`INSERT/UPDATE … RETURNING`. RETURNING is gated by the SELECT RLS
policy and requires SELECT privilege at the table level. Revoking SELECT
from `authenticated` would force every mutation to also become an RPC
with a custom return type — a much larger surface.

The tightened owner-only SELECT policy gives the same security posture
(no cross-identity enumeration) while letting RETURNING keep working
for the owner's own writes — the inserted/updated row is owned by
`auth.uid()`, so it satisfies the SELECT policy at RETURNING time.

## Scope

In scope:

- New migration: drop `decks_select_all` / `cards_select_all`, add
  owner-only SELECT policies, create the three RPC functions, revoke
  EXECUTE from PUBLIC, grant EXECUTE to `authenticated`.
- `src/decks/queries.ts` refactor to call the RPCs.
- `src/decks/queries.ts`: `decksKey` drops its `ownerId` argument and
  becomes `() => ["decks"] as const`. `useDecks` drops its `ownerId`
  parameter (server reads `auth.uid()`).
- `src/decks/mutations.ts`: callers of `decksKey(...)` (lines 28, 49)
  drop the argument.
- `src/views/DeckView.tsx`: switch ownership check from
  `session.user.id === deck.owner_id` to `deck.is_owner`.
- `src/auth/RequireOwner.tsx`: switch from comparing `owner_id` to
  reading `is_owner` directly.
- `src/views/HomeView.tsx`: `useDecks()` no longer takes an arg.
- `src/auth/anonImport.ts`: payload v2 stores `anonDeckIds: string[]`
  instead of `anonUuid`; `tryResume` iterates via the public-deck RPCs.
- `src/auth/LoginView.tsx` (line 128) and `src/auth/AuthCallback.tsx`
  (line 103): both call sites fetch the anon's deck ids via
  `list_my_decks` *before* stashing.
- `src/auth/LoginView.tsx` (lines 40–47 and 84–91): two
  `queryClient.fetchQuery` blocks switch from a custom direct-table
  `queryFn` to the `list_my_decks` RPC, and from `decksKey(userId)` to
  `decksKey()`.
- New MSW RPC handler infrastructure in `src/test/msw.ts`. There is no
  RPC handler scaffolding today.
- Updates to existing test files that mock `from('decks')` /
  `from('cards')` (full list under "Test impact" below).
- JSDoc on `useDeck` / `useDeckCards` documenting the public-read model.

Out of scope:

- `is_public` column. All decks are public-by-link today; an `is_public`
  column whose value is always `true` is YAGNI. If the app ever
  introduces private decks, a follow-up migration adds the column with a
  `default true`.
- UI changes signaling the public-by-link model (separate decision per
  user feedback).
- Anon-user cleanup (separate handoff at
  `docs/superpowers/handoffs/2026-05-08-anon-user-cleanup-notes.md`).
- Mutation-side RLS. Existing policies already enforce
  `owner_id = auth.uid()` on insert/update/delete; this work doesn't
  touch them.
- Public deck listing or discovery. There is no "list all public decks"
  endpoint and none is added.

## Migration

A single new file under `supabase/migrations/`,
`20260508000000_rls_rpc_hardening.sql`, containing:

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
-- Explicit return columns; do not use `setof public.decks` so a future
-- column on `decks` doesn't become unintentionally readable here.
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

-- Public read by UUID: DeckView, share-by-link, anon-import resume.
-- Decks are intentionally public-by-link in this app — anyone with the
-- deck id can read it. There is no ownership filter.
--
-- The `is_owner` flag is computed server-side from auth.uid() so the
-- caller's user UUID never round-trips through the response. UI code
-- gates the edit affordance on `is_owner` rather than comparing
-- `owner_id` client-side.
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
    -- coalesce so an unauthenticated caller (auth.uid() is null →
    -- comparison is null) gets a concrete `false`, matching the
    -- declared return type and the client TS type.
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
  -- Alias the table so column references in SELECT and WHERE are
  -- unambiguous against the parameter `deck_id`. Column-vs-parameter
  -- precedence works without aliasing today, but is brittle to future
  -- edits (joins, aliases, #variable_conflict directives).
  select c.id, c.deck_id, c.position, c.payload, c.created_at, c.updated_at
  from public.cards c
  where c.deck_id = get_public_deck_cards.deck_id
  order by c.created_at asc
$$;

comment on function public.get_public_deck_cards(uuid) is
  'Public read by UUID — returns cards for a deck readable by anyone '
  'with the deck id. Same trust model as get_public_deck.';

-- Postgres grants EXECUTE to PUBLIC by default on new functions.
-- Revoke that and re-grant explicitly to `authenticated` only.
revoke execute on function public.list_my_decks() from public;
revoke execute on function public.get_public_deck(uuid) from public;
revoke execute on function public.get_public_deck_cards(uuid) from public;

grant execute on function public.list_my_decks() to authenticated;
grant execute on function public.get_public_deck(uuid) to authenticated;
grant execute on function public.get_public_deck_cards(uuid)
  to authenticated;
```

Notes:

- `security definer` + `set search_path = ''` is the Supabase-recommended
  pattern. Functions execute as their owner (`postgres`/`supabase_admin`,
  which is `BYPASSRLS`), so the function bodies bypass the new owner-only
  policy. The function bodies enforce the access model explicitly:
  `auth.uid()` filter for `list_my_decks`; no filter for the public-deck
  reads.
- `auth.uid()` reads from the request JWT and is unaffected by
  `security definer`, so it correctly resolves to the *caller's*
  identity.
- `stable` (not `volatile`) so PostgREST treats them as cacheable read
  RPCs. Bodies are pure SELECTs against tables.
- The `anon` PostgREST role is intentionally not granted EXECUTE. The
  app's "anon users" are actually `authenticated` (they hold a JWT);
  the unauthenticated `anon` role has no use case here today.
- All three functions return explicit columns. Adding a column to
  `decks` or `cards` does not auto-leak via these RPCs.

## Type changes

Two new return-row types in `src/decks/types.ts`, replacing the
existing `DeckRow` for read paths (mutation paths still use `DeckRow`
because they go through direct-table operations):

```ts
// Returned by list_my_decks().
export type DeckSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

// Returned by get_public_deck(). Adds is_owner so callers can gate UI
// without learning the owner's UUID.
export type PublicDeck = DeckSummary & {
  is_owner: boolean;
};

// Returned by get_public_deck_cards(). Same shape as today's CardRow
// (cards has no owner column).
// CardRow stays.
```

`DeckRow` (with `owner_id`) is kept for `mutations.ts` since
`insert(...).select()` returns the full table row, including `owner_id`.

## Client refactor

### `src/decks/queries.ts`

```ts
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
      return data ?? [];
    },
  });
}

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
      return data ?? null;
    },
  });
}

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

### `src/decks/mutations.ts`

Two call sites update to drop the now-removed `decksKey` argument:

```ts
// useCreateDeck onSuccess (was: decksKey(vars.ownerId))
qc.invalidateQueries({ queryKey: decksKey() });

// useRenameDeck onSuccess (was: decksKey(data.owner_id))
qc.invalidateQueries({ queryKey: decksKey() });
```

`useDeleteDeck` already invalidates `["decks"]` directly and is
unchanged. Mutation function bodies and `DeckRow` returns are
unchanged.

### `src/auth/LoginView.tsx` — `fetchQuery` calls

Two `queryClient.fetchQuery` blocks (lines 40–47 and 84–91 today) use
`decksKey(userId)` as the query key and a custom `queryFn` that does
`from('decks').select('id').eq('owner_id', userId)` to count anon decks
before deciding whether to show the import dialog. Both update to:

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

This swaps both the query key (no `userId` argument) and the queryFn
(uses the new RPC for consistency with `useDecks`, and the cache shape
now matches `DeckSummary[]` instead of an ad-hoc `Array<{id}>`).

### `src/views/HomeView.tsx`

Drops local `ownerId` derivation for the `useDecks` call. `ownerId` is
still derived from session for `createDeck.mutateAsync({ name, ownerId })`,
because `useCreateDeck` still needs it as an INSERT input. Only the
`useDecks(ownerId)` call site changes to `useDecks()`.

### `src/views/DeckView.tsx`

```ts
// Was: const isOwner = session.status === "authenticated" && session.user.id === deck.owner_id;
const isOwner = deck.is_owner;
```

The session check becomes redundant: `is_owner` is `false` for any
caller who doesn't own the deck, including unauthenticated ones. The
RPC body uses `coalesce(owner_id = auth.uid(), false)` so the
unauthenticated case (where `auth.uid()` is null) returns a concrete
SQL `false`, not null.

### `src/auth/RequireOwner.tsx`

```ts
// Was: const ownerId = deckQuery.data?.owner_id;
//      if (ownerId && ownerId !== userId) navigate({ to: "/deck/$deckId", params: { deckId } });
//      if (ownerId !== userId) return null;
const isOwner = deckQuery.data?.is_owner;
// In the effect (existing sessionLoading + deckQuery.isLoading guard stays):
if (isOwner === false) {
  navigate({ to: "/deck/$deckId", params: { deckId } });
}
// In the render gate:
if (isOwner !== true) return null;
```

The hook continues to use the `useDeck` result; only the comparison
changes. The redirect target stays `/deck/$deckId` (the read-only
view), preserving today's UX where a non-owner who lands on an editor
URL gets bounced to the readable version of the same deck.

### `src/auth/anonImport.ts`

Payload becomes:

```ts
export type PendingAnonImport = {
  version: 2;
  anonDeckIds: string[];
  importedDeckIds: string[];
};
```

`stash` callers pass `anonDeckIds` directly. `readPending` returns null
on `version !== 2`, clearing the entry. v1 payloads from the just-merged
anon-users feature are silently dropped — acceptable because the feature
is not enabled in production (`VITE_ANON_USERS_ENABLED` defaults off
outside dev).

`tryResume` iterates `anonDeckIds`:

```ts
for (const deckId of pending.anonDeckIds) {
  if (pending.importedDeckIds.includes(deckId)) continue;

  const { data: oldDeck, error: deckError } = await supabase
    .rpc("get_public_deck", { deck_id: deckId })
    .maybeSingle();
  if (deckError) { stash(pending); return partial(); }
  if (!oldDeck) {
    // Anon deck was deleted between stash and resume. Mark as imported
    // (nothing to copy) and continue.
    pending.importedDeckIds.push(deckId);
    imported += 1;
    stash(pending);
    continue;
  }

  const { data: oldCards, error: cardsError } = await supabase
    .rpc("get_public_deck_cards", { deck_id: deckId });
  if (cardsError) { stash(pending); return partial(); }

  // Insert new deck + cards under the current (permanent) user, as today.
}
```

Insert paths are unchanged — they go through direct-table RLS, which
already enforces `owner_id = auth.uid()`.

### `src/auth/LoginView.tsx` and `src/auth/AuthCallback.tsx`

The `stash` call sites both run while the user is still authenticated
as anon. Each call site fetches the anon's deck ids via the new
`list_my_decks` RPC immediately before stashing:

```ts
// Was: stash({ version: 1, anonUuid, importedDeckIds: [] });
const { data: anonDecks, error } = await supabase.rpc("list_my_decks");
if (error) {
  setAnnouncement("Couldn't fetch your decks for import.");
  return;
}
const anonDeckIds = (anonDecks ?? []).map((d) => d.id);
stash({ version: 2, anonDeckIds, importedDeckIds: [] });
```

If `list_my_decks` fails the import flow aborts before sign-out — the
user stays anon and can retry. (Today's flow has no equivalent
failure mode because the deck list isn't fetched up front.)

## Test impact

**Net-new MSW infrastructure** in `src/test/msw.ts`. Today the file has
only REST handlers (`http.get('/rest/v1/decks')`, `http.post(...)`,
etc., lines 18–39). RPC handler shape is `POST /rest/v1/rpc/<name>`
with the RPC argument as the JSON body. The migration adds:

- `POST /rest/v1/rpc/list_my_decks` → `DeckSummary[]`
- `POST /rest/v1/rpc/get_public_deck` → `PublicDeck | null` (with
  `Accept: application/vnd.pgrst.object+json` for `.maybeSingle()`)
- `POST /rest/v1/rpc/get_public_deck_cards` → `CardRow[]`

Existing GET handlers for `/rest/v1/decks`, `/rest/v1/cards` can stay
(POST/PATCH from mutations still hit the table directly with
`Prefer: return=representation`); they're no longer exercised by query
paths but remain valid request shapes.

**Test files mocking `from('decks')` / `from('cards')` SELECTs** that
need updates to mock the new RPC paths instead:

- `src/decks/queries.test.tsx`
- `src/decks/mutations.test.tsx`
- `src/views/HomeView.test.tsx`
- `src/views/DeckView.test.tsx`
- `src/views/EditorView.test.tsx`
- `src/views/PrintView.test.tsx`
- `src/views/BrowseApiModal.test.tsx`
- `src/app/DeckBreadcrumb.test.tsx`
- `src/auth/RequireOwner.test.tsx`
- `src/auth/LoginView.test.tsx` — the `fetchQuery` blocks switch
  queryFn to `list_my_decks` RPC, so any test stub of
  `from('decks').select('id').eq('owner_id', userId)` becomes a stub
  of the RPC instead.
- `src/auth/AuthCallback.test.tsx` — stubs `supabase.from()` directly
  (not via MSW). When `AuthCallback.tsx:39` switches to
  `supabase.rpc('list_my_decks')`, the stub branch updates to mock
  `supabase.rpc` instead.
- `e2e/fixtures.ts` if it stubs deck reads at the network layer

**`src/auth/anonImport.test.ts`** updates for the v2 payload shape and
the new RPC fetch calls. The partial-resume coverage (per-deck
iteration unit) is unchanged in shape and should keep passing after the
mock surface swap.

**New tests:**
- v1 payloads in localStorage are silently discarded.
- `LoginView` / `AuthCallback` abort if `list_my_decks` errors before
  stash (announce + skip sign-out).
- A `RequireOwner` test that confirms `is_owner === false` redirects
  away.
- Manual smoke (post-deploy): list / view / edit own decks; share-by-link
  loads a deck owned by a different user with `is_owner === false` and
  the edit affordance hidden; anon-import resume completes after sign-in.

## Risks and considerations

- **Existing data**: no schema changes, no data migration. The migration
  swaps the SELECT policy and adds three RPCs.
- **Mutations preserved**: `mutations.ts` uses
  `insert(...).select().maybeSingle()` /
  `update(...).select().maybeSingle()`, which compile to
  `INSERT/UPDATE … RETURNING`. The owner-only SELECT policy permits
  RETURNING for the owner's own writes. Mutation function bodies don't
  change; only the two `decksKey(...)` invalidation calls update to drop
  the argument.
- **Browser cache**: TanStack Query cache key for `useDecks` changes
  (no `ownerId`). On deploy, in-flight users see one extra refetch. No
  data loss.
- **`is_owner` correctness for anon callers**: the SECURITY DEFINER body
  computes `coalesce(owner_id = auth.uid(), false)`. For anon JWT
  callers, `auth.uid()` returns the anon user UUID; `is_owner` is true
  iff the anon user owns the deck (rare but valid case during the
  import-pending window). For unauthenticated callers (no JWT — would
  use Supabase `anon` role), the function isn't granted EXECUTE so the
  call 401s before reaching the body; even if that grant changed,
  `coalesce(... , false)` ensures `is_owner` is a concrete `false` and
  the TS `boolean` type is honored.
- **Function ownership**: `security definer` functions execute as their
  owner. Migrations run as `postgres`/`supabase_admin` (BYPASSRLS), so
  the functions own that bypass capability. This is the intended
  mechanism: `get_public_deck` would be blocked by the new owner-only
  SELECT policy if it ran as the caller.
- **Other call sites**: scan confirms no code outside `queries.ts`,
  `mutations.ts`, `anonImport.ts`, `RequireOwner.tsx`, `DeckView.tsx`,
  `HomeView.tsx`, `LoginView.tsx`, `AuthCallback.tsx` depends on
  `decks.owner_id` from a read path. `LoginView.tsx:43`, `:87`, and
  `AuthCallback.tsx:39` use `from('decks').select('id').eq('owner_id', ...)`
  to count anon decks before showing the import dialog — these still
  work under owner-only SELECT (the caller is the anon user, querying
  their own rows).

## Out-of-scope follow-ups

- UI signal that decks are public-by-link (badge, copy, share button).
- `is_public` column when private decks become a real feature.
- Public-deck listing/discovery if ever needed.
- Anon-user cleanup (separate handoff).
