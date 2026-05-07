import type { CardsPerPage } from "./Card";
import styles from "./CardBack.module.css";
import { pickIconKey } from "./iconRules";
import { ResolvedIcon } from "./resolveIcon";
import type { RenderableCard } from "./types";

type Props = {
  card: RenderableCard;
  cardsPerPage: CardsPerPage;
};

export function CardBack({ card, cardsPerPage }: Props) {
  const layoutClass = cardsPerPage === 4 ? styles.perPage4 : styles.perPage2;
  const iconKey = card.iconKey ?? pickIconKey(card);
  return (
    <div
      className={`${styles.card} ${layoutClass}`}
      data-testid="card-back"
      data-role="card-back-root"
      data-card-id={card.id}
      data-icon-key={iconKey}
    >
      <div className={styles.icon} aria-hidden="true">
        <ResolvedIcon iconKey={iconKey} />
      </div>
    </div>
  );
}
