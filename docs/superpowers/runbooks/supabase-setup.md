# Supabase setup runbook (one-time)

This walks through everything needed to get a fresh checkout running locally and deployed to Cloudflare Workers Static Assets.

## Prerequisites

- Node 20+
- Docker Desktop (for local Supabase)
- A Cloudflare account (free tier)
- A Google Cloud project + a GitHub account (only needed if you want OAuth in production; local dev has a password-based shortcut)

## 1. Local development

The Vite dev server auto-detects the local Supabase URL + publishable key
via the `supabase-local-env` plugin (`scripts/vite-supabase-env.ts`), so
local setup is just:

```bash
npm install
npx supabase start    # boots Docker stack on first run; idempotent thereafter
npm run dev           # http://localhost:5173
```

`supabase start` prints the local URLs + auth keys; the dev plugin reads them at vite boot. You don't need to create a `.env.local` for normal dev.

`.env.local` (gitignored) is supported as an override if you want to point at a different Supabase URL or key. `.env.local.example` documents the shape.

### Local sign-in (no OAuth setup required)

The login page has a dashed-border "Sign in as Dev User" button visible only in dev mode. Clicking it:
- Tries to sign in `dev@local` / `devpass` (succeeds on subsequent runs).
- On first run, falls through to `signUp` with the same credentials. Local Supabase has `enable_confirmations = false` (set in `supabase/config.toml`), so the signup is auto-confirmed and a session is established immediately.

So OAuth provider configuration is not required for local dev.

### Useful local URLs

- App: http://localhost:5173
- Supabase API gateway: http://127.0.0.1:54321 (no root route — it's a proxy; visit `/rest/v1/decks` to see PostgREST)
- Supabase Studio (DB browser, SQL editor, auth users, etc.): http://127.0.0.1:54323
- Inbucket (local mailbox, for magic-link auth flows if used): http://127.0.0.1:54324

## 2. OAuth providers (optional for local; required for production)

If you want Google + GitHub sign-in to work locally — and you definitely want them working in production — register OAuth apps and paste credentials into `supabase/.env` (gitignored).

### Google

1. <https://console.cloud.google.com/apis/credentials>
2. Create OAuth 2.0 Client ID, type "Web application".
3. Authorized redirect URIs:
   - `http://localhost:54321/auth/v1/callback` (local)
   - `https://<cloud-project-ref>.supabase.co/auth/v1/callback` (production — add after step 3 below)
4. Copy Client ID + Secret into `supabase/.env`:

   ```
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
   ```

5. Restart `supabase start` so the new env vars take effect.

### GitHub

1. <https://github.com/settings/developers> → "OAuth Apps" → New OAuth App.
2. Authorization callback URL: `http://localhost:54321/auth/v1/callback` (add the cloud URL too after step 3).
3. Copy Client ID + generate Client Secret. Paste into `supabase/.env`:

   ```
   SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=...
   SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=...
   ```

4. Restart `supabase start`.

Smoke test: visit `/login` and click "Sign in with Google". You should land on `/` as a signed-in user.

## 3. Cloud Supabase project

1. <https://supabase.com/dashboard> → New project. Pick a region; save the database password.
2. `supabase link --project-ref <ref>` (the ref is in the project's URL).
3. `supabase db push` to apply migrations to the cloud DB.
4. Dashboard → Authentication → Providers → enable Google + GitHub. Paste the same Client ID/Secret pairs.
5. Add the cloud callback URL to your Google + GitHub OAuth apps (the URL is shown in the Supabase dashboard under each provider).
6. Run `npx supabase test db --linked` (or against a local copy) to confirm the pgTAP suite passes.

## 4. Cloudflare Workers deploy

The project is configured as a Workers Static Assets app — see `wrangler.jsonc` (declares `assets.directory` and SPA fallback) and `.nvmrc` (pins build-env Node version).

1. CF dashboard → Workers & Pages → Create → Import a repository → connect this repo. Build command: `npm run build`. Output dir: `./dist` (already in `wrangler.jsonc`).
2. **Change the deploy command** from the default `npx wrangler versions upload` to `npx wrangler deploy`. The default uploads a new version without routing traffic to it; `wrangler deploy` uploads and promotes to 100% traffic.
3. Add **Build Variables** (Settings → Build → Variables and Secrets — NOT runtime variables; those are disabled for asset-only Workers):
   - `VITE_SUPABASE_URL` — the cloud URL from the Supabase dashboard.
   - `VITE_SUPABASE_ANON_KEY` — the cloud publishable key (shown as "Publishable key" in API settings, format: `sb_publishable_*`).
   - `VITE_AUTH_GOOGLE_ENABLED` / `VITE_AUTH_GITHUB_ENABLED` — `true` for each provider you've wired up.
4. Trigger a build. After it succeeds, the worker is reachable at `<project>.<account>.workers.dev`.
5. Before testing OAuth on that URL, add `https://<project>.<account>.workers.dev/**` to Supabase → Authentication → URL Configuration → Additional Redirect URLs.
6. Custom domain: Worker → Custom domains → add the apex (e.g. `deckwright.org`). If the zone is also in your CF account, DNS wires automatically. For www → apex redirect, add a proxied CNAME `www → <apex>` in DNS, then Rules → Redirect Rules with hostname match + 301 to the apex.
7. Update Supabase Auth: set Site URL to the final domain; add `https://<apex>/**` and `https://www.<apex>/**` to Additional Redirect URLs.

## 5. Routine tasks

- Update local DB after pulling new migrations: `npx supabase db reset`
- Push new migrations to prod: `npx supabase db push`
- Run pgTAP tests against local: `npx supabase test db`
- Regenerate the JSON Schema after a Zod change: `npm run gen:schema`, then commit, then create a constraint-swap migration that drops + re-adds `cards_payload_valid` with the new schema embedded.
- Verify schema is in sync: `npm run check:schema` (CI-friendly — exits non-zero on drift).

## 6. Troubleshooting

- **`Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY`**: the dev plugin failed silently because `supabase status` errored. Run `npx supabase status` directly to see why (most often: Docker isn't running, or `supabase start` was never run).
- **`/auth/v1/callback` 404 in OAuth flow**: the redirect URI registered with the OAuth provider doesn't match. Check that both `http://localhost:54321/auth/v1/callback` and the Supabase cloud callback URL are in the provider's allowlist.
- **Studio shows tables but app says "no decks"**: verify you're signed in. Logged-out users see only public decks (which means: anyone's deck via direct URL); the deck-list page only shows your own.
- **Print page shows nothing**: PrintView is per-deck — visit `/deck/$deckId/print`, not `/print`.
