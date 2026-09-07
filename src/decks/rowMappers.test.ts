import { describe, expect, it } from "vitest";
import type { Card } from "../cards/types";
import {
  makeAbilityPayload,
  makeCardRow,
  makeItemPayload,
  makeSpellPayload,
} from "../test/factories";
import { cardToInsertRow, cardToUpdatePayload, rowToCard } from "./rowMappers";

const builders = [
  ["item", makeItemPayload],
  ["spell", makeSpellPayload],
  ["ability", makeAbilityPayload],
] as const;

describe("rowMappers", () => {
  it("rowToCard fuses row.id into payload", () => {
    const row = makeCardRow.build();
    const card = rowToCard(row);
    expect(card.id).toBe(row.id);
    expect(card.name).toBe(row.payload.name);
    expect(card.kind).toBe(row.payload.kind);
  });

  it("cardToInsertRow strips id and includes deck_id", () => {
    const card: Card = { id: "card-id", ...makeItemPayload.build() };
    const insert = cardToInsertRow(card, "deck-id", 0);
    expect(insert.deck_id).toBe("deck-id");
    expect(insert.position).toBe(0);
    expect(insert.payload).not.toHaveProperty("id");
    expect(insert.payload.name).toBe(card.name);
  });

  it("cardToUpdatePayload returns the payload portion only", () => {
    const card: Card = { id: "card-id", ...makeItemPayload.build() };
    const update = cardToUpdatePayload(card);
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("deck_id");
    expect(update.name).toBe(card.name);
  });

  it.each(builders)(
    "round-trips a %s card through cardToInsertRow → rowToCard preserving discriminator",
    (_kind, builder) => {
      const original = { id: "card-id", ...builder.build() } as Card;
      const insert = cardToInsertRow(original, "deck-id", 0);
      // Construct the row literal directly — Fishery deep-merges overrides,
      // which would leak ItemCard fields into a Spell/Ability payload.
      const now = new Date().toISOString();
      const row = {
        id: original.id,
        deck_id: "deck-id",
        position: 0,
        payload: insert.payload,
        created_at: now,
        updated_at: now,
      };
      const restored = rowToCard(row);
      expect(restored).toEqual(original);
      expect(restored.kind).toBe(original.kind);
    },
  );
});
