import type { Database } from "../api/database.types";
import type { Card } from "../cards/types";

export type DeckRow = Database["public"]["Tables"]["decks"]["Row"];

// Narrows payload from the generated `Json` to our discriminated Card union.
// The DB stores cards as JSONB; this is the one place that asserts the JSONB
// content matches the Card shape.
export type CardRow = Omit<Database["public"]["Tables"]["cards"]["Row"], "payload"> & {
  payload: Omit<Card, "id">;
};

export type DeckSummary = Database["public"]["Functions"]["list_my_decks"]["Returns"][number];

export type PublicDeck = Database["public"]["Functions"]["get_public_deck"]["Returns"][number];
