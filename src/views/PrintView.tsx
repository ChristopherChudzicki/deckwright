import { Fragment, useId, useState } from "react";
import { imposeBackPage } from "../cards/backImposition";
import { Card, type CardsPerPage } from "../cards/Card";
import { CardBack } from "../cards/CardBack";
import { type PrintSlot, pairSlots } from "../cards/pairSlots";
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

const getBackContentFor = (slot: PrintSlot, perPage: CardsPerPage) =>
  slot.back ? (
    <Card
      card={slot.back.card}
      cardsPerPage={perPage}
      bodyHtml={slot.back.bodyHtml}
      pagination={slot.back.pagination}
    />
  ) : (
    <CardBack card={slot.front.card} cardsPerPage={perPage} />
  );

export function PrintView({ deckId }: Props) {
  const cardsQuery = useDeckCards(deckId);
  const [perPage, setPerPage] = useState<CardsPerPage>(4);
  const [printBacks, setPrintBacks] = useState(false);
  const [contentOnBack, setContentOnBack] = useState(false);
  const perPageId = useId();

  const cards = cardsQuery.data ?? [];
  const printable = cards.filter(isRenderableCard);
  const { physicalCards } = useExpandedCards(printable, perPage);
  const printSlots = pairSlots(physicalCards, {
    contentOnBack: printBacks && contentOnBack,
  });

  if (cardsQuery.isLoading) return <LoadingState />;

  const pages = printSlots.length === 0 ? [] : chunk(printSlots, perPage);
  const flipEdge = perPage === 4 ? "long edge" : "short edge";
  const flipLabel = perPage === 4 ? "Book" : "Tablet";

  return (
    <div className={styles.root} data-print-view>
      <aside className={styles.sidebar}>
        <div className={styles.field}>
          <label htmlFor={perPageId} className={styles.fieldLabel}>
            Cards per page
          </label>
          <select
            id={perPageId}
            className={styles.select}
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value) as CardsPerPage)}
          >
            <option value={4}>4 per page (portrait)</option>
            <option value={2}>2 per page (landscape)</option>
          </select>
        </div>

        <div className={styles.switchBlock}>
          <Switch isSelected={printBacks} onChange={setPrintBacks}>
            Print backs
          </Switch>
          <div className={styles.helptext}>
            <p>Adds a second page of card backs for double-sided printing.</p>
            {printBacks && (
              <p>
                In the print dialog, choose <em>Flip on {flipEdge}</em> (sometimes labelled{" "}
                <em>{flipLabel}</em>).
              </p>
            )}
          </div>
          <div className={styles.subSwitch}>
            <Switch isSelected={contentOnBack} onChange={setContentOnBack} isDisabled={!printBacks}>
              Continue content on back
            </Switch>
            <div className={styles.helptext}>
              <p>
                Print page 2 of a multi-page card on the back of page 1, instead of using a separate
                slot.
              </p>
              {!printBacks && <p>Enable Print backs to use this option.</p>}
            </div>
          </div>
        </div>

        <hr className={styles.divider} />

        <Button
          className={styles.printButton}
          variant="primary"
          size="lg"
          onPress={() => window.print()}
          isDisabled={printable.length === 0}
        >
          Print
        </Button>
        <p className={styles.tip}>
          Tip: in the print dialog, choose <em>Margins: None</em> and uncheck{" "}
          <em>Headers and footers</em> for best results.
        </p>
      </aside>

      <div>
        {printable.length === 0 && <p>No printable cards in this deck yet.</p>}

        <div className={styles.sheet}>
          {pages.map((pageSlots) => {
            const pageKey = `${pageSlots[0]?.front.card.id ?? "empty"}-${pageSlots[0]?.front.pagination?.page ?? 0}`;
            return (
              <Fragment key={`page-${pageKey}`}>
                <div
                  data-testid="page"
                  data-page-side="front"
                  className={`${styles.page} ${perPage === 4 ? styles.perPage4 : styles.perPage2}`}
                >
                  {pageSlots.map((slot) => (
                    <div
                      key={`${slot.front.card.id}-${slot.front.pagination?.page ?? 0}`}
                      className={styles.slot}
                    >
                      <Card
                        card={slot.front.card}
                        cardsPerPage={perPage}
                        bodyHtml={slot.front.bodyHtml}
                        pagination={slot.front.pagination}
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
                    {imposeBackPage(pageSlots, perPage, COLS).map((slot, slotIndex) => {
                      const slotKey = slot
                        ? `${slot.front.card.id}-${slot.front.pagination?.page ?? 0}`
                        : `${pageKey}-empty-${slotIndex}`;
                      return (
                        <div key={`back-${slotKey}`} className={styles.slot}>
                          {slot ? getBackContentFor(slot, perPage) : null}
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
    </div>
  );
}
