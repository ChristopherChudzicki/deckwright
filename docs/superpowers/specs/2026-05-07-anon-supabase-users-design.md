# Anonymous Supabase Users — Design Spec

**Date:** 2026-05-07
**Status:** approved (pending implementation plan)

## Summary

Let visitors use the full app — create, edit, and print decks — without signing in. Persist their work in the same Supabase database under a real `auth.users` row created via Supabase's anonymous sign-in. When they later sign in with OAuth, `linkIdentity` upgrades the same row in place; their decks are preserved without any data movement. If their OAuth identity is already linked to a different existing account, offer to clone their anon decks into it. Stale anon users are auto-reaped after 30 days.

The whole feature is gated behind a `VITE_ANON_USERS_ENABLED` env var so it can be merged dark and rolled out independently.

## Goals

- Anon users can create, edit, import, export, and print decks just like signed-in users.
- Sign-in via OAuth converts the anon account into a permanent one in place — same UUID, same `decks.owner_id`, no data movement.
- If the OAuth identity is already on a different account, offer to clone anon decks into it (resumable, survives interruptions).
- Make the local-only nature of anon work obvious so users don't lose work to a Safari ITP eviction by surprise.
- Auto-cleanup of unused anon `auth.users` rows after 30 days via `pg_cron`.
- Fully gated behind `VITE_ANON_USERS_ENABLED`; existing flows unchanged when off.

## Non-goals (v1)

- Multi-device sync of anon work. (Anon decks live on the originating browser only until the user signs in.)
- Atomic transfer of decks between accounts. The "clone into existing account" flow uses public-read SELECTs + INSERTs and is resumable but not transactional.
- Server-side Postgres functions to facilitate transfer (`SECURITY DEFINER`). Not needed because cloning is purely client-side.
- Differentiating anon from real users in RLS (e.g., capping anon to N decks). Existing policies already gate on `owner_id = auth.uid()`; anon users inherit the same constraints naturally.
- Toast/notification primitive. The first-time explainer uses an existing modal dialog.

## Hard constraints (carried forward)

1. **Existing RLS posture.** `decks_select_all` and `cards_select_all` are public reads (`using (true)`); writes gate on `owner_id = auth.uid()`. The clone flow depends on these policies; we do not change them.
2. **Existing FK cascade.** `decks.owner_id references auth.users(id) on delete cascade` and `cards.deck_id references decks(id) on delete cascade`. Reaping an anon user cascades correctly without additional FK work.
3. **Test conventions.** Fishery + faker; no unnecessary factory overrides; `signInTestUser` continues to drive existing tests.
4. **No emotion/styled-components/Tailwind.** New UI uses CSS modules + react-aria-components like the rest of the codebase.

## Architecture overview

```
Browser (Vite SPA)                               Supabase
──────────────────────────────────             ────────────────────────────
AuthProvider                                   auth.users
  ├ onAuthStateChange listener                   ├ regular users (is_anonymous = false)
  └ INITIAL_SESSION + no session + flag on  →   └ anon users   (is_anonymous = true)
       supabase.auth.signInAnonymously()       Postgres
       (status stays "loading")                  ├ decks   (RLS unchanged)
                                                 └ cards   (RLS unchanged)
UserMenu                                       pg_cron schedule
  ├ anonymous → "Sign in to save your work"      └ weekly: delete anon users
  ├ authenticated → avatar + sign-out                inactive > 30 days
  └ unauthenticated (flag off) → "Sign in" link
LoginView
  ├ anon? → linkIdentity(provider)
  └ unauthenticated? → signInWithOAuth(provider)
AuthCallback
  ├ link succeeded → toast, redirect to next
  └ link failed (identity already on another account) → import dialog
anonImport.ts
  ├ stash {anonUuid, importedDeckIds:[]} in localStorage
  ├ on next sign-in: SELECT anon decks/cards (public reads), INSERT clones
  └ resumable: append to importedDeckIds per success, clear when done
FirstDeckDialog
  └ shown once per browser via localStorage flag
```

Boundaries:

