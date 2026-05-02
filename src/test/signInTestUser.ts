import { supabase } from "../api/supabase";
import { TEST_USER_ID } from "./constants";
import { makeFakeJwt } from "./fakeJwt";

export type TestUser = { id: string; email: string };

const DEFAULT_USER: TestUser = {
  id: TEST_USER_ID,
  email: "alice@test.invalid",
};

/**
 * Installs a fake authenticated session into the supabase-js client so
 * `useSession()` returns "authenticated" and RLS-aware code paths execute.
 *
 * Implementation note: supabase-js's `setSession` calls `_getUser(access_token)`
 * when the JWT's `exp` is in the future, which hits GET /auth/v1/user. The
 * baseline handler in msw.ts answers that endpoint with the default test user.
 * To impersonate a different user, register a per-test override before calling
 * this helper:
 *
 *   server.use(http.get(`${SB_URL}/auth/v1/user`, () => HttpResponse.json({...})));
 */
export async function signInTestUser(user: TestUser = DEFAULT_USER): Promise<TestUser> {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = makeFakeJwt({
    sub: user.id,
    exp: now + 3600,
    iat: now,
    role: "authenticated",
    aud: "authenticated",
    email: user.email,
  });
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: "fake-refresh-token",
  });
  if (error) throw error;
  return user;
}

export async function signOutTestUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
