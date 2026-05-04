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

const documentKey = (ruleset: Ruleset): string => (ruleset === "2024" ? "srd-2024" : "srd-2014");

export const magicItemIndexHandler = (ruleset: Ruleset, body: MagicItemIndex) =>
  http.get(`https://api.open5e.com/v2/magicitems/`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("document") !== documentKey(ruleset)) {
      return;
    }
    return HttpResponse.json({
      count: body.count,
      next: null,
      previous: null,
      results: body.results.map((r) => ({
        ...r,
        desc: "",
        category: { name: "" },
        rarity: { name: "" },
        requires_attunement: false,
        attunement_detail: null,
      })),
    });
  });

export const magicItemDetailHandler = (
  _ruleset: Ruleset,
  key: string,
  body: MagicItemDetail,
) => {
  const { ruleset: _r, ...rest } = body;
  return http.get(`https://api.open5e.com/v2/magicitems/${key}/`, () => HttpResponse.json(rest));
};

export const apiErrorHandler = (path: string, status: number) =>
  http.get(`https://api.open5e.com${path}`, () => new HttpResponse(null, { status }));
