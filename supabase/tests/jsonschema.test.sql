-- supabase/tests/jsonschema.test.sql
begin;
select plan(4);

-- Set up an owner + deck so we can hit the cards CHECK.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test');
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
set local role authenticated;
insert into public.decks (id, owner_id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'd');

select lives_ok(
  $$insert into public.cards (deck_id, payload) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '{"kind":"item","name":"Sword","body":"sharp","headerTags":["Weapon"],"footerTags":[],"source":"custom","createdAt":"2026-04-26T00:00:00Z","updatedAt":"2026-04-26T00:00:00Z"}'::jsonb
  )$$,
  'valid ItemCard payload accepted'
);

select throws_ok(
  $$insert into public.cards (deck_id, payload) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '{"name":"Sword"}'::jsonb
  )$$,
  '23514',
  null,
  'payload missing kind rejected'
);

-- The JSON Schema uses plain z.string() without ISO format enforcement, so
-- non-ISO timestamps pass. Instead, test that an "item" payload missing the
-- required "headerTags" field is rejected.
select throws_ok(
  $$insert into public.cards (deck_id, payload) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '{"kind":"item","name":"Sword","body":"","footerTags":[],"source":"custom","createdAt":"2026-04-26T00:00:00Z","updatedAt":"2026-04-26T00:00:00Z"}'::jsonb
  )$$,
  '23514',
  null,
  'item payload missing required headerTags rejected'
);

select throws_ok(
  $$insert into public.cards (deck_id, payload) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '{"kind":"unknown","name":"x","body":"","source":"custom","createdAt":"2026-04-26T00:00:00Z","updatedAt":"2026-04-26T00:00:00Z"}'::jsonb
  )$$,
  '23514',
  null,
  'payload with unknown kind discriminator rejected'
);

select * from finish();
rollback;
