# Anonymous Supabase Users — Design Spec

**Date:** 2026-05-07
**Status:** approved (pending implementation plan)

## Summary

Let visitors use the full app — create, edit, and print decks — without signing in. Persist their work in the same Supabase database under a real `auth.users` row created via Supabase's anonymous sign-in. When they later sign in with OAuth, `linkIdentity` upgrades the same row in place; their decks are preserved without any data movement. If their OAuth identity is already linked to a different existing account, offer to clone their anon decks into it.

The whole feature is gated behind a `VITE_ANON_USERS_ENABLED` env var so it can be merged dark and rolled out independently.

## Goals

- Anon users can create, edit, import, export, and print decks just like signed-in users.
- Sign-in via OAuth converts the anon account into a permanent one in place — same UUID, same `decks.owner_id`, no data movement.
- If the OAuth identity is already on a different account, offer to clone anon decks into it (resumable, survives interruptions).
- Make the local-only nature of anon work obvious so users don't lose work to a Safari ITP eviction by surprise.
- Fully gated behind `VITE_ANON_USERS_ENABLED`; existing flows unchanged when off.

## Non-goals (v1)

- Multi-device sync of anon work. (Anon decks live on the originating browser only until the user signs in.)
- Atomic transfer of decks between accounts. The "clone into existing account" flow uses public-read SELECTs + INSERTs and is resumable but not transactional.
- Server-side Postgres functions to facilitate transfer (`SECURITY DEFINER`). Not needed because cloning is purely client-side.
- Differentiating anon from real users in RLS (e.g., capping anon to N decks). Existing policies already gate on `owner_id = auth.uid()`; anon users inherit the same constraints naturally.
- **Auto-cleanup of stale anon `auth.users` rows.** Scoping the cleanup turned up a long tail of correctness and operational issues for what is essentially hygiene work; deferred until accumulation is observed to matter. Research notes preserved at [`docs/superpowers/handoffs/2026-05-08-anon-user-cleanup-notes.md`](../handoffs/2026-05-08-anon-user-cleanup-notes.md) for whoever revisits.

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
UserMenu
  ├ anonymous → "Sign in to save your work"
  ├ authenticated → avatar + sign-out
  └ unauthenticated (flag off) → "Sign in" link
LoginView
  ├ anon with decks? → linkIdentity(provider)
  ├ anon with 0 decks? → signInWithOAuth(provider)
  └ unauthenticated? → signInWithOAuth(provider)
AuthCallback
  ├ link succeeded → Announcement "Signed in", redirect to next
  ├ link failed (identity already on another account) → import dialog
  └ pendingAnonImport present → import progress, then redirect
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

