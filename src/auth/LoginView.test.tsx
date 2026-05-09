import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import { AnnouncementProvider } from "../lib/ui/Announcement";
import { SB_URL, server } from "../test/msw";
import { LoginView } from "./LoginView";
import { SessionContext, type SessionState } from "./useSession";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

function wrap(ui: ReactNode, session?: SessionState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const inner = session ? (
    <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
  ) : (
    ui
  );
  return (
    <QueryClientProvider client={client}>
      <AnnouncementProvider>{inner}</AnnouncementProvider>
    </QueryClientProvider>
  );
}

describe("LoginView", () => {
  it("calls signInWithOAuth with google when the Google button is clicked", async () => {
    vi.stubEnv("VITE_AUTH_GOOGLE_ENABLED", "true");
    const spy = vi
      .spyOn(supabase.auth, "signInWithOAuth")
      .mockResolvedValue({ data: { provider: "google", url: "https://x" }, error: null });
    render(wrap(<LoginView />));
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", options: expect.any(Object) }),
    );
    vi.unstubAllEnvs();
  });

  it("calls signInWithOAuth with github when the GitHub button is clicked", async () => {
    vi.stubEnv("VITE_AUTH_GITHUB_ENABLED", "true");
    const spy = vi
      .spyOn(supabase.auth, "signInWithOAuth")
      .mockResolvedValue({ data: { provider: "github", url: "https://x" }, error: null });
    render(wrap(<LoginView />));
    await userEvent.click(screen.getByRole("button", { name: /sign in with github/i }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ provider: "github" }));
    vi.unstubAllEnvs();
  });

  it("hides Google and GitHub buttons when their env vars are unset", () => {
    render(wrap(<LoginView />));
    expect(screen.queryByRole("button", { name: /sign in with google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in with github/i })).not.toBeInTheDocument();
  });

  it("shows a dev sign-in button in dev mode that signs in as the dev user and navigates", async () => {
    vi.stubEnv("DEV", true);
    navigate.mockClear();
    const signInSpy = vi
      .spyOn(supabase.auth, "signInWithPassword")
      .mockResolvedValue({ data: { session: null, user: null }, error: null } as never);
    render(wrap(<LoginView />));
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));
    expect(signInSpy).toHaveBeenCalledWith({ email: "dev@local", password: "devpass" });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    vi.unstubAllEnvs();
  });

  it("falls back to signUp if the dev user doesn't exist yet", async () => {
    vi.stubEnv("DEV", true);
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" } as never,
    } as never);
    const signUpSpy = vi
      .spyOn(supabase.auth, "signUp")
      .mockResolvedValue({ data: { session: null, user: null }, error: null } as never);
    render(wrap(<LoginView />));
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));
    expect(signUpSpy).toHaveBeenCalledWith({ email: "dev@local", password: "devpass" });
    vi.unstubAllEnvs();
  });

  it("does NOT show the dev sign-in button outside dev mode", () => {
    vi.stubEnv("DEV", false);
    render(wrap(<LoginView />));
    expect(screen.queryByRole("button", { name: /sign in as dev user/i })).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("ignores a rapid second click after the first OAuth click", async () => {
    vi.stubEnv("VITE_AUTH_GOOGLE_ENABLED", "true");
    let resolveOAuth: (value: unknown) => void = () => {};
    const oauthPromise = new Promise((resolve) => {
      resolveOAuth = resolve;
    });
    const spy = vi.spyOn(supabase.auth, "signInWithOAuth").mockReturnValue(oauthPromise as never);
    render(wrap(<LoginView />));
    const button = screen.getByRole("button", { name: /sign in with google/i });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(spy).toHaveBeenCalledTimes(1);
    resolveOAuth({ data: { provider: "google", url: "https://x" }, error: null });
    vi.unstubAllEnvs();
  });
});

