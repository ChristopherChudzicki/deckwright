import type { Database } from "../api/database.types";
import type { Card } from "../cards/types";

export type DeckRow = Database["public"]["Tables"]["decks"]["Row"];

export type CardRow = Omit<Database["public"]["Tables"]["cards"]["Row"], "payload"> & {
  payload: Omit<Card, "id">;
};

export type DeckSummary = Database["public"]["Functions"]["list_my_decks"]["Returns"][number];

// Adds `is_owner` (computed server-side from auth.uid()) so callers can gate
// edit UI without learning the owner's UUID.
export type PublicDeck = Database["public"]["Functions"]["get_public_deck"]["Returns"][number];
