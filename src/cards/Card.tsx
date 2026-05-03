import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./Card.module.css";
import { pickIconKey } from "./iconRules";
import { ResolvedIcon } from "./resolveIcon";
import type { ItemCard } from "./types";

export type CardsPerPage = 2 | 4;

export type CardPagination = { page: number; total: number };

type Props = {
  card: ItemCard;
  cardsPerPage: CardsPerPage;
  pagination?: CardPagination;
  bodyOverride?: string;
};

type AutofitState =
  | { kind: "unmeasured" }
  | { kind: "fitted"; scale: 1 | 0.9 | 0.8 }
  | { kind: "gave-up" };

const splitParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export function Card({ card, cardsPerPage, pagination, bodyOverride }: Props) {
  const layoutClass = cardsPerPage === 4 ? styles.perPage4 : styles.perPage2;
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const [autofit, setAutofit] = useState<AutofitState>({ kind: "unmeasured" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset key tied to inputs that change wrap behaviour
  useEffect(() => {
    setAutofit({ kind: "unmeasured" });
  }, [card.id, card.name, cardsPerPage]);

  useLayoutEffect(() => {
    if (autofit.kind === "gave-up") return;
    if (autofit.kind === "fitted" && autofit.scale === 1) return;
    const el = titleRef.current;
    if (!el) return;
    const lineHeightPx = Number.parseFloat(getComputedStyle(el).lineHeight);
    if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return;
    const wraps = Math.round(el.offsetHeight / lineHeightPx) > 1;

    if (autofit.kind === "unmeasured") {
      setAutofit(wraps ? { kind: "fitted", scale: 0.9 } : { kind: "fitted", scale: 1 });
      return;
    }
    if (!wraps) return;
    if (autofit.scale === 0.9) setAutofit({ kind: "fitted", scale: 0.8 });
    else setAutofit({ kind: "gave-up" });
  });

  const titleStyle =
    autofit.kind === "fitted" && autofit.scale !== 1
      ? { fontSize: `${autofit.scale}em` }
      : undefined;

  // Treat empty string the same as undefined: rendering <img src=""> makes the
  // browser refetch the document URL, which doesn't fire onError reliably and
  // leaves the styled-but-empty image element visible instead of falling back.
  const showImage = !!card.imageUrl && brokenUrl !== card.imageUrl;
  const iconKey = card.iconKey ?? pickIconKey(card);

  const isFirstPage = !pagination || pagination.page === 1;
  const bodyText = bodyOverride ?? card.body;
  const showFooterTags = isFirstPage && card.footerTags.length > 0;
  const showFooter = showFooterTags || pagination !== undefined;

  return (
    <div className={`${styles.card} ${layoutClass}`} data-role="card-root">
      <div className={styles.header}>
        {showImage ? (
          <img
            className={styles.image}
            src={card.imageUrl}
            alt=""
            data-testid="card-image"
            onError={() => setBrokenUrl(card.imageUrl ?? null)}
          />
        ) : (
          <div className={styles.icon} data-testid="card-icon" aria-hidden="true">
            <ResolvedIcon iconKey={iconKey} />
          </div>
        )}
        <h3 className={styles.title} ref={titleRef} style={titleStyle}>
          {card.name}
        </h3>
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
      <div className={styles.body} data-role="card-body">
        {splitParagraphs(bodyText).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
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