- **0 decks** → call `signInWithOAuth({ provider })` directly. The anon row is abandoned (cleanup is deferred — see Non-goals); no link, no dialog. This handles the common returning-user-on-new-device case (where a fresh anon row exists from boot but the user hasn't done anything yet) and the brand-new-user-signing-in-immediately case.
- **≥1 decks** → call `linkIdentity({ provider })`. On the callback we know whether linking succeeded; failure routes to the dialog described below.

The deck count is fetched on **OAuth button click**, not on LoginView mount, to avoid an unnecessary query when the user simply navigated to `/login`. We use the existing `useDecks(anonUserId)` infrastructure but trigger via `queryClient.fetchQuery` from the click handler so the OAuth redirect doesn't fire until we know the count.

### Happy path: linkIdentity succeeds (anon has decks, first time signing in with this provider)

User is anon with N decks. Clicks "Sign in to save your work" in the header CTA. Lands on `/login`. Clicks Google (or GitHub). Because they're anon and have decks, LoginView calls `linkIdentity({ provider })`. OAuth round-trip; on the callback their session updates: same `user.id`, `is_anonymous` is now `false`. All `decks.owner_id` references stay valid. We set a "Signed in" announcement and navigate to `next ?? "/"`.

### Already-linked branch: linkIdentity fails (anon has decks, existing account on this provider)

If the user's OAuth identity is already attached to a different account, the OAuth callback URL comes back with `error_code=identity_already_exists` and an `error_description` query/hash param. The error is **not** surfaced via `onAuthStateChange` and **not** thrown by the original `linkIdentity()` call — it lives only in the callback URL. `AuthCallback` must explicitly parse the URL to detect this case (anything other than `error_code === "identity_already_exists"` we treat as a generic OAuth failure; see "OAuth failure modes" below).

The user remains anon (linking failed; session is unchanged), so RLS continues to permit reading their decks and cards.

Dialog copy (uses existing `DialogShell` / `DialogHeader`). Note: Supabase does **not** expose the conflicting account's email in the failure response, so the dialog can't name it directly:

> **You already have a dnd-cards account**
> An account on dnd-cards is already linked to that Google identity. Want to bring your N decks into it?
>
> If you skip, those decks will be left behind and deleted after 30 days. They cannot be recovered.
>
> [ **Yes, import N decks** ]   <small>Skip — leave decks behind</small>

The primary action is the styled button; "Skip" is a tertiary text-link styled to be visually de-emphasized so a hurried user can't equate it with the import action. The destructive consequence is named explicitly above the buttons.

- **Import branch:** Persist `{ anonUuid, importedDeckIds: [] }` under `localStorage.dndCards.pendingAnonImport`, then `signOut()` and `signInWithOAuth({ provider })`. After OAuth lands the user as the existing real user, `anonImport.tryResume()` runs (see invocation rules below): SELECT decks where `owner_id = anonUuid` (public read), then SELECT their cards. For each deck not already in `importedDeckIds`: INSERT a new deck owned by the current user with the same name; INSERT clones of its cards under the new deck id; append the original deck id to `importedDeckIds` and persist back to localStorage. When the list is complete, clear the key. The user lands on `next` and sees an Announcement: "Imported N decks."
- **Sign in without importing branch:** `signOut()` and `signInWithOAuth({ provider })`. localStorage is not touched. The anon's decks are abandoned.

In both branches of this dialog the user goes through OAuth twice (once for the failed link, once for the actual sign-in). That's unavoidable: linkIdentity needs a real OAuth round-trip to discover the conflict, and we can't reuse the failed attempt as a sign-in. The deck-count branch above keeps this 2-round-trip path confined to the case where there's actually data to merge — which is precisely when the user wants the dialog anyway.

### Cost summary

| Scenario | Round-trips | Dialog? |
|---|---|---|
| Anon with 0 decks signs in (first time or returning) | 1 | No |
| Anon with decks, first time signing in with this provider | 1 | No |
| Anon with decks, existing account already on this provider | 2 | Yes |

### `tryResume()` invocation rules

`anonImport.tryResume()` runs from a single site: `AuthCallback`, before navigating to `next`. It runs whenever:

1. The current session is `authenticated` with `!user.is_anonymous`, **and**
2. `localStorage.dndCards.pendingAnonImport` exists.

If the user closes the tab mid-import, the localStorage key persists; the next time they sign in (which goes through AuthCallback again), `tryResume()` picks up where it left off. The function is idempotent: `importedDeckIds` prevents double-cloning of any deck that already succeeded.

We deliberately do **not** call `tryResume()` from a second site like `AuthProvider`. The single call site keeps reasoning simple and is sufficient because every recovery path goes through a sign-in (which routes through AuthCallback).

The new decks have new UUIDs (deck and card IDs change). The original anon rows are abandoned (and accumulate; cleanup is deferred — see Non-goals).

### Import progress UI

While `tryResume()` is running on the AuthCallback page, the page renders an interstitial in place of its current "Signing you in…" copy:

> **Bringing your decks over**
> Imported {imported} of {total} decks…

A simple inline counter — no spinner, no progress bar primitive needed. Updates live as `importedDeckIds` grows. Navigation to `next` happens only after the counter reaches `total` and the localStorage key is cleared. The interstitial also doubles as the "Signing you in to import…" cue between the two OAuth round-trips, since the user lands on `AuthCallback` after the second OAuth completes.

If the SELECT or any INSERT fails (a single in-process retry on transient errors first), render a non-blocking error message and continue navigating:

> **Couldn't finish importing your decks**
> Imported {imported} of {total}. We'll try again next time you sign in.

The localStorage key is preserved so the next sign-in resumes from where this one stopped. We don't expose a "Retry now" button — the auto-resume on next sign-in covers the same need without the extra UI surface and tests.

### Announcement on full success

The user lands on `next` (typically `/`) and sees a brief inline announcement at the top of the view: `Imported N decks.` (or `Signed in.` for the no-import path). The announcement auto-dismisses after ~5 seconds and is rendered via a small `Announcement` primitive added in this PR (see UI changes). If the import resumed across multiple sessions (e.g., interrupted at deck 3 of 10, completed on a later visit), the announcement still says the total imported.

### OAuth failure modes

Beyond the already-linked branch, `linkIdentity` and `signInWithOAuth` can fail for several reasons. Each is handled by leaving the user in their pre-click state and surfacing a recoverable error:

- **User cancels the OAuth popup / browser back-button.** No callback fires; user is still anon on the LoginView. No state change needed; they can click again.
- **OAuth provider error (Google/GitHub down, denied consent).** Callback returns with `error_description` query param. We display "Sign-in didn't complete: {message}" on the LoginView and clear any `pendingAnonImport` key set in this attempt — we never started the import, so there's nothing to resume.
- **Network drops mid-redirect.** Same as cancellation from the user's perspective.
- **Anon row missing when `tryResume()` SELECTs.** Without an automatic cleanup, this is rare in practice (only happens if someone manually deletes the user via the Supabase dashboard, or an admin bulk-deletes during maintenance), but the code still has to be defensive. If `tryResume()` SELECTs the anon's decks and gets zero rows, we treat it as already-imported (clear the key, no announcement). The user lands signed-in with no anon decks to import — the same outcome as if they had no anon decks to begin with.

### Dev sign-in path

The existing dev sign-in button does `signInWithPassword(DEV_EMAIL, DEV_PASSWORD)` and on first run does `signUp(...)`. With anon-as-default the user is already anon when they click it. The new path:

1. Call `updateUser({ email: DEV_EMAIL })`. With `enable_confirmations = false` in `supabase/config.toml`, this auto-sets `email_confirmed_at` and flips `is_anonymous` to false synchronously, preserving the UUID and decks.
2. **Then** call `updateUser({ password: DEV_PASSWORD })` as a separate call — Supabase rejects setting a password on an anonymous user before the email lands, so the two updates must be sequential, not bundled into one call.
3. On error from either step (e.g., email already exists from a previous dev session): `signOut()` then `signInWithPassword(...)`. Decks are abandoned, same as today.

The single-call path (`updateUser({ email, password })` in one go) appears to work in some Supabase versions due to a known bug; do not rely on it.

## UI changes

### Header CTA (`UserMenu.tsx`)

Branch on `session.user.is_anonymous`:

- **Anonymous** → render an accent-colored pill button labeled "Sign in to save your work" that links to `/login`. This replaces the avatar/menu when anon. No sign-out option; the only way out of anon is to convert.
- **Authenticated (real)** → existing avatar + sign-out menu, unchanged.
- **Unauthenticated** (flag off) → existing "Sign in" link, unchanged.

The pill is styled in `UserMenu.module.css` (a new `.pillCta` class). Visually clearly an action — accent fill, padded button, not a text link.

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

### Announcement primitive

A new tiny UI primitive — `src/lib/ui/Announcement.tsx` — for brief, non-blocking confirmation messages. Used on `AuthCallback`'s success interstitial and on the destination view after navigating from `next`.

Behavior:

- Renders a single message at the top of its container (above the deck list when triggered from HomeView; above the page content otherwise).
- Auto-dismisses after ~5 seconds; user can also dismiss via a small ✕ button.
- Accessible: `role="status"` with `aria-live="polite"` so the message is announced to screen readers without interrupting them.

API surface (in `Announcement.tsx`):

```ts
export function AnnouncementProvider(props: { children: ReactNode }): JSX.Element;

// Set the next announcement to render. Call from AuthCallback before navigating.
// The announcement renders the next time <Announcement /> mounts (on the destination view).
export function useSetNextAnnouncement(): (message: string | null) => void;

// Render the active announcement (if any) at this location.
// Place inside HomeView (above deck list) and inside the LoginView for auth flows that stay on /login.
export function Announcement(): JSX.Element | null;
```

State lives in a small in-memory context (no router-state coupling needed): `useSetNextAnnouncement` writes to a ref-backed slot; `<Announcement />` reads it on mount, displays it, and clears the slot. Surviving an OAuth round-trip is not needed because all current call sites set the announcement *after* the OAuth round-trip is complete (during `AuthCallback` rendering).

Scope is deliberately small — this is not a queueable toast system. One message at a time, replaced if a new one is set. If we ever need a queue or multiple stacking notifications, we revisit.

Files:
- `src/lib/ui/Announcement.tsx` (new) — the component.
- `src/lib/ui/Announcement.module.css` (new) — styles.
- `src/lib/ui/Announcement.test.tsx` (new) — render, dismiss, auto-dismiss timer, aria attributes.
- `src/lib/ui/AnnouncementContext.tsx` (new, or co-located in `Announcement.tsx`) — provider + hook for setting the next announcement across navigation.

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

### Cleanup of stale anon users — deferred

Anonymous `auth.users` rows accumulate over time. We considered a `pg_cron` + `pg_net` → Edge Function pattern to reap them, but two review rounds turned up enough Supabase-specific pitfalls (auth-key model on Edge Functions, cascade permission grants, session-retention behavior, Vault read permissions) that the cost outweighs the benefit for a hobby app where there's no current accumulation pressure.

The design we evaluated, the pitfalls we found, and the recommended approach when revisiting are captured in [`docs/superpowers/handoffs/2026-05-08-anon-user-cleanup-notes.md`](../handoffs/2026-05-08-anon-user-cleanup-notes.md). When/if accumulation becomes operationally annoying, start there.

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
| `src/lib/ui/UserMenu.module.css` | New `.pillCta` class for the accent pill button |
| `src/lib/ui/UserMenu.test.tsx` | New cases for anon CTA |
| `src/auth/LoginView.tsx` | OAuth buttons branch on anon deck count: 0 → `signInWithOAuth`; ≥1 → `linkIdentity`. Dev path uses `updateUser` |
| `src/auth/LoginView.test.tsx` | New cases for the link path |
| `src/auth/AuthCallback.tsx` | Parse callback URL hash/query for `error_code=identity_already_exists`; open import dialog. Render import progress when `pendingAnonImport` exists. |
| `src/auth/AuthCallback.test.tsx` | New cases for the failure path and dialog |
| `src/auth/anonImport.ts` (new) | Pure module exporting `stash(payload)`, `tryResume()`, `clear()`, and the `PendingAnonImport` type. Manages the `localStorage.dndCards.pendingAnonImport` key. |
| `src/auth/anonImport.test.ts` (new) | Unit tests including resumable interruption |
| `src/views/FirstDeckDialog.tsx` (new) | Modal explainer using `DialogShell` |
| `src/views/FirstDeckDialog.test.tsx` (new) | First-create-only behavior |
| `src/views/HomeView.tsx` | Trigger first-create dialog on first deck create as anon |
| `src/views/HomeView.test.tsx` | New cases for the anon-create dialog and resume |
| `src/lib/ui/Announcement.tsx` (new) | Inline non-blocking confirmation primitive |
| `src/lib/ui/Announcement.module.css` (new) | Styles for the announcement |
| `src/lib/ui/Announcement.test.tsx` (new) | Render, dismiss, auto-dismiss timer, aria-live |
| `src/test/msw.ts` | Add MSW handlers for `signInAnonymously`, `linkIdentity`, `updateUser`, and the public-read SELECTs used during clone |
| `supabase/config.toml` | `enable_anonymous_sign_ins = true` |

## Testing strategy

- All existing tests remain green with the flag off (the default in test env). One explicit baseline test asserts `AuthProvider` flag-off → `unauthenticated` so the regression contract is durable.
- New behavior gated by stubbing `import.meta.env.VITE_ANON_USERS_ENABLED = "true"` within the relevant tests.
- Coverage:
  - `AuthProvider`: flag on, no session → calls `signInAnonymously` and stays `loading` until SIGNED_IN; status never `unauthenticated`. Flag off, no session → `unauthenticated` (baseline).
  - `UserMenu`: anon → CTA pill (with text label readable to screen readers); authenticated → avatar/menu; unauthenticated → existing "Sign in" link.
  - `LoginView`: OAuth click as anon with decks → `linkIdentity`; as anon with no decks → `signInWithOAuth`; as unauthenticated → `signInWithOAuth`. Dev click as anon → two-step `updateUser` (email then password).
  - `AuthCallback`: linkIdentity failure → opens import dialog; partial-import failure → preserves pendingAnonImport for next-sign-in resume; OAuth provider error → renders recoverable message; anon row missing on resume (zero-rows SELECT) → treats as already-imported and clears the key without an announcement.
  - `anonImport`: happy clone; resumable clone (pre-existing partial state); cleared key on full success.
  - `FirstDeckDialog`: opens on first deck create as anon; suppressed once dismissed (localStorage flag set); never shown for non-anon users.
  - `Announcement`: render, programmatic dismiss, auto-dismiss timer, `role="status"` + `aria-live="polite"` attributes.
  - `HomeView`: integrates the first-create dialog and renders an Announcement passed via context after sign-in.

## Open verification items (deferred to implementation)

- Behavior of supabase-js's URL detection on a `linkIdentity` failure callback: confirm that no fake "session" event fires when the URL contains `error_code=identity_already_exists`, so AuthCallback's URL parsing is the sole source of truth for the failure branch.
- `INITIAL_SESSION` event ordering when we synchronously call `signInAnonymously()` from inside the listener. Verified safe (auth-js serializes calls via internal lock), but the slightly more idiomatic alternative is to call `signInAnonymously()` from a `useEffect` after subscribe. Either is acceptable; revisit if the listener-body call produces any odd state transitions in tests.
- `pendingAnonImport` schema versioning: include a `version: 1` field in the stashed object and have `tryResume()` ignore unknown versions. Cheap insurance against shape changes between PRs.
- `next` URL preservation across the two OAuth round-trips in the import-into-existing-account flow. The first OAuth (linkIdentity) carries `next` via `redirectTo`; on failure, when we sign out and signInWithOAuth, we need to re-set `redirectTo` so the user lands where they intended. Trivial but easy to forget.

## Rollout

1. Land the feature behind the flag (default off). All existing tests pass.
2. Manual smoke locally with `VITE_ANON_USERS_ENABLED=true`:
   - Boot fresh: anon sign-in, create deck, see first-create dialog.
   - Sign in via Google → verify same UUID, decks attached, see "Signed in" announcement.
   - Repeat with a Google identity already on another account → verify import dialog and resumable clone, see "Imported N decks" announcement.
3. Pre-flight checks before flipping prod flag:
   - Confirm Supabase Auth → URL Configuration restricts redirect URLs to the prod origin and `localhost:5173`. No wildcards.
   - Confirm Supabase Auth → Rate Limits has the default `anonymous_users` limit enabled (30/hr/IP by default).
4. Flip `enable_anonymous_sign_ins = true` in the Supabase dashboard for prod.
5. Set `VITE_ANON_USERS_ENABLED=true` in the prod build env (Vercel).

## Out of scope follow-ups

- "Clear my work" action for anon users who want to reset (e.g., sharing a device).
- Per-deck "local only" badge after sign-in if a future feature lets users have a mix of synced and local decks.
- Captcha / additional rate limiting on anonymous sign-in if abuse becomes a concern.
- Telemetry on conversion rate (anon → real user).
- **Revisit the public-read RLS posture.** `decks_select_all` and `cards_select_all` use `using (true)`, meaning any authenticated user (including anyone with an anon JWT) can SELECT any deck or card. This is pre-existing — not introduced by this PR — but the anon sign-in feature makes the exposure trivial to discover (one API call to mint an anon JWT, then enumerate). For a hobby app where decks are share-by-link by design this is probably fine, but worth a deliberate decision rather than inheriting it by accident. Track as a separate issue.

## References

- [Anonymous Sign-Ins guide](https://supabase.com/docs/guides/auth/auth-anonymous) — `signInAnonymously()` semantics, `is_anonymous` JWT claim, conversion paths.
- [Identity Linking guide](https://supabase.com/docs/guides/auth/auth-identity-linking) — `linkIdentity()` API and conceptual flow.
- [`linkIdentity` failure modes (community discussion #27061)](https://github.com/orgs/supabase/discussions/27061) — confirms that conflict detection happens server-side during the OAuth callback and is surfaced via `error_code=identity_already_exists` in the redirect URL, not via the original method's promise or `onAuthStateChange`.
- [Anonymous user `updateUser` two-step (community discussion #29017)](https://github.com/orgs/supabase/discussions/29017) — Supabase rejects setting a password on an anonymous user before email lands; updates must be sequential.
- [`updateUser` anon bug #29350](https://github.com/supabase/supabase/issues/29350) — known bug where single-call `updateUser({ email, password })` works on anon users; do not rely on it.
- [supabase-js `auth-js` source](https://github.com/supabase/auth-js) — `_acquireLock` serialization confirms calling `signInAnonymously()` from inside an `onAuthStateChange` listener body is safe but not idiomatic.

Anon-user cleanup research notes (separate doc, deferred from this spec): [`docs/superpowers/handoffs/2026-05-08-anon-user-cleanup-notes.md`](../handoffs/2026-05-08-anon-user-cleanup-notes.md).
