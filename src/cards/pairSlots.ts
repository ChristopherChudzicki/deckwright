import type { PhysicalCard } from "./expandCard";

export type PrintSlot = {
  front: PhysicalCard;
  back?: PhysicalCard;
};

// Assumes consecutive PhysicalCards with matching card.id are pages of the
// same card in order — the invariant established by useExpandedCards.
export function pairSlots(cards: PhysicalCard[], opts: { contentOnBack: boolean }): PrintSlot[] {
  if (!opts.contentOnBack) return cards.map((front) => ({ front }));

  const slots: PrintSlot[] = [];
  for (let i = 0; i < cards.length; i++) {
    const front = cards[i]!;
    const next = cards[i + 1];
    if (next && next.card.id === front.card.id) {
      slots.push({ front, back: next });
      i++;
    } else {
      slots.push({ front });
    }
  }
  return slots;
}
