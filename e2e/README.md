# E2E Tests

Playwright specs live here. The app is stubbed — no real Supabase instance is needed.

## Running

```
npm run test:e2e          # headless
npm run test:e2e:ui       # Playwright GUI runner (useful for debugging)
```

## How it works

`seedDeck` in `fixtures.ts` sets up a fake authenticated session and stubs Supabase network calls so specs run against a predictable data set. There are four non-obvious facts that will trip up a debugger:

1. **Auth storage key is `sb-localhost-auth-token`.**
   supabase-js derives the key from the Supabase URL hostname (`localhost`). If `VITE_SUPABASE_URL` changes, the key must change too. See `AUTH_STORAGE_KEY` in `fixtures.ts`.

2. **`exp` must be in the future.**
   When supabase-js reads a session and the token is expired, it fires `_callRefreshToken`, which hits `/auth/v1/token`. That endpoint is not stubbed. `seedDeck` sets `exp` to `now + 3600` — don't reduce this.

3. **Fake signature is fine.**
   supabase-js does not verify JWT signatures when reading sessions from storage. It only base64-decodes the payload. `makeFakeJwt` in `src/test/fakeJwt.ts` exploits this.

4. **`playwright.config.ts` sets `webServer.env` for the Supabase vars.**
   `src/api/supabase.ts` throws at module-evaluation time when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing. The config injects dummy values so Vite starts cleanly; the actual network calls are intercepted by `page.route()` anyway.

## Diagnosing failures

If your spec fails immediately after `seedDeck`, check in order:

- **(a) Auth storage key mismatch.** Log `localStorage.getItem("sb-localhost-auth-token")` in the browser — if it's null, the key is wrong.
- **(b) Token is expired.** Log `exp` from the decoded payload; it must be greater than `Date.now() / 1000`.
- **(c) Unexpected auth endpoint.** The route handler throws on any `/auth/v1/**` URL other than `/auth/v1/user`. Look for `ERR_FAILED` on a token-refresh or logout URL in the Playwright network trace.
- **(d) Non-GET on a data endpoint.** The route handlers for `/rest/v1/decks*` and `/rest/v1/cards*` abort and throw on any method other than GET. This surfaces as `ERR_FAILED` on a POST/PATCH/DELETE in the trace.

## Extending `seedDeck`

### Why `seedDeck` couples auth + data

Currently `seedDeck` injects an authenticated session AND seeds deck/card rows in
one call. No spec needs unauthenticated state today. If a future spec needs to
verify the redirect-to-login path or anonymous browsing, split into a separate
`signInAs(page, user?)` helper at that point — don't pre-emptively over-shape
the API.

`seedDeck` mocks reads only. The `/rest/v1/decks*` and `/rest/v1/cards*` handlers currently abort non-GET requests loudly so write-path specs fail at the right place.

To add write support, update the relevant route handler in `fixtures.ts`:

```ts
await page.route(`${SB_URL}/rest/v1/cards*`, (route) => {
  const method = route.request().method();
  if (method === "GET") { route.fulfill({ json: cardRows }); return; }
  if (method === "POST") {
    // echo body back, or maintain in-memory state for subsequent GETs
    route.fulfill({ status: 201, json: /* parsed request body */ [] });
    return;
  }
  route.abort("failed");
  throw new Error(`e2e fixture: unsupported ${method} on /rest/v1/cards.`);
});
```

For stateful specs (e.g., create then read back), keep an in-memory array outside the handler and mutate it on write, then return it on GET.

## When to use real local Supabase instead

If a spec needs to verify RLS policies, multi-user interactions, or anything the mock would have to fake-PostgREST around, run against a real local Supabase instance (`npx supabase start`) instead. The mock is faster and zero-infra for pure UI behavior — reach for real Supabase when the test is fundamentally about the database.
