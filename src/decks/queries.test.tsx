import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { makeCardRow, makeDeckSummary, makePublicDeck } from "../test/factories";
import { server } from "../test/msw";
import { renderHook, waitFor } from "../test/render";
import { useDeck, useDeckCards, useDecks } from "./queries";

const SB = "http://localhost:54321";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useDecks", () => {
  it("returns the user's decks via list_my_decks RPC", async () => {
    const decks = [makeDeckSummary.build(), makeDeckSummary.build()];
    server.use(http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json(decks)));
    const { result } = renderHook(() => useDecks(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(decks);
  });
});

describe("useDeck", () => {
  it("returns a PublicDeck via get_public_deck RPC", async () => {
    const deck = makePublicDeck.build({ is_owner: true });
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)));
    const { result } = renderHook(() => useDeck(deck.id), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(deck);
  });

  it("returns null when the deck doesn't exist", async () => {
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(null)));
    const { result } = renderHook(() => useDeck("missing"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useDeckCards", () => {
  it("returns cards for a deck via get_public_deck_cards RPC", async () => {
    const [firstRow, secondRow] = [makeCardRow.build(), makeCardRow.build()];
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () =>
        HttpResponse.json([firstRow, secondRow]),
      ),
    );
    const { result } = renderHook(() => useDeckCards("deck-id"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cards = result.current.data ?? [];
    expect(cards).toHaveLength(2);
    expect(cards.at(0)?.id).toBe(firstRow.id);
  });
});
