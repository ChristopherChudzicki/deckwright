import styles from "./Card.module.css";
import { pickIconKey } from "./iconRules";
import { renderBody } from "./renderBody";
import { ResolvedIcon } from "./resolveIcon";
import type { RenderableCard } from "./types";

export type CardsPerPage = 2 | 4;

export type CardPagination = { page: number; total: number };

type Props = {
  card: RenderableCard;
  cardsPerPage: CardsPerPage;
  pagination?: CardPagination;
  bodyOverride?: string;
};

export function Card({ card, cardsPerPage, pagination, bodyOverride }: Props) {
  const layoutClass = cardsPerPage === 4 ? styles.perPage4 : styles.perPage2;

  const iconKey = card.iconKey ?? pickIconKey(card);

  const isFirstPage = !pagination || pagination.page === 1;
  const bodyText = bodyOverride ?? card.body;
  const showFooterTags = isFirstPage && card.footerTags.length > 0;
  const showFooter = showFooterTags || pagination !== undefined;

  return (
    <div className={`${styles.card} ${layoutClass}`} data-role="card-root">
      <div className={styles.header}>
        <div className={styles.icon} data-testid="card-icon" aria-hidden="true">
          <svg
            className={styles.iconFrame}
            viewBox="0 0 100 100"
            aria-hidden="true"
            data-testid="card-icon-frame"
            data-frame={card.kind === "spell" ? "hex" : "square"}
          >
            {card.kind === "spell" ? (
              <polygon
                points="20,8 80,8 96,50 80,92 20,92 4,50"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinejoin="round"
              />
            ) : (
              <rect
                x="3"
                y="3"
                width="94"
                height="94"
                rx="14"
                ry="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
            )}
          </svg>
          <div className={styles.iconGlyph}>
            <ResolvedIcon iconKey={iconKey} />
          </div>
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
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify in renderBody
        dangerouslySetInnerHTML={{ __html: renderBody(bodyText) }}
      />
      {showFooter && (
        <div className={styles.footer} data-testid="card-footer">
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
    </div>
  );
}
