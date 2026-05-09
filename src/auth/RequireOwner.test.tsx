import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import { AnnouncementProvider } from "../lib/ui/Announcement";
import { makePublicDeck } from "../test/factories";
import { server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
import { signInTestUser } from "../test/signInTestUser";
import { AuthProvider } from "./AuthProvider";
import { RequireOwner } from "./RequireOwner";

const SB = "http://localhost:54321";
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigate };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AnnouncementProvider>
        <AuthProvider>{ui}</AuthProvider>
      </AnnouncementProvider>
    </QueryClientProvider>
  );
}

describe("RequireOwner", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
    navigate.mockClear();
  });

  it("redirects to /login when unauthenticated", async () => {
    render(wrap(<RequireOwner deckId="d1">protected</RequireOwner>));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/login", search: { next: expect.any(String) } }),
    );
  });

  it("renders children when the session user owns the deck", async () => {
    await signInTestUser();
    const deck = makePublicDeck.build({ is_owner: true });
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)));
    render(wrap(<RequireOwner deckId={deck.id}>protected</RequireOwner>));
    await waitFor(() => expect(screen.getByText("protected")).toBeInTheDocument());
  });

  it("redirects to /deck/$deckId (read-only) when authenticated but not the owner", async () => {
    await signInTestUser();
    const deck = makePublicDeck.build({ is_owner: false });
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)));
    render(wrap(<RequireOwner deckId={deck.id}>protected</RequireOwner>));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/deck/$deckId", params: { deckId: deck.id } }),
    );
  });
});
