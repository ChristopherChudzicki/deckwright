import type { Card } from "../cards/types";

export type DeckRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CardRow = {
  id: string;
  deck_id: string;
  position: number;
  payload: Omit<Card, "id">;
  created_at: string;
  updated_at: string;
};

// Returned by list_my_decks() RPC.
export type DeckSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

// Returned by get_public_deck(deck_id) RPC. Adds is_owner so callers
// can gate UI without learning the owner's UUID.
export type PublicDeck = DeckSummary & {
  is_owner: boolean;
};
