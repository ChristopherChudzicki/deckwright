import { useState } from "react";
import { Card, type CardsPerPage } from "../cards/Card";
import type { ItemCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { useDeckCards } from "../decks/queries";
import { Button } from "../lib/ui/Button";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./PrintView.module.css";

type Props = { deckId: string };

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export function PrintView({ deckId }: Props) {
  const cardsQuery = useDeckCards(deckId);
  const [perPage, setPerPage] = useState<CardsPerPage>(4);

  const cards = cardsQuery.data ?? [];
  const items = cards.filter((c): c is ItemCard => c.kind === "item");
  const { physicalCards } = useExpandedCards(items, perPage);

  if (cardsQuery.isLoading) return <LoadingState />;

  const pages = physicalCards.length === 0 ? [] : chunk(physicalCards, perPage);

  return (
    <div>
      <div className={styles.controls}>
        <select
          aria-label="Cards per page"
          value={perPage}
          onChange={(e) => setPerPage(Number(e.target.value) as CardsPerPage)}
        >
          <option value={4}>4 per page (portrait)</option>
          <option value={2}>2 per page (landscape)</option>
        </select>
        <Button variant="primary" onPress={() => window.print()} isDisabled={items.length === 0}>
          Print
        </Button>
        <span className={styles.tip}>
          Tip: in the print dialog, choose <em>Margins: None</em> and uncheck{" "}
          <em>Headers and footers</em> for best results.
        </span>
      </div>

      {items.length === 0 && <p>No item cards in this deck yet.</p>}

      <div className={styles.sheet}>
        {pages.map((pageCards) => (
          <div
            key={`page-${pageCards[0]?.card.id ?? "empty"}-${pageCards[0]?.pagination?.page ?? 0}`}
            data-testid="page"
            className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
          >
            {pageCards.map((entry) => (
              <div key={`${entry.card.id}-${entry.pagination?.page ?? 0}`} className={styles.slot}>
                <Card
                  card={entry.card}
                  cardsPerPage={perPage}
                  bodyOverride={entry.bodyChunk}
                  pagination={entry.pagination}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
