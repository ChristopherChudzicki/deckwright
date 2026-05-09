-- supabase/tests/rls.test.sql
begin;
select plan(13);

-- Helpers: create two test users in auth.users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test');

-- Act as Alice and create a deck.
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
set local role authenticated;

insert into public.decks (id, owner_id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Alice deck');

select lives_ok(
  $$insert into public.cards (deck_id, position, payload) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0,
    '{"kind":"item","name":"x","body":"","headerTags":[],"footerTags":[],"source":"custom","createdAt":"2026-04-26T00:00:00Z","updatedAt":"2026-04-26T00:00:00Z"}'::jsonb
  )$$,
  'owner can insert card into own deck'
);

-- Owner sees own deck via list_my_decks and is_owner=true via get_public_deck.
select is(
  (select count(*)::int from public.list_my_decks() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'owner sees own deck via list_my_decks'
);

select is(
  (select is_owner from public.get_public_deck('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  true,
  'get_public_deck reports is_owner=true for the owner'
);

-- Switch to Bob.
set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';

-- RLS note: permissive UPDATE/DELETE policies silently FILTER non-matching
-- rows rather than throwing 42501 — the SQL succeeds and returns 0 rows
-- affected. (Restrictive policies do throw, but ours are permissive.) We
-- use `with ... returning` to assert the row count directly, which fails
-- if a future policy change inadvertently allows non-owner writes.

with attempted as (
  update public.decks set name = 'hacked'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  returning 1
)
select is(
  (select count(*)::int from attempted),
  0,
  'non-owner UPDATE on a deck affects 0 rows'
);

with attempted as (
  delete from public.decks
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  returning 1
)
select is(
  (select count(*)::int from attempted),
  0,
  'non-owner DELETE on a deck affects 0 rows'
);

-- Owner-only SELECT: non-owner sees no rows via direct SELECT on either table.
select is(
  (select count(*)::int from public.decks where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'non-owner cannot direct-SELECT decks'
);

select is(
  (select count(*)::int from public.cards where deck_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'non-owner cannot direct-SELECT cards'
);

-- Public-by-link: non-owner can read via SECURITY DEFINER RPCs given the UUID.
select is(
  (select count(*)::int from public.get_public_deck('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  1,
  'non-owner can read deck via get_public_deck RPC'
);

select is(
  (select is_owner from public.get_public_deck('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  false,
  'get_public_deck reports is_owner=false for non-owner'
);

select is(
  (select count(*)::int from public.get_public_deck_cards('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  1,
  'non-owner can read cards via get_public_deck_cards RPC'
);

-- list_my_decks is owner-scoped: Bob sees nothing.
select is(
  (select count(*)::int from public.list_my_decks()),
  0,
  'non-owner sees 0 rows in list_my_decks'
);

set local role anon;

select throws_ok(
  $$insert into public.decks (owner_id, name) values ('11111111-1111-1111-1111-111111111111', 'spam')$$,
  '42501',
  null,
  'anon cannot INSERT decks'
);

-- Cascade delete: when Alice deletes the deck, the card goes too.
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';

delete from public.decks where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*)::int from public.cards where deck_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'cards cascade-delete with parent deck'
);

select * from finish();
rollback;
