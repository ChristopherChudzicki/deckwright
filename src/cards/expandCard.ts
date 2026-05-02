import type { CardPagination } from "./Card";
import type { CardMeasurer } from "./measurer";
import { paginateBody } from "./paginate";
import type { ItemCard } from "./types";

export type PhysicalCard = {
  card: ItemCard;
  bodyChunk: string;
  pagination?: CardPagination;
};

export function expandCard(card: ItemCard, measurer: CardMeasurer): PhysicalCard[] {
  const chunks = paginateBody({
    body: card.body,
    measureFirst: (s) => measurer.measureFirst(card, s),
    measureContinuation: (s) => measurer.measureContinuation(card, s),
  });

  const total = chunks.length;
  return chunks.map((bodyChunk, i) => ({
    card,
    bodyChunk,
    pagination: total > 1 ? { page: i + 1, total } : undefined,
  }));
}
