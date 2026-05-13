import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import type { DeckSearch } from "../app/router";
import { AuthProvider } from "../auth/AuthProvider";
import { makeCardRow, makeItemPayload, makePublicDeck, makeSpellPayload } from "../test/factories";
import { server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
import { signInTestUser } from "../test/signInTestUser";
import { DeckView } from "./DeckView";

const SB = "http://localhost:54321";

const navigate = vi.fn();
const useSearchMock = vi.fn<() => DeckSearch>(() => ({}));

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
    useNavigate: () => navigate,
    useSearch: () => useSearchMock(),
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
    navigate.mockClear();
    useSearchMock.mockReturnValue({});
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
    navigate.mockClear();
    useSearchMock.mockReturnValue({});
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

describe("DeckView toolbar", () => {
  beforeEach(async () => {
    navigate.mockClear();
    useSearchMock.mockReturnValue({});
    await supabase.auth.signOut();
  });

  function setupDeck(opts: { is_owner?: boolean } = {}) {
    const deck = makePublicDeck.build({ is_owner: opts.is_owner ?? true });
    const item1 = makeCardRow.build({
      deck_id: deck.id,
      payload: makeItemPayload.build({
        name: "Alpha Item",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    const item2 = makeCardRow.build({
      deck_id: deck.id,
      payload: makeItemPayload.build({
        name: "Bravo Item",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    });
    const spell1 = makeCardRow.build({
      deck_id: deck.id,
      payload: makeSpellPayload.build({
        name: "Cantrip",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    });
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () =>
        HttpResponse.json([item1, item2, spell1]),
      ),
    );
    return { deck, item1, item2, spell1 };
  }

  it("renders All/Items/Spells filter buttons with counts", async () => {
    setupDeck();
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Items (2)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Spells (1)" })).toBeInTheDocument();
  });

  it("All is selected by default; default sort is Last updated", async () => {
    setupDeck();
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeChecked();
    expect(screen.getByRole("button", { name: /sort.*last updated/i })).toBeInTheDocument();
  });

  it("default render sorts by updatedAt descending", async () => {
    const { item1, item2, spell1 } = setupDeck();
    render(wrap(<DeckView deckId="d" />));
    const rows = await screen.findAllByRole("listitem");
    const names = rows.map((li) => li.querySelector("strong")?.textContent);
    expect(names).toEqual([item2.payload.name, spell1.payload.name, item1.payload.name]);
  });

  it("mounting at kind=spell shows only spells with the Spells filter checked", async () => {
    const { spell1 } = setupDeck();
    useSearchMock.mockReturnValue({ kind: "spell" });
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "Spells (1)" })).toBeChecked();
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toContain(spell1.payload.name);
  });

  it("mounting at sort=name reorders by name", async () => {
    setupDeck();
    useSearchMock.mockReturnValue({ sort: "name" });
    render(wrap(<DeckView deckId="d" />));
    const rows = await screen.findAllByRole("listitem");
    const names = rows.map((li) => li.querySelector("strong")?.textContent);
    expect(names).toEqual(["Alpha Item", "Bravo Item", "Cantrip"]);
  });

  it("counts stay correct after filtering (counts reflect unfiltered totals)", async () => {
    setupDeck();
    useSearchMock.mockReturnValue({ kind: "item" });
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Items (2)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Spells (1)" })).toBeInTheDocument();
  });

  it("read-only deck still shows the toolbar", async () => {
    setupDeck({ is_owner: false });
    render(wrap(<DeckView deckId="d" />));
    expect(await screen.findByRole("radio", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sort.*last updated/i })).toBeInTheDocument();
  });
});
