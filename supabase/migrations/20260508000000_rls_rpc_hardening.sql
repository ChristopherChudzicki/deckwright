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
