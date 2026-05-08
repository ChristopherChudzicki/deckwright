# Anonymous user cleanup — research notes

**Date:** 2026-05-08
**Status:** deferred from the [Anonymous Supabase Users spec](../specs/2026-05-07-anon-supabase-users-design.md)

## Why this doc exists

The original anonymous-users spec included a weekly `pg_cron` job to delete stale anon `auth.users` rows. Two consecutive review rounds turned up a long tail of correctness and operational issues that, taken together, cost more design and implementation budget than the cleanup is actually worth for a hobby project.

Decision: ship anonymous users without cleanup. Keep this doc so that whoever revisits the cleanup question later doesn't have to rediscover everything.

## Why cleanup is not urgent

Three potential reasons to clean up; none of them currently bind:

1. **Database row count.** `auth.users` rows are tiny. 100k abandoned anon rows consume well under the free-tier 500MB limit. Decks/cards belonging to abandoned users live under `on delete cascade`, so they'd vanish if/when the user does — but they're not large either.
2. **MAU billing.** Supabase counts MAU only when a user signs in or refreshes a token. Truly abandoned anon users don't bill. There's no cost pressure.
3. **Operator hygiene.** When poking around `auth.users` for debugging, anon users clutter. A `where is_anonymous = false` filter solves it.

If MAU starts climbing, or if `auth.users` ever crosses some operationally annoying threshold, revisit. Until then the table can grow.

## Patterns we considered

| Pattern | Status |
|---|---|
| Do nothing | What we shipped |
| `pg_cron` direct DELETE on `auth.users` | Rejected — `postgres` role lacks DELETE permission |
| `pg_cron` + `SECURITY DEFINER` function that does DELETE | Rejected — works in principle but stacks several Supabase pitfalls (see below); two review rounds turned up new problems |
| `pg_cron` + `pg_net` → Edge Function calling `auth.admin.deleteUser()` | The right pattern when revisited; still needs all the fixes below |
| External cron (GitHub Actions / Vercel cron) → Edge Function | Same Edge Function as above; only differs in scheduler. Useful if the Postgres-side complexity feels worse than CI complexity |

## Pitfalls we found (and the fixes)

These all bit the spec and would bite a re-attempt. Address each before shipping cleanup.

### Permission and role pitfalls

- **`postgres` cannot DELETE from `auth.users` directly.** That table is owned by `supabase_auth_admin`. The bare `delete from auth.users where ...` from a `pg_cron` job will fail with a permission error. Standard workarounds: a `SECURITY DEFINER` function owned by `supabase_auth_admin`, an explicit `grant delete on auth.users to postgres` (broader privilege than necessary), or call `auth.admin.deleteUser()` from an Edge Function (which uses `service_role`).
- **`alter function ... owner to supabase_auth_admin` from a standard migration often fails with 42501.** `postgres` is sometimes — not always — a member of `supabase_auth_admin`'s role group, and ownership transfer also requires CREATE on the function's schema. If we go the SECURITY DEFINER route, ownership transfer should not be load-bearing; default `postgres` ownership is enough for read-only operations on `auth.sessions` (which `postgres` can already SELECT).
- **Cascading deletes from `auth.users` run as `supabase_auth_admin`, not as the caller.** Calling `auth.admin.deleteUser(id)` triggers the FK cascade to `public.decks` (and transitively `public.cards`), but that cascade executes under `supabase_auth_admin`, which doesn't have default `DELETE` permission on `public` tables. Expect cascades to fail unless you `grant delete on public.decks, public.cards to supabase_auth_admin;` in a migration. ([Discussion #28776](https://github.com/orgs/supabase/discussions/28776))
- **`vault.decrypted_secrets` reads from a cron job often hit `permission denied`.** If the cron schedule embeds Vault reads (for project URL or service-role key), grant SELECT on the view to `postgres`, or move the secrets out of Vault and into Edge Function env vars (which Supabase auto-injects).

### Activity-signal pitfalls

