import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { SB_URL, TEST_USER_ID } from "./constants";

export { SB_URL };

const TEST_USER_DEFAULT = {
  id: TEST_USER_ID,
  email: "alice@test.invalid",
};

// Default empty/echo responses for Supabase endpoints we rely on.
// Tests override with `server.use(...)` for specific assertions.
// PATCH responses echo the request body — tests asserting on full-row
// shape (timestamps, owner_id, etc.) should register a per-test override.
// Auth /user is needed by signInTestUser → setSession → _getUser.
export const supabaseDefaultHandlers = [
  http.get(`${SB_URL}/rest/v1/decks`, () => HttpResponse.json([])),
  http.get(`${SB_URL}/rest/v1/cards`, () => HttpResponse.json([])),
  http.post(`${SB_URL}/rest/v1/decks`, async ({ request }) => {
    const body = (await request.json()) as Array<Record<string, unknown>> | Record<string, unknown>;
    const arr = Array.isArray(body) ? body : [body];
    return HttpResponse.json(arr, { status: 201 });
  }),
  http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
    const body = (await request.json()) as Array<Record<string, unknown>> | Record<string, unknown>;
    const arr = Array.isArray(body) ? body : [body];
    return HttpResponse.json(arr, { status: 201 });
  }),
  http.patch(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json([body]);
  }),
  http.patch(`${SB_URL}/rest/v1/decks`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json([body]);
  }),
  http.delete(`${SB_URL}/rest/v1/decks`, () => HttpResponse.json([])),
  http.delete(`${SB_URL}/rest/v1/cards`, () => HttpResponse.json([])),
  http.get(`${SB_URL}/auth/v1/user`, () => {
    const now = new Date().toISOString();
    return HttpResponse.json({
      id: TEST_USER_DEFAULT.id,
      aud: "authenticated",
      role: "authenticated",
      email: TEST_USER_DEFAULT.email,
      app_metadata: {},
      user_metadata: {},
      created_at: now,
      updated_at: now,
    });
  }),
  http.post(`${SB_URL}/auth/v1/logout`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${SB_URL}/auth/v1/user/identities/authorize`, () =>
    HttpResponse.json({ url: "https://example.com/oauth", provider: "google" }),
  ),
  http.post(`${SB_URL}/auth/v1/signup`, async ({ request }) => {
    // The Supabase client calls /signup with no email/password for
    // signInAnonymously(); we only mock that anon-signup case here.
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.email || body.password) {
      return new HttpResponse("only anon signup mocked", { status: 400 });
    }
    return HttpResponse.json({
      access_token: "fake-anon-jwt",
      refresh_token: "fake-anon-refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: { id: "anon-test-id", is_anonymous: true, email: null },
    });
  }),
];

// Pass the defaults to setupServer so they survive `server.resetHandlers()`
// (which removes runtime handlers but keeps the initial set).
export const server = setupServer(...supabaseDefaultHandlers);
