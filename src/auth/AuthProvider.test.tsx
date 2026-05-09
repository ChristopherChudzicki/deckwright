import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import { SB_URL, server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
import { AuthProvider } from "./AuthProvider";
import { useSession } from "./useSession";

function ShowSession() {
  const { user, status } = useSession();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user-id">{user?.id ?? "anon"}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
  });

  it("resolves to 'unauthenticated' when no session is present", async () => {
    render(
      <AuthProvider>
        <ShowSession />
      </AuthProvider>,
    );
    // Synchronously: the provider initializes to "loading" before the
    // listener fires INITIAL_SESSION.
    expect(screen.getByTestId("status").textContent).toBe("loading");
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    });
    expect(screen.getByTestId("user-id").textContent).toBe("anon");
  });
});

describe("AuthProvider with anon flag on", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls signInAnonymously and transitions to authenticated, never unauthenticated", async () => {
    const spy = vi.spyOn(supabase.auth, "signInAnonymously");
    render(
      <AuthProvider>
        <ShowSession />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("loading");
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
    });
  });

  it("falls back to 'unauthenticated' when signInAnonymously fails", async () => {
    server.use(
      http.post(
        `${SB_URL}/auth/v1/signup`,
        () =>
          new HttpResponse(JSON.stringify({ msg: "anonymous sign-ins are disabled" }), {
            status: 422,
          }),
      ),
    );
    render(
      <AuthProvider>
        <ShowSession />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    });
  });
});
