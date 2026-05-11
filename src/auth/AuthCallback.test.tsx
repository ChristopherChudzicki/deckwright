import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import { AnnouncementProvider } from "../lib/ui/Announcement";
import { render, screen, waitFor } from "../test/render";
import { AuthCallback } from "./AuthCallback";
import { SessionContext, type SessionState } from "./useSession";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({
      children,
      to,
      ...rest
    }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
      <a href={to as string} {...rest}>
        {children}
      </a>
    ),
  };
});

function wrap(ui: ReactNode, session: SessionState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AnnouncementProvider>
        <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
      </AnnouncementProvider>
    </QueryClientProvider>
  );
}

let originalLocation: PropertyDescriptor | undefined;

function setLocation(opts: { hash?: string; search?: string; origin?: string }) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      ...window.location,
      origin: opts.origin ?? "http://localhost:5173",
      hash: opts.hash ?? "",
      search: opts.search ?? "",
    },
  });
}

describe("AuthCallback", () => {
  beforeEach(() => {
    originalLocation = Object.getOwnPropertyDescriptor(window, "location");
    navigate.mockClear();
    window.localStorage.clear();
  });
  afterEach(() => {
    if (originalLocation) {
      Object.defineProperty(window, "location", originalLocation);
    }
    vi.restoreAllMocks();
  });

  it("opens ImportAccountDialog when URL has error_code=identity_already_exists and user is anon with decks", async () => {
    setLocation({
      hash: "#error=invalid_request&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user",
    });
    vi.spyOn(supabase, "rpc").mockImplementation((() =>
      Promise.resolve({ data: [{ id: "d1" }, { id: "d2" }], error: null })) as never);
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /you already have a Deckwright account/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /yes, import 2 decks/i })).toBeInTheDocument();
  });

  it("on import click: stashes pendingAnonImport, signs out, signInWithOAuth with stashed provider", async () => {
    setLocation({ hash: "#error_code=identity_already_exists", search: "?next=/" });
    window.localStorage.setItem("deckwright.lastProvider", "github");
    vi.spyOn(supabase, "rpc").mockImplementation((() =>
      Promise.resolve({ data: [{ id: "d1" }], error: null })) as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    const oauthSpy = vi
      .spyOn(supabase.auth, "signInWithOAuth")
      .mockResolvedValue({ data: {}, error: null } as never);

    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /yes, import 1 deck$/i }));
    await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
    const stash = window.localStorage.getItem("deckwright.pendingAnonImport");
    expect(stash).not.toBeNull();
    expect(JSON.parse(stash as string)).toMatchObject({
      version: 2,
      anonDeckIds: ["d1"],
      importedDeckIds: [],
    });
    expect(signOutSpy).toHaveBeenCalled();
    expect(oauthSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: "github" }));
  });

  it("on import click: aborts before signOut and shows error when list_my_decks errors", async () => {
    setLocation({ hash: "#error_code=identity_already_exists" });
    const rpcSpy = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: [{ id: "d1" }], error: null } as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    const oauthSpy = vi
      .spyOn(supabase.auth, "signInWithOAuth")
      .mockResolvedValue({ data: {}, error: null } as never);

    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    const importButton = await screen.findByRole("button", { name: /yes, import 1 deck$/i });
    rpcSpy.mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    await userEvent.click(importButton);

    await waitFor(() => expect(screen.getByText(/couldn't start the import/i)).toBeInTheDocument());
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(oauthSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("deckwright.pendingAnonImport")).toBeNull();
  });

  it("on dismiss (X / Esc): navigates without signOut or signInWithOAuth", async () => {
    setLocation({ hash: "#error_code=identity_already_exists" });
    vi.spyOn(supabase, "rpc").mockImplementation((() =>
      Promise.resolve({ data: [{ id: "d1" }], error: null })) as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    const oauthSpy = vi
      .spyOn(supabase.auth, "signInWithOAuth")
      .mockResolvedValue({ data: {}, error: null } as never);

    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(oauthSpy).not.toHaveBeenCalled();
  });

  it("on skip click: signs out and signInWithOAuth, no stash", async () => {
    setLocation({ hash: "#error_code=identity_already_exists" });
    vi.spyOn(supabase, "rpc").mockImplementation((() =>
      Promise.resolve({ data: [{ id: "d1" }], error: null })) as never);
    const signOutSpy = vi
      .spyOn(supabase.auth, "signOut")
      .mockResolvedValue({ error: null } as never);
    const oauthSpy = vi
      .spyOn(supabase.auth, "signInWithOAuth")
      .mockResolvedValue({ data: {}, error: null } as never);

    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /skip — leave decks behind/i }),
    );
    expect(window.localStorage.getItem("deckwright.pendingAnonImport")).toBeNull();
    expect(signOutSpy).toHaveBeenCalled();
    expect(oauthSpy).toHaveBeenCalled();
  });

  it("on clean success (non-anon authenticated, no error, no pending): navigates to next and clears lastProvider", async () => {
    setLocation({ search: "?next=/some/path" });
    window.localStorage.setItem("deckwright.lastProvider", "google");
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "real-1", is_anonymous: false, email: "x@y.z" } as never,
        session: {} as never,
      }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/some/path" }));
    expect(window.localStorage.getItem("deckwright.lastProvider")).toBeNull();
  });

  it("when pendingAnonImport exists and session is non-anon: runs import then navigates", async () => {
    window.localStorage.setItem(
      "deckwright.pendingAnonImport",
      JSON.stringify({ version: 2, anonDeckIds: ["d1"], importedDeckIds: [] }),
    );
    setLocation({});
    vi.spyOn(supabase, "rpc").mockImplementation(((name: string) => {
      if (name === "get_public_deck") {
        return {
          maybeSingle: () => Promise.resolve({ data: { id: "d1", name: "Goblins" }, error: null }),
        };
      }
      if (name === "get_public_deck_cards") {
        return Promise.resolve({ data: [{ position: 0, payload: {} }], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }) as never);
    vi.spyOn(supabase, "from").mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "new-deck" }, error: null }),
        }),
      }),
    } as never);
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "real-1", is_anonymous: false, email: "x@y.z" } as never,
        session: {} as never,
      }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(window.localStorage.getItem("deckwright.pendingAnonImport")).toBeNull();
  });

  it("does not re-enter tryResume when session re-renders mid-import", async () => {
    // Regression for the post-OAuth-callback double-import: supabase-js can
    // fire onAuthStateChange twice back-to-back (e.g., INITIAL_SESSION then
    // SIGNED_IN). AuthProvider rebuilds the session object on each event, so
    // AuthCallback's effect re-runs. Without a guard, a second tryResume
    // races with the first and every imported deck is duplicated.
    window.localStorage.setItem(
      "deckwright.pendingAnonImport",
      JSON.stringify({ version: 2, anonDeckIds: ["d1"], importedDeckIds: [] }),
    );
    setLocation({});

    let resolveDeck: (v: { data: unknown; error: unknown }) => void = () => {};
    const deckPromise = new Promise<{ data: unknown; error: unknown }>((r) => {
      resolveDeck = r;
    });

    vi.spyOn(supabase, "rpc").mockImplementation(((name: string) => {
      if (name === "get_public_deck") {
        return { maybeSingle: () => deckPromise };
      }
      if (name === "get_public_deck_cards") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }) as never);

    const insertSpy = vi.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "new-deck" }, error: null }),
      }),
    }));
    vi.spyOn(supabase, "from").mockReturnValue({ insert: insertSpy } as never);

    const session1: SessionState = {
      status: "authenticated",
      user: { id: "real-1", is_anonymous: false, email: "x@y.z" } as never,
      session: {} as never,
    };
    const session2: SessionState = {
      status: "authenticated",
      user: { id: "real-1", is_anonymous: false, email: "x@y.z" } as never,
      session: {} as never,
    };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Tree = ({ session }: { session: SessionState }) => (
      <QueryClientProvider client={client}>
        <AnnouncementProvider>
          <SessionContext.Provider value={session}>
            <AuthCallback />
          </SessionContext.Provider>
        </AnnouncementProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(<Tree session={session1} />);
    rerender(<Tree session={session2} />);

    resolveDeck({ data: { id: "d1", name: "Goblins" }, error: null });

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