- `api/supabase.ts` remains the only module that imports `@supabase/supabase-js`.
- `auth/AuthProvider.tsx` is the only place that calls `signInAnonymously()`.
- `auth/anonImport.ts` is the only place that mutates `localStorage.pendingAnonImport`.

## Boot path: anonymous sign-in on app load

When `VITE_ANON_USERS_ENABLED === "true"` and there is no existing session, `AuthProvider` calls `signInAnonymously()` and holds the session state in `loading` until the next auth event resolves. It never transitions through `unauthenticated`.

Sketch (modify the existing `onAuthStateChange` callback):

```ts
onAuthStateChange((event, session) => {
  if (cancelled) return;
  if (session) {
    setState({ status: "authenticated", user: session.user, session });
    return;
  }
  if (event === "INITIAL_SESSION" && ANON_ENABLED) {
    void supabase.auth.signInAnonymously();
    return;  // keep status "loading"
  }
  setState({ status: "unauthenticated", user: null, session: null });
});
```

When the flag is off, behavior is identical to today: no-session boot lands in `unauthenticated`, the `HomeView` redirect (shipped in PR #47) sends them to `/login`.

## Sign-in flow

### Branching logic

Before picking the API, the LoginView checks how many decks the anon user owns:

- **0 decks** → call `signInWithOAuth({ provider })` directly. The anon row is abandoned (and reaped by cron); no link, no dialog. This handles the common returning-user-on-new-device case (where a fresh anon row exists from boot but the user hasn't done anything yet) and the brand-new-user-signing-in-immediately case.
- **≥1 decks** → call `linkIdentity({ provider })`. On the callback we know whether linking succeeded; failure routes to the dialog described below.

The deck count comes from the existing `useDecks(anonUserId)` query. Reading it from the cache or refetching at click time are both fine; for safety we'll refetch (cheap; the user is about to do an OAuth round-trip anyway).

### Happy path: linkIdentity succeeds (anon has decks, first time signing in with this provider)

User is anon with N decks. Clicks "Sign in to save your work" in the header CTA. Lands on `/login`. Clicks Google (or GitHub). Because they're anon and have decks, LoginView calls `linkIdentity({ provider })`. OAuth round-trip; on the callback their session updates: same `user.id`, `is_anonymous` is now `false`. All `decks.owner_id` references stay valid. We toast "Signed in" and navigate to `next ?? "/"`.

### Already-linked branch: linkIdentity fails (anon has decks, existing account on this provider)

If the user's OAuth identity is already attached to a different account, `linkIdentity` returns an error on the callback. We don't pin to a specific error code — any failure routes to the same dialog. The user is still anon (linking failed; session is unchanged).

Dialog copy (uses existing `DialogShell` / `DialogHeader`). The conflicting email is read from the failed-link response (Supabase exposes the OAuth identity's email even on link failure):

> **You already have a dnd-cards account**
> Looks like {email} is already signed up here. Want to bring your N decks into that account?
>
> If you skip, those decks will be left behind and deleted after 30 days. They cannot be recovered.
>
> [ **Yes, import N decks** ]   <small>Skip — leave decks behind</small>

The primary action is the styled button; "Skip" is a tertiary text-link styled to be visually de-emphasized so a hurried user can't equate it with the import action. The destructive consequence is named explicitly above the buttons.

- **Import branch:** Persist `{ anonUuid, importedDeckIds: [] }` under `localStorage.dndCards.pendingAnonImport`, then `signOut()` and `signInWithOAuth({ provider })`. After OAuth lands the user as the existing real user, `anonImport.tryResume()` runs (see invocation rules below): SELECT decks where `owner_id = anonUuid` (public read), then SELECT their cards. For each deck not already in `importedDeckIds`: INSERT a new deck owned by the current user with the same name; INSERT clones of its cards under the new deck id; append the original deck id to `importedDeckIds` and persist back to localStorage. When the list is complete, clear the key. Toast "Imported N decks."
- **Sign in without importing branch:** `signOut()` and `signInWithOAuth({ provider })`. localStorage is not touched. The anon's decks are abandoned.

In both branches of this dialog the user goes through OAuth twice (once for the failed link, once for the actual sign-in). That's unavoidable: linkIdentity needs a real OAuth round-trip to discover the conflict, and we can't reuse the failed attempt as a sign-in. The deck-count branch above keeps this 2-round-trip path confined to the case where there's actually data to merge — which is precisely when the user wants the dialog anyway.

### Cost summary

| Scenario | Round-trips | Dialog? |
|---|---|---|
| Anon with 0 decks signs in (first time or returning) | 1 | No |
| Anon with decks, first time signing in with this provider | 1 | No |
| Anon with decks, existing account already on this provider | 2 | Yes |

### `tryResume()` invocation rules

`anonImport.tryResume()` runs whenever:

1. The session transitions to `authenticated` with `!user.is_anonymous`, **and**
2. `localStorage.dndCards.pendingAnonImport` exists.

The natural call site is `AuthCallback` (before navigating to `next`), so the import runs in front of the user. For the rare case where the user closes the tab mid-import and returns days later already signed in, a secondary check from `AuthProvider` on the `authenticated` event picks up the resume. The function is idempotent (the `importedDeckIds` list prevents double-cloning) so calling it from both sites is safe.

The new decks have new UUIDs (deck and card IDs change). The original anon rows are abandoned and reaped by `pg_cron`.

### Import progress UI

While `tryResume()` is running on the AuthCallback page, the page renders an interstitial in place of its current "Signing you in…" copy:

> **Bringing your decks over**
> Imported {imported} of {total} decks…

A simple inline counter — no spinner, no progress bar primitive needed. Updates live as `importedDeckIds` grows. Navigation to `next` happens only after the counter reaches `total` and the localStorage key is cleared. The interstitial also doubles as the "Signing you in to import…" cue between the two OAuth round-trips, since the user lands on `AuthCallback` after the second OAuth completes.

If the SELECT or any INSERT fails after retry (a single in-process retry on transient errors), render a recoverable error state:

> **Couldn't finish importing your decks**
> Imported {imported} of {total}. We'll try again automatically next time you sign in.
>
> [ Retry now ]   <small>Continue without retrying</small>

The localStorage key is preserved so the next sign-in resumes from where this one stopped. "Continue" navigates to `next` without clearing the key.

### Toast on full success

`Imported N decks.` Shown once on completion of the import. If the import resumed across multiple sessions (e.g., interrupted at deck 3 of 10, completed on a later visit), the toast still says the total imported, so the user understands the import is fully done.

### OAuth failure modes

Beyond the already-linked branch, `linkIdentity` and `signInWithOAuth` can fail for several reasons. Each is handled by leaving the user in their pre-click state and surfacing a recoverable error:

- **User cancels the OAuth popup / browser back-button.** No callback fires; user is still anon on the LoginView. No state change needed; they can click again.
- **OAuth provider error (Google/GitHub down, denied consent).** Callback returns with `error_description` query param. We display "Sign-in didn't complete: {message}" on the LoginView and clear any `pendingAnonImport` key set in this attempt — we never started the import, so there's nothing to resume.
- **Network drops mid-redirect.** Same as cancellation from the user's perspective.
- **Race: anon row reaped while user is at the OAuth screen.** Possible but extremely unlikely (cron is weekly, OAuth round-trip is seconds). If `tryResume()` SELECTs the anon's decks and gets zero rows, we treat it as already-imported (clear the key, no toast). The user lands signed-in with no anon-decks to import — the same outcome as if they had no anon decks to begin with.

### Dev sign-in path

The existing dev sign-in button does `signInWithPassword(DEV_EMAIL, DEV_PASSWORD)` and on first run does `signUp(...)`. With anon-as-default the user is already anon when they click it. The new path:

1. Try `updateUser({ email: DEV_EMAIL, password: DEV_PASSWORD })` — upgrades the anon user in place, preserving the UUID and decks.
2. On error (e.g., email already exists from a previous dev session): `signOut()` then `signInWithPassword(...)`. Decks are abandoned, same as today.

`enable_confirmations = false` in `supabase/config.toml` already lets `updateUser` complete without an email round-trip locally.

## UI changes

### Header CTA (`UserMenu.tsx`)

Branch on `session.user.is_anonymous`:

- **Anonymous** → render an accent-colored pill button labeled "Sign in to save your work" that links to `/login`. This replaces the avatar/menu when anon. No sign-out option; the only way out of anon is to convert.
- **Authenticated (real)** → existing avatar + sign-out menu, unchanged.
- **Unauthenticated** (flag off) → existing "Sign in" link, unchanged.

The pill button styling should be visually clearly an action — not a text link. Reuse `Button.module.css` accent variant or extend `UserMenu.module.css`.

### First-create explainer dialog

When an anon user creates their first deck, open a modal explainer once per browser. Subsequent deck creates are silent.

Component: new `src/views/FirstDeckDialog.tsx` (or co-located in `HomeView`) using `DialogShell` + `DialogHeader`.

Trigger: in `HomeView.handleCreate` (and `handleImport`), after the deck is created, check if `session.user.is_anonymous` is true and `localStorage.dndCards.firstDeckExplainerSeen` is unset. If both, open the dialog and set the flag.

Copy:

> **Your decks live on this browser**
> You're not signed in, so your new deck only exists here on this device — not on your phone, your other laptop, or anywhere else. Sign in any time to save your decks to your account, where you can access them from any device.
>
> Otherwise, your decks may be lost if you clear browsing data, switch browsers, or don't visit for 30 days.
>
> [ **Sign in now** ]   <small>Not yet</small>

The primary action is "Sign in now" (links to `/login`). "Not yet" is a tertiary text link that dismisses. Visual weight reflects intent: this is a conversion moment, not a 50/50 choice. Once dismissed, the dialog never reappears for that browser; the header CTA is the only ongoing prompt.

### LoginView copy

When the current user is anon, the page heading and copy shift from "Sign in to create and edit decks" to "Save your work to your account." OAuth buttons stay visually identical; the underlying handler picks `linkIdentity` vs `signInWithOAuth` based on session state.

### Accessibility

- All dialogs (`FirstDeckDialog`, the import dialog) use the existing `DialogShell` + `DialogHeader`, which are built on react-aria-components and handle modal focus trap, escape-to-dismiss, and labelled-by relationships out of the box.
- The header CTA pill is a `<Link to="/login">` styled as a button. It carries an explicit text label ("Sign in to save your work") so it reads correctly to screen readers without an `aria-label` override.
- The import progress interstitial on `AuthCallback` uses an `aria-live="polite"` region so the counter updates are announced as the import progresses.
- After dialog dismissal, focus returns to the originating control (the "Sign in" CTA for the import dialog; the deck list for the first-create dialog). `DialogShell` handles this by default; verify in tests.

## Database changes

### `supabase/config.toml`

```toml
[auth]
enable_anonymous_sign_ins = true
```

A corresponding toggle in the Supabase dashboard for prod.

### Migration: anonymous-user cleanup

New migration `supabase/migrations/<timestamp>_anon_user_cleanup.sql`:

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'delete-stale-anon-users',
  '0 3 * * 0',  -- Sundays 03:00 UTC
  $$
    delete from auth.users
    where is_anonymous = true
      and last_sign_in_at < now() - interval '30 days'
  $$
);
```

`decks.owner_id` already has `on delete cascade`, so deleting the user cascades to decks → cards.

### RLS

No changes. Existing policies (`decks_select_all`, `cards_select_all`, `_insert_owner`/`_update_owner`/`_delete_owner` gated on `owner_id = auth.uid()`) work unchanged for anon users because `auth.uid()` returns the anon's real UUID.

## Env var: `VITE_ANON_USERS_ENABLED`

- Type: `"true"` | unset (treated as off)
- Default: unset
- Read by: `AuthProvider` (gates `signInAnonymously()` on boot), `UserMenu` (branches CTA copy on `is_anonymous`), `LoginView` (chooses `linkIdentity` vs `signInWithOAuth`)
- Tests: unset by default, so existing tests continue to pass; new tests stub `import.meta.env.VITE_ANON_USERS_ENABLED = "true"` per-test.

## Files affected

| File | Change |
|---|---|
| `src/auth/AuthProvider.tsx` | Modify `INITIAL_SESSION` handler to call `signInAnonymously()` and stay loading |
| `src/auth/AuthProvider.test.tsx` | New cases for the flag-on path |
| `src/lib/ui/UserMenu.tsx` | Branch on `is_anonymous` for the CTA pill |
| `src/lib/ui/UserMenu.module.css` | Pill button styling (or reuse `Button` accent variant) |
| `src/lib/ui/UserMenu.test.tsx` | New cases for anon CTA |
| `src/auth/LoginView.tsx` | OAuth buttons branch on anon deck count: 0 → `signInWithOAuth`; ≥1 → `linkIdentity`. Dev path uses `updateUser` |
| `src/auth/LoginView.test.tsx` | New cases for the link path |
| `src/auth/AuthCallback.tsx` | Detect `linkIdentity` failure; open import dialog |
| `src/auth/AuthCallback.test.tsx` | New cases for the failure path and dialog |
| `src/auth/anonImport.ts` (new) | Pure module: stash, resume, clear `pendingAnonImport` |
| `src/auth/anonImport.test.ts` (new) | Unit tests including resumable interruption |
| `src/views/FirstDeckDialog.tsx` (new) | Modal explainer using `DialogShell` |
| `src/views/FirstDeckDialog.test.tsx` (new) | First-create-only behavior |
| `src/views/HomeView.tsx` | Trigger first-create dialog on first deck create as anon |
| `src/views/HomeView.test.tsx` | New cases for the anon-create dialog and resume |
| `supabase/config.toml` | `enable_anonymous_sign_ins = true` |
| `supabase/migrations/<ts>_anon_user_cleanup.sql` (new) | `pg_cron` schedule |

## Testing strategy

- All existing tests remain green with the flag off (the default in test env).
- New behavior gated by stubbing `import.meta.env.VITE_ANON_USERS_ENABLED = "true"` within the relevant tests.
- Coverage:
  - `AuthProvider`: with flag on, no session → calls `signInAnonymously`; status never `unauthenticated`.
  - `UserMenu`: anon → CTA pill; authenticated → avatar/menu; unauthenticated → existing "Sign in" link.
  - `LoginView`: OAuth click as anon with decks → `linkIdentity`; as anon with no decks → `signInWithOAuth`; as unauthenticated → `signInWithOAuth`. Dev click as anon → `updateUser`.
  - `AuthCallback`: linkIdentity failure → opens import dialog; partial-import failure → renders recoverable error state with retry button; OAuth provider error → renders recoverable message.
  - `anonImport`: happy clone, resumable clone (pre-existing partial state), cleared key on full success.
  - `FirstDeckDialog`: opens on first create; suppressed when flag set.
  - `HomeView`: integrates the dialog and resume call without breaking existing flows.

## Open verification items (deferred to implementation)

- Exact error code/message returned by `linkIdentity` when the OAuth identity is on a different account. Implementation will catch any error and route to the dialog rather than match a specific code; revisit if the error is also raised in benign cases.
- `INITIAL_SESSION` event ordering when we synchronously call `signInAnonymously()` from inside the listener. Acceptable fallback: call `signInAnonymously()` from a `useEffect` after subscribe rather than inside the listener body.
- `updateUser({ email, password })` on an anon user under local config (`enable_confirmations = false`). Expected to complete without email confirmation; verify on first manual run.

## Rollout

1. Land the feature behind the flag (default off). All existing tests pass.
2. Manual smoke locally with `VITE_ANON_USERS_ENABLED=true`:
   - Boot fresh: anon sign-in, create deck, see first-create dialog.
   - Sign in via Google → verify same UUID, decks attached.
   - Repeat with a Google identity already on another account → verify import dialog and resumable clone.
3. Flip `enable_anonymous_sign_ins = true` in the Supabase dashboard for prod.
4. Set `VITE_ANON_USERS_ENABLED=true` in the prod build env (Vercel).
5. Verify `pg_cron` schedule landed and runs once before relying on it.

## Out of scope follow-ups

- "Clear my work" action for anon users who want to reset (e.g., sharing a device).
- Per-deck "local only" badge after sign-in if a future feature lets users have a mix of synced and local decks.
- Captcha / rate limiting on anonymous sign-in if abuse becomes a concern.
- Telemetry on conversion rate (anon → real user).
