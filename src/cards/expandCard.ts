import type { CardPagination } from "./Card";
import { layoutPaginate } from "./layoutPaginator";
import type { CardMeasurer } from "./measurer";
import { qrFloatHtml } from "./qrFloat";
import { renderBody } from "./renderBody";
import type { RenderableCard } from "./types";

export type PhysicalCard = {
  card: RenderableCard;
  bodyHtml: string;
  pagination?: CardPagination;
};

export function expandCard(card: RenderableCard, measurer: CardMeasurer): PhysicalCard[] {
  const dims = measurer.getBodyDimensions(card);
  // When the card has a referenceUrl, the printed card renders a QR-reserve
  // float in .body's bottom-right corner. Prefixing the bodyHtml here lets
  // layoutPaginate measure body capacity with the float (and its shape-outside
  // wrap exclusion) in place — so pagination splits content earlier when the
  // QR steals real estate. The slice naturally keeps the float in chunk 1 and
  // drops it from continuation chunks, matching Card.tsx's "QR on page 1 only"
  // render rule.
  const renderedBody = renderBody(card.body);
  const bodyHtml = card.referenceUrl ? qrFloatHtml() + renderedBody : renderedBody;
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
