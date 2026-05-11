import type { Database } from "../api/database.types";
import type { Card } from "../cards/types";
import type { CardRow } from "./types";

type CardInsertRow = Omit<CardRow, "id" | "created_at" | "updated_at">;
type CardUpdatePayload = Omit<Card, "id">;
type GeneratedCardRow = Database["public"]["Tables"]["cards"]["Row"];

export function rowToCard(row: GeneratedCardRow): Card {
  // Two casts: (1) DB stores card.payload as opaque JSONB, so this is the
  // single place that asserts the blob matches our discriminated `Card`
  // shape; (2) spreading a discriminated union widens it to a single
  // merged-field shape, so the outer cast re-discriminates.
  return { id: row.id, ...(row.payload as Omit<Card, "id">) } as Card;
}

export function cardToInsertRow(card: Card, deckId: string, position: number): CardInsertRow {
  const { id: _id, ...payload } = card;
  return {
    deck_id: deckId,
    position,
    payload,
  };
}

export function cardToUpdatePayload(card: Card): CardUpdatePayload {
  const { id: _id, ...payload } = card;
  return payload;
}
