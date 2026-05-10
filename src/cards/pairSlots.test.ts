import { describe, expect, test } from "vitest";
import { invariant } from "../lib/invariant";
import type { PhysicalCard } from "./expandCard";
import { itemCardFactory } from "./factories";
import { pairSlots } from "./pairSlots";
import type { ItemCard } from "./types";

const physical = (card: ItemCard, page?: number, total?: number): PhysicalCard => ({
  card,
  bodyHtml: "",
  pagination: page !== undefined && total !== undefined ? { page, total } : undefined,
});

describe("pairSlots", () => {
  test("contentOnBack: false maps every PhysicalCard to a front-only slot", () => {
    const card = itemCardFactory.build();
    const cards = [physical(card), physical(card, 1, 2), physical(card, 2, 2)];
    const slots = pairSlots(cards, { contentOnBack: false });
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.back).toBeUndefined();
    }
  });

  test("empty input returns empty slots in both modes", () => {
    expect(pairSlots([], { contentOnBack: false })).toEqual([]);
    expect(pairSlots([], { contentOnBack: true })).toEqual([]);
  });

  test("single 1-page card pairs to one front-only slot", () => {
    const card = itemCardFactory.build();
    const slots = pairSlots([physical(card)], { contentOnBack: true });
    expect(slots).toHaveLength(1);
    const [slot0] = slots;
    invariant(slot0, "expected slots[0]");
    expect(slot0.back).toBeUndefined();
  });

  test("single 2-page card collapses to one paired slot", () => {
    const card = itemCardFactory.build();
    const cards = [physical(card, 1, 2), physical(card, 2, 2)];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(1);
    const [slot0] = slots;
    invariant(slot0, "expected slots[0]");
    expect(slot0.front.pagination?.page).toBe(1);
    expect(slot0.back?.pagination?.page).toBe(2);
  });

  test("single 3-page card produces two slots, last with no back", () => {
    const card = itemCardFactory.build();
    const cards = [physical(card, 1, 3), physical(card, 2, 3), physical(card, 3, 3)];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(2);
    const [slot0, slot1] = slots;
    invariant(slot0, "expected slots[0]");
    invariant(slot1, "expected slots[1]");
    expect(slot0.front.pagination?.page).toBe(1);
    expect(slot0.back?.pagination?.page).toBe(2);
    expect(slot1.front.pagination?.page).toBe(3);
    expect(slot1.back).toBeUndefined();
  });

  test("single 4-page card produces two paired slots", () => {
    const card = itemCardFactory.build();
    const cards = [
      physical(card, 1, 4),
      physical(card, 2, 4),
      physical(card, 3, 4),
      physical(card, 4, 4),
    ];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(2);
    const [slot0, slot1] = slots;
    invariant(slot0, "expected slots[0]");
    invariant(slot1, "expected slots[1]");
    expect(slot0.front.pagination?.page).toBe(1);
    expect(slot0.back?.pagination?.page).toBe(2);
    expect(slot1.front.pagination?.page).toBe(3);
    expect(slot1.back?.pagination?.page).toBe(4);
  });

  test("two distinct 1-page cards stay unpaired", () => {
    const cardA = itemCardFactory.build();
    const cardB = itemCardFactory.build();
    const slots = pairSlots([physical(cardA), physical(cardB)], {
      contentOnBack: true,
    });
    expect(slots).toHaveLength(2);
    const [slot0, slot1] = slots;
    invariant(slot0, "expected slots[0]");
    invariant(slot1, "expected slots[1]");
    expect(slot0.front.card).toBe(cardA);
    expect(slot0.back).toBeUndefined();
    expect(slot1.front.card).toBe(cardB);
    expect(slot1.back).toBeUndefined();
  });

  test("two consecutive 2-page cards each pair within their own card", () => {
    const cardA = itemCardFactory.build();
    const cardB = itemCardFactory.build();
    const cards = [
      physical(cardA, 1, 2),
      physical(cardA, 2, 2),
      physical(cardB, 1, 2),
      physical(cardB, 2, 2),
    ];
    const slots = pairSlots(cards, { contentOnBack: true });
    expect(slots).toHaveLength(2);
    const [slot0, slot1] = slots;
    invariant(slot0, "expected slots[0]");
    invariant(slot1, "expected slots[1]");
    expect(slot0.front.card).toBe(cardA);
    expect(slot0.back?.card).toBe(cardA);
    expect(slot1.front.card).toBe(cardB);
    expect(slot1.back?.card).toBe(cardB);
  });
});
