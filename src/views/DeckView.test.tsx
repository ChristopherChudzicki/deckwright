import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import { AuthProvider } from "../auth/AuthProvider";
import { makeCardRow, makePublicDeck } from "../test/factories";
import { server } from "../test/msw";
import { signInTestUser } from "../test/signInTestUser";
import { DeckView } from "./DeckView";

const SB = "http://localhost:54321";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      params: _params,
      ...rest
    }: {
      children: ReactNode;
      to?: string;
      params?: Record<string, string>;
    } & Record<string, unknown>) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("DeckView (logged-out)", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
  });

  it("renders cards but no edit/new/delete controls", async () => {
    const deck = makePublicDeck.build({ is_owner: false });
    const card = makeCardRow.build({ deck_id: deck.id });
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([card])),
    );
    render(wrap(<DeckView deckId={deck.id} />));
    await waitFor(() => expect(screen.getByText(card.payload.name)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /new card/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Delete ${card.payload.name}` }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /browse catalog/i })).not.toBeInTheDocument();
    // Print is read-only and should be available to anyone viewing the deck.
    expect(screen.getByRole("link", { name: /print/i })).toBeInTheDocument();
  });

  it("renders a not-found message when the deck doesn't exist", async () => {
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(null)));
    render(wrap(<DeckView deckId="missing" />));
    await waitFor(() =>
      expect(screen.getByText(/this deck no longer exists/i)).toBeInTheDocument(),
    );
  });
});

describe("DeckView (owner)", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
  });

  it("shows edit + delete controls and deletes a card on click", async () => {
    await signInTestUser();
    const deck = makePublicDeck.build({ is_owner: true });
    const card = makeCardRow.build({ deck_id: deck.id });
    const onDelete = vi.fn();
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([card])),
      http.delete(`${SB}/rest/v1/cards`, () => {
        onDelete();
        return HttpResponse.json([]);
      }),
    );
    render(wrap(<DeckView deckId={deck.id} />));
    const del = await screen.findByRole("button", { name: `Delete ${card.payload.name}` });
    await userEvent.click(del);
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: /new card/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /browse catalog/i })).toBeInTheDocument();
  });
});
