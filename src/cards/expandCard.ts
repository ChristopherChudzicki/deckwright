import type { CardPagination } from "./Card";
import { layoutPaginate } from "./layoutPaginator";
import type { CardMeasurer } from "./measurer";
import { renderBody } from "./renderBody";
import type { RenderableCard } from "./types";

export type PhysicalCard = {
  card: RenderableCard;
  bodyHtml: string;
  pagination?: CardPagination;
};

export function expandCard(card: RenderableCard, measurer: CardMeasurer): PhysicalCard[] {
  const dims = measurer.getBodyDimensions(card);
  const bodyHtml = renderBody(card.body);
  const chunks = layoutPaginate({
    bodyHtml,
    width: dims.width,
    firstHeight: dims.firstHeight,
    continuationHeight: dims.continuationHeight,
    mount: measurer.mountForPagination,
  });

  const total = chunks.length;
  return chunks.map((bodyHtml, i) => ({
    card,
    bodyHtml,
    pagination: total > 1 ? { page: i + 1, total } : undefined,
  }));
}
