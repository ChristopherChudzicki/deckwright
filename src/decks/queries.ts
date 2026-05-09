import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import type { Card } from "../cards/types";
import { rowToCard } from "./rowMappers";
import type { CardRow, DeckSummary, PublicDeck } from "./types";

export const decksKey = () => ["decks"] as const;
export const deckKey = (deckId: string | undefined) => ["deck", deckId] as const;
export const deckCardsKey = (deckId: string | undefined) => ["deck-cards", deckId] as const;

/**
 * Decks owned by the current user — for the home view's deck list.
 * Server-side: RPC list_my_decks reads auth.uid().
 */
export function useDecks() {
  return useQuery<DeckSummary[]>({
    queryKey: decksKey(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_decks");
      if (error) throw error;
      return (data ?? []) as DeckSummary[];
    },
  });
}

/**
 * A single deck by id. PUBLIC READ — any caller with the deck id can
 * read it. There is no ownership filter; this matches the share-by-link
 * model. The returned row includes `is_owner`, computed server-side
 * from auth.uid(), which UI uses to gate edit affordances. Mutations
 * are still owner-gated by RLS on the underlying table.
 */
export function useDeck(deckId: string | undefined) {
  return useQuery<PublicDeck | null>({
    queryKey: deckKey(deckId),
    enabled: Boolean(deckId),
    queryFn: async () => {
      if (!deckId) return null;
      const { data, error } = await supabase
        .rpc("get_public_deck", { deck_id: deckId })
        .maybeSingle();
      if (error) throw error;
      // Return null (not undefined) on miss: TanStack Query v5 throws if a
      // queryFn returns undefined.
      return (data ?? null) as PublicDeck | null;
    },
  });
}

/**
 * Cards for a deck. Same PUBLIC READ semantics as useDeck.
 */
export function useDeckCards(deckId: string | undefined) {
  return useQuery<Card[]>({
    queryKey: deckCardsKey(deckId),
    enabled: Boolean(deckId),
    queryFn: async () => {
      if (!deckId) return [];
      const { data, error } = await supabase.rpc("get_public_deck_cards", { deck_id: deckId });
      if (error) throw error;
      return ((data ?? []) as CardRow[]).map(rowToCard);
    },
  });
}
