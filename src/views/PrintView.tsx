import { Fragment, useState } from "react";
import { imposeBackPage } from "../cards/backImposition";
import { Card, type CardsPerPage } from "../cards/Card";
import { CardBack } from "../cards/CardBack";
import type { PhysicalCard } from "../cards/expandCard";
import { isRenderableCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { useDeckCards } from "../decks/queries";
import { Button } from "../lib/ui/Button";
import { LoadingState } from "../lib/ui/LoadingState";
import { Switch } from "../lib/ui/Switch";
import styles from "./PrintView.module.css";

type Props = { deckId: string };

const COLS = 2;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const getBackContentFor = (entry: PhysicalCard, perPage: CardsPerPage) => (
  <CardBack card={entry.card} cardsPerPage={perPage} />
);

export function PrintView({ deckId }: Props) {
  const cardsQuery = useDeckCards(deckId);
  const [perPage, setPerPage] = useState<CardsPerPage>(4);
  const [printBacks, setPrintBacks] = useState(false);

  const cards = cardsQuery.data ?? [];
  const printable = cards.filter(isRenderableCard);
  const { physicalCards } = useExpandedCards(printable, perPage);

  if (cardsQuery.isLoading) return <LoadingState />;

  const pages = physicalCards.length === 0 ? [] : chunk(physicalCards, perPage);
  const flipEdge = perPage === 4 ? "long edge" : "short edge";
  const flipLabel = perPage === 4 ? "Book" : "Tablet";

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
        <Switch isSelected={printBacks} onChange={setPrintBacks}>
          Print backs
        </Switch>
        <Button
          variant="primary"
          onPress={() => window.print()}
          isDisabled={printable.length === 0}
        >
          Print
        </Button>
        <span className={styles.tip}>
          Tip: in the print dialog, choose <em>Margins: None</em> and uncheck{" "}
          <em>Headers and footers</em> for best results.
        </span>
        {printBacks && (
          <span className={styles.tip}>
            For double-sided printing, choose <em>Flip on {flipEdge}</em> in the print dialog
            (sometimes labelled <em>{flipLabel}</em>).
          </span>
        )}
      </div>

      {printable.length === 0 && <p>No printable cards in this deck yet.</p>}

      <div className={styles.sheet}>
        {pages.map((pageCards) => {
          const pageKey = `${pageCards[0]?.card.id ?? "empty"}-${pageCards[0]?.pagination?.page ?? 0}`;
          return (
            <Fragment key={`page-${pageKey}`}>
              <div
                data-testid="page"
                data-page-side="front"
                className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
              >
                {pageCards.map((entry) => (
                  <div
                    key={`${entry.card.id}-${entry.pagination?.page ?? 0}`}
                    className={styles.slot}
                  >
                    <Card
                      card={entry.card}
                      cardsPerPage={perPage}
                      bodyOverride={entry.bodyChunk}
                      pagination={entry.pagination}
                    />
                  </div>
                ))}
              </div>
              {printBacks && (
                <div
                  data-testid="page"
                  data-page-side="back"
                  className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
                >
                  {imposeBackPage(pageCards, perPage, COLS).map((entry, slotIndex) => {
                    const slotKey = entry
                      ? `${entry.card.id}-${entry.pagination?.page ?? 0}`
                      : `${pageKey}-empty-${slotIndex}`;
                    return (
                      <div key={`back-${slotKey}`} className={styles.slot}>
                        {entry ? getBackContentFor(entry, perPage) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
