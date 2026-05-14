import { QRCodeSVG } from "qrcode.react";
import styles from "./Card.module.css";
import { FramedIcon } from "./FramedIcon";
import { pickIconKey } from "./iconRules";
import { qrFloatHtml } from "./qrFloat";
import { renderBody } from "./renderBody";
import type { RenderableCard } from "./types";

export type CardsPerPage = 2 | 4;

export type CardPagination = { page: number; total: number };

type Props = {
  card: RenderableCard;
  cardsPerPage: CardsPerPage;
  pagination?: CardPagination;
  bodyHtml?: string;
};

export function Card({ card, cardsPerPage, pagination, bodyHtml }: Props) {
  const layoutClass = cardsPerPage === 4 ? styles.perPage4 : styles.perPage2;

  const iconKey = card.iconKey ?? pickIconKey(card);

  const isFirstPage = !pagination || pagination.page === 1;
  const showQr = isFirstPage && !!card.referenceUrl;
  // When bodyHtml is provided by an upstream paginator (expandCard), it already
  // carries the qrFloat prefix on page 1 — the slice naturally drops it on
  // continuation pages. When rendering without pagination (editor preview), we
  // build the html here and add the prefix ourselves.
  const html = bodyHtml ?? (showQr ? qrFloatHtml() + renderBody(card.body) : renderBody(card.body));

  const showFooterTags = isFirstPage && card.footerTags.length > 0;
  const showFooter = showFooterTags || pagination !== undefined;
  const footerClass = showQr ? `${styles.footer} ${styles.footerWithQr}` : styles.footer;

  return (
    <div className={`${styles.card} ${layoutClass}`} data-role="card-root">
      <div className={styles.header}>
        <div
          className={styles.icon}
          data-testid="card-icon"
          data-icon-key={iconKey}
          aria-hidden="true"
        >
          <FramedIcon kind={card.kind} iconKey={iconKey} />
        </div>
        <h3 className={styles.title}>{card.name}</h3>
        {isFirstPage && card.headerTags.length > 0 && (
          <span className={styles.headerTags}>
            {card.headerTags.map((tag) => (
              <span key={tag} className={styles.headerTag}>
                {tag}
              </span>
            ))}
          </span>
        )}
      </div>
      <hr className={styles.divider} />
      <div
        className={styles.body}
        data-role="card-body"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify in renderBody (or upstream layoutPaginator that slices already-sanitized HTML)
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {showFooter && (
        <div className={footerClass} data-testid="card-footer">
          {showFooterTags && (
            <span className={styles.footerTags}>
              {card.footerTags.map((tag) => (
                <span key={tag} className={styles.footerTag}>
                  {tag}
                </span>
              ))}
            </span>
          )}
          {pagination && (
            <span className={styles.footerRight} data-testid="card-pagination">
              Card {pagination.page} of {pagination.total}
            </span>
          )}
        </div>
      )}
      {showQr && card.referenceUrl && (
        <div className={styles.qrCorner} data-testid="card-qr" aria-hidden="true">
          <QRCodeSVG value={card.referenceUrl} size={96} />
        </div>
      )}
    </div>
  );
}
