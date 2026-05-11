import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import type { Card } from "../cards/types";
import { deckCardsKey, deckKey, decksKey } from "./queries";
import { cardToInsertRow, cardToUpdatePayload, rowToCard } from "./rowMappers";
import type { DeckRow } from "./types";

// Note on .maybeSingle(): we use it here (rather than .single()) for two
// reasons. (1) .single() forces the Accept header to
// `application/vnd.pgrst.object+json`, which our MSW handlers don't simulate.
// (2) .maybeSingle() returns null on 0 rows instead of throwing, which lets
// us throw a hook-named error so a stack trace is debuggable in production.

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation<DeckRow, Error, { name: string; ownerId: string }>({
    mutationFn: async ({ name, ownerId }) => {
      const { data, error } = await supabase
        .from("decks")
        .insert({ name, owner_id: ownerId })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("useCreateDeck: insert returned no row");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: decksKey() });
    },
  });
}

export function useRenameDeck() {
  const qc = useQueryClient();
  return useMutation<DeckRow, Error, { deckId: string; name: string }>({
    mutationFn: async ({ deckId, name }) => {
      const { data, error } = await supabase
        .from("decks")
        .update({ name })
        .eq("id", deckId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`useRenameDeck: no row matched id=${deckId}`);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: deckKey(data.id) });
      qc.invalidateQueries({ queryKey: decksKey() });
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (deckId) => {
      const { error } = await supabase.from("decks").delete().eq("id", deckId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Owner is the only viewer of their deck list, so blanket-invalidate.
      qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useSaveCard() {
  const qc = useQueryClient();
  return useMutation<
    Card,
    Error,
    { card: Card; deckId: string; isNew: boolean; position?: number }
  >({
    mutationFn: async ({ card, deckId, isNew, position = 0 }) => {
      if (isNew) {
        const insert = cardToInsertRow(card, deckId, position);
        // Force the row id to match the client-generated one so the editor
        // URL stays stable across the save round-trip.
        const { data, error } = await supabase
          .from("cards")
          .insert({ ...insert, id: card.id })
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("useSaveCard: insert returned no row");
        return rowToCard(data);
      }
      const { data, error } = await supabase
        .from("cards")
        .update({ payload: cardToUpdatePayload(card) })
        .eq("id", card.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`useSaveCard: no card matched id=${card.id}`);
      return rowToCard(data);
    },
    onSuccess: (_card, vars) => {
      qc.invalidateQueries({ queryKey: deckCardsKey(vars.deckId) });
    },
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation<void, Error, { cardId: string; deckId: string }>({
    mutationFn: async ({ cardId }) => {
      const { error } = await supabase.from("cards").delete().eq("id", cardId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: deckCardsKey(vars.deckId) });
    },
  });
}
