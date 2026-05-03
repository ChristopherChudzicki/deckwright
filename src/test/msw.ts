import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { MagicItemDetail, MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";
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
];

// Pass the defaults to setupServer so they survive `server.resetHandlers()`
// (which removes runtime handlers but keeps the initial set).
export const server = setupServer(...supabaseDefaultHandlers);

export const magicItemIndexHandler = (ruleset: Ruleset, body: MagicItemIndex) =>
  http.get(`https://www.dnd5eapi.co/api/${ruleset}/magic-items`, () => HttpResponse.json(body));

export const magicItemDetailHandler = (ruleset: Ruleset, slug: string, body: MagicItemDetail) => {
  const { ruleset: _ruleset, ...rest } = body as MagicItemDetail & { ruleset: Ruleset };
  return http.get(`https://www.dnd5eapi.co/api/${ruleset}/magic-items/${slug}`, () =>
    HttpResponse.json(rest),
  );
};

export const apiErrorHandler = (path: string, status: number) =>
  http.get(`https://www.dnd5eapi.co${path}`, () => new HttpResponse(null, { status }));