describe("LoginView OAuth branching", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
    vi.stubEnv("VITE_AUTH_GOOGLE_ENABLED", "true");
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("calls linkIdentity (and stashes lastProvider) when user is anonymous and has decks", async () => {
    const linkSpy = vi.spyOn(supabase.auth, "linkIdentity").mockResolvedValue({
      data: { provider: "google", url: "https://example.com" },
      error: null,
    } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: "https://example.com" },
      error: null,
    } as never);

    server.use(
      http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () =>
        HttpResponse.json([{ id: "d1", name: "Goblins" }]),
      ),
    );

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() =>
      expect(linkSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" })),
    );
    expect(oauthSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("dndCards.lastProvider")).toBe("google");
  });

  it("calls signInWithOAuth when user is anonymous with zero decks", async () => {
    const linkSpy = vi
      .spyOn(supabase.auth, "linkIdentity")
      .mockResolvedValue({ data: {}, error: null } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: "https://example.com" },
      error: null,
    } as never);
    server.use(http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([])));

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() =>
      expect(oauthSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" })),
    );
    expect(linkSpy).not.toHaveBeenCalled();
  });

  it("calls signInWithOAuth when user is unauthenticated", async () => {
    const linkSpy = vi
      .spyOn(supabase.auth, "linkIdentity")
      .mockResolvedValue({ data: {}, error: null } as never);
    const oauthSpy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: "https://example.com" },
      error: null,
    } as never);

    render(wrap(<LoginView />, { status: "unauthenticated", user: null, session: null }));
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(oauthSpy).toHaveBeenCalled());
    expect(linkSpy).not.toHaveBeenCalled();
  });
});

describe("LoginView dev path conflict", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
    window.localStorage.clear();
    navigate.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("opens ImportAccountDialog when anon dev sign-in hits an email conflict and anon has decks", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: { message: "email already exists" },
    } as never);
    server.use(
      http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () =>
        HttpResponse.json([{ id: "d1" }, { id: "d2" }, { id: "d3" }]),
      ),
    );

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /you already have a dnd-cards account/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /yes, import 3 decks/i })).toBeInTheDocument();
  });

  it("on import: aborts before signOut when list_my_decks errors on the prefetch", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: { message: "email already exists" },
    } as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    // First call (the deck-count check that opens the dialog) succeeds;
    // second call (the prefetch in onImportConfirm) fails.
    let callCount = 0;
    server.use(
      http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () => {
        callCount += 1;
        if (callCount === 1) return HttpResponse.json([{ id: "d1" }]);
        return new HttpResponse(null, { status: 500 });
      }),
    );

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));
    await userEvent.click(await screen.findByRole("button", { name: /yes, import 1 deck$/i }));

    // The dialog closes and pending resets, so the sign-in button is enabled again.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sign in as dev user/i })).not.toBeDisabled(),
    );
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(callCount).toBe(2);
  });

  it("on import: stashes pending, signs out, signs in to existing dev account, and navigates", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: { message: "email already exists" },
    } as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "dev-1" }, session: {} },
      error: null,
    } as never);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    server.use(
      http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([{ id: "d1" }])),
    );

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));
    await userEvent.click(await screen.findByRole("button", { name: /yes, import 1 deck$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(setItemSpy).toHaveBeenCalledWith(
      "dndCards.pendingAnonImport",
      expect.stringContaining('"anonDeckIds":["d1"]'),
    );
    expect(signOutSpy).toHaveBeenCalled();
    expect(signInSpy).toHaveBeenCalledWith({ email: "dev@local", password: "devpass" });
  });

  it("on skip: clears pending, signs out, signs in to existing dev account, and navigates", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: { message: "email already exists" },
    } as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    const signInSpy = vi
      .spyOn(supabase.auth, "signInWithPassword")
      .mockResolvedValue({ data: { user: { id: "dev-1" }, session: {} }, error: null } as never);
    server.use(
      http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([{ id: "d1" }])),
    );
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({ version: 1, anonUuid: "anon-old", importedDeckIds: [] }),
    );

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: /skip — leave decks behind/i }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(window.localStorage.getItem("dndCards.pendingAnonImport")).toBeNull();
    expect(signOutSpy).toHaveBeenCalled();
    expect(signInSpy).toHaveBeenCalledWith({ email: "dev@local", password: "devpass" });
  });

  it("on dismiss: closes the dialog without signOut or signInWithPassword", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: { message: "email already exists" },
    } as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    const signInSpy = vi
      .spyOn(supabase.auth, "signInWithPassword")
      .mockResolvedValue({ data: { user: { id: "dev-1" }, session: {} }, error: null } as never);
    server.use(
      http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([{ id: "d1" }])),
    );

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: /you already have a dnd-cards account/i }),
      ).not.toBeInTheDocument(),
    );
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(signInSpy).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls through silently when anon dev sign-in conflicts but anon has no decks", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: { message: "email already exists" },
    } as never);
    const signInSpy = vi
      .spyOn(supabase.auth, "signInWithPassword")
      .mockResolvedValue({ data: { user: { id: "dev-1" }, session: {} }, error: null } as never);
    server.use(http.post(`${SB_URL}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([])));

    render(
      wrap(<LoginView />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in as dev user/i }));

    await waitFor(() => expect(signInSpy).toHaveBeenCalled());
    expect(
      screen.queryByRole("heading", { name: /you already have a dnd-cards account/i }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
  });
});