- **`auth.users.last_sign_in_at` does not update on token refresh.** A returning anon user whose tokens auto-refresh in the background still has the same `last_sign_in_at` from the day they first arrived. Gating cleanup on this column reaps actively-used accounts at 30 days.
- **`auth.sessions.updated_at` looks like the right signal but isn't on its own.** Supabase prunes `auth.sessions` rows about 24 hours after the session expires. A user who was active 25 days ago and closed the tab will have *no* session row by the time the cleanup runs — and would be reaped despite being a "30-day-old" user. The activity predicate must combine session presence with a fallback like `users.created_at > now() - interval '30 days'` so freshly-created anons aren't reaped before they get a chance to come back. ([Sessions docs](https://supabase.com/docs/guides/auth/sessions))

### Edge Function pitfalls

- **`Authorization: Bearer <service_role_key>` is wrong on new API keys.** Supabase's new `sb_secret_*` keys are not JWTs; `verify_jwt = true` (the default) rejects them. Two ways forward: (a) set `verify_jwt = false` for the cleanup function in `supabase/config.toml` and gate inside the function with a shared secret read from `Deno.env`, or (b) keep `verify_jwt = true` and pass legacy HS256 service-role JWT explicitly. (a) is cleaner and forward-compatible. ([Securing Edge Functions](https://supabase.com/docs/guides/functions/auth), [API keys](https://supabase.com/docs/guides/api/api-keys))
- **`pg_net.http_post` defaults to a 2-second timeout.** Iterating `auth.admin.deleteUser()` over even 100 stale users on a cold-started Edge Function easily exceeds 2 seconds. Pass `timeout_milliseconds := 60000` explicitly; failures land in `net._http_response` (kept for 6 hours) and don't auto-retry.
- **Free-tier Edge Function limits matter.** 150 s wall clock, 2 s CPU, 256 MB memory. Deleting 1000 users serially via the admin API can approach the CPU budget. Either parallelize with `Promise.allSettled`, or cap the per-run `LIMIT` to ~200 and let weekly runs catch up.

## Recommended approach when revisiting

If/when cleanup becomes worth doing:

1. **Pattern:** `pg_cron` + `pg_net` → Edge Function (Supabase's recommended pattern for scheduled admin work).
2. **Auth model:** `verify_jwt = false` on the cleanup function; the function reads a `CLEANUP_SHARED_SECRET` env var and rejects requests that don't carry it. The cron job sends the secret. Sidesteps the legacy-vs-new key ambiguity.
3. **Activity predicate:** `is_anonymous = true AND no recent session AND created_at < now() - interval '30 days'`. Both conditions are required so newly-created anons with no session yet aren't reaped.
4. **Permission grants** in the cleanup migration:
   - `grant delete on public.decks, public.cards to supabase_auth_admin;` (cascade path)
   - `grant select on vault.decrypted_secrets to postgres;` if Vault is used (or skip Vault)
5. **Helper function:** `public.stale_anon_user_ids()` — read-only, `SECURITY DEFINER`, default `postgres` owner, `set search_path = ''`. Returns IDs only; deletion happens in the Edge Function via `auth.admin.deleteUser()`.
6. **Concurrency:** parallelize the per-user `auth.admin.deleteUser()` calls with `Promise.allSettled`, capped at ~10 concurrent.
7. **Limits:** `LIMIT 200` per run on the helper. Schedule weekly. If volume ever justifies more, raise the LIMIT or the frequency.
8. **Observability:** the Edge Function returns a JSON summary of `{ deleted, failures }`. Check `cron.job_run_details` and `net._http_response` for the first run; subsequent runs are visible in the Edge Function logs panel.
9. **Rollout pre-flight:** verify the cascade grants by manually deleting one anon user in dev and confirming the cascade succeeds; verify the activity predicate against a known-active anon user.

## References

- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Cron + Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [pg_cron extension](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [pg_net extension](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Edge Function limits (free tier)](https://supabase.com/docs/guides/functions/limits)
- [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Sessions docs (retention)](https://supabase.com/docs/guides/auth/sessions)
- [Cascade-vs-supabase_auth_admin discussion](https://github.com/orgs/supabase/discussions/28776)
- [pg_cron → Edge Function CLI issue tracking the official pattern](https://github.com/supabase/cli/issues/4287)
