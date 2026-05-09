import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import { AnnouncementProvider } from "../lib/ui/Announcement";
import { AuthCallback } from "./AuthCallback";
import { SessionContext, type SessionState } from "./useSession";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigate };
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
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: [{ id: "d1" }, { id: "d2" }], error: null }),
      }),
    } as never);
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "anon-1", is_anonymous: true } as never,
        session: {} as never,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /you already have a dnd-cards account/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /yes, import 2 decks/i })).toBeInTheDocument();
  });

  it("on import click: stashes pendingAnonImport, signs out, signInWithOAuth with stashed provider", async () => {
    setLocation({ hash: "#error_code=identity_already_exists", search: "?next=/" });
    window.localStorage.setItem("dndCards.lastProvider", "github");
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: "d1" }], error: null }) }),
    } as never);
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
    const stash = window.localStorage.getItem("dndCards.pendingAnonImport");
    expect(stash).not.toBeNull();
    expect(JSON.parse(stash as string)).toMatchObject({ anonUuid: "anon-1", importedDeckIds: [] });
    expect(signOutSpy).toHaveBeenCalled();
    expect(oauthSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: "github" }));
  });

  it("on dismiss (X / Esc): navigates without signOut or signInWithOAuth", async () => {
    setLocation({ hash: "#error_code=identity_already_exists" });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: "d1" }], error: null }) }),
    } as never);
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
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: "d1" }], error: null }) }),
    } as never);
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
    expect(window.localStorage.getItem("dndCards.pendingAnonImport")).toBeNull();
    expect(signOutSpy).toHaveBeenCalled();
    expect(oauthSpy).toHaveBeenCalled();
  });

  it("on clean success (non-anon authenticated, no error, no pending): navigates to next and clears lastProvider", async () => {
    setLocation({ search: "?next=/some/path" });
    window.localStorage.setItem("dndCards.lastProvider", "google");
    render(
      wrap(<AuthCallback />, {
        status: "authenticated",
        user: { id: "real-1", is_anonymous: false, email: "x@y.z" } as never,
        session: {} as never,
      }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/some/path" }));
    expect(window.localStorage.getItem("dndCards.lastProvider")).toBeNull();
  });

  it("when pendingAnonImport exists and session is non-anon: runs import then navigates", async () => {
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({ version: 1, anonUuid: "anon-1", importedDeckIds: [] }),
    );
    setLocation({});
    vi.spyOn(supabase, "from").mockReturnValue({
      select: () => ({
        eq: (col: string) =>
          col === "owner_id"
            ? Promise.resolve({ data: [{ id: "d1", name: "Goblins" }], error: null })
            : Promise.resolve({ data: [{ position: 0, payload: {} }], error: null }),
      }),
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
    expect(window.localStorage.getItem("dndCards.pendingAnonImport")).toBeNull();
  });
});
