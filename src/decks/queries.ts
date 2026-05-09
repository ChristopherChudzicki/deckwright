import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import type { Card } from "../cards/types";
import { rowToCard } from "./rowMappers";
import type { CardRow, DeckRow, DeckSummary } from "./types";

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

export function useDeck(deckId: string | undefined) {
  return useQuery<DeckRow | null>({
    queryKey: deckKey(deckId),
    enabled: Boolean(deckId),
    queryFn: async () => {
      if (!deckId) return null;
      const { data, error } = await supabase
        .from("decks")
        .select("*")
        .eq("id", deckId)
        .maybeSingle();
      if (error) throw error;
      // Return null (not undefined) on miss: TanStack Query v5 throws if a
      // queryFn returns undefined.
      return data ?? null;
    },
  });
}

export function useDeckCards(deckId: string | undefined) {
  return useQuery<Card[]>({
    queryKey: deckCardsKey(deckId),
    enabled: Boolean(deckId),
    queryFn: async () => {
      if (!deckId) return [];
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("deck_id", deckId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as CardRow[]).map(rowToCard);
    },
  });
}
