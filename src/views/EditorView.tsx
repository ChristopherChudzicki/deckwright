import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "../cards/Card";
import { CardEditor } from "../cards/CardEditor";
import { type ItemCard, isRenderableCard, type RenderableCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { useDeleteCard, useSaveCard } from "../decks/mutations";
import { useDeckCards } from "../decks/queries";
import { newId } from "../lib/id";
import { invariant } from "../lib/invariant";
import { nowIso } from "../lib/time";
import { Button } from "../lib/ui/Button";
import { LoadingState } from "../lib/ui/LoadingState";
import { BrowseApiModal } from "./BrowseApiModal";
import styles from "./EditorView.module.css";

const isPristineNewCard = (card: ItemCard): boolean =>
  card.name === "" &&
  card.headerTags.length === 0 &&
  card.body === "" &&
  card.footerTags.length === 0 &&
  card.createdAt === card.updatedAt;

type Bucket = { perPage: number; count: number };

function countsLabel(buckets: Bucket[]): string {
  if (buckets.length === 0) return "0 cards";
  const head = buckets[0];
  invariant(head, "buckets is non-empty after the length guard");
  const first = head.count;
  const allEqual = buckets.every((b) => b.count === first);
  if (allEqual) {
    return `${first} card${first === 1 ? "" : "s"}`;
  }
  return buckets
    .map((b) => `${b.count} card${b.count === 1 ? "" : "s"} (${b.perPage} per page)`)
    .join(" | ");
}

type Props = { deckId: string; cardId: string };

export function EditorView({ deckId, cardId }: Props) {
  const cardsQuery = useDeckCards(deckId);
  const saveCard = useSaveCard();
  const deleteCard = useDeleteCard();
  const navigate = useNavigate();

  const isNew = cardId === "new";

  const stub: ItemCard | null = useMemo(() => {
    if (!isNew) return null;
    const now = nowIso();
    return {
      id: newId(),
      kind: "item",
      name: "",
      headerTags: [],
      body: "",
      footerTags: [],
      source: "custom",
      createdAt: now,
      updatedAt: now,
    };
  }, [isNew]);

  const existing = cardsQuery.data?.find((c) => c.id === cardId) ?? null;
  const initial = isNew ? stub : existing;

  const [draft, setDraft] = useState<RenderableCard | null>(
    initial && isRenderableCard(initial) ? initial : null,
  );

  useEffect(() => {
    if (initial && isRenderableCard(initial)) setDraft(initial);
  }, [initial]);

  const measurementItems = useMemo(() => (draft ? [draft] : []), [draft]);
  const { physicalCards: chunks4Up, isPending: isPending4 } = useExpandedCards(
    measurementItems,
    4,
    { debounceMs: 300 },
  );
  const { physicalCards: chunks2Up, isPending: isPending2 } = useExpandedCards(
    measurementItems,
    2,
    { debounceMs: 300 },
  );
  const previewPending = isPending4 || isPending2;

  const [previewPage, setPreviewPage] = useState(0);
  const [browseOpen, setBrowseOpen] = useState(false);
  const totalPages4 = Math.max(chunks4Up.length, 1);
  const clampedPage = Math.min(previewPage, totalPages4 - 1);
  const visibleChunk = chunks4Up[clampedPage];

  if (cardsQuery.isLoading && !isNew) return <LoadingState />;
  if (!isNew && !existing) return <p>Card not found.</p>;
  if (existing && !isRenderableCard(existing)) return <p>This card kind isn't editable yet.</p>;
  if (!draft) return null;

  const handleSave = async () => {
    await saveCard.mutateAsync({ card: draft, deckId, isNew });
    navigate({ to: "/deck/$deckId", params: { deckId } });
  };

  const handleCancel = async () => {
    if (!isNew && existing && existing.kind === "item" && isPristineNewCard(existing)) {
      await deleteCard.mutateAsync({ cardId: existing.id, deckId });
    }
    navigate({ to: "/deck/$deckId", params: { deckId } });
  };

  const label = countsLabel([
    { perPage: 4, count: chunks4Up.length },
    { perPage: 2, count: chunks2Up.length },
  ]);

  const showPaginator = totalPages4 > 1;

  const showImportHint = isNew && draft.name === "";

  return (
    <section className={styles.editor}>
      <div className={styles.form}>
        {showImportHint && (
          <div className={styles.importHint} data-testid="import-hint">
            <span>Browse the catalog instead.</span>
            <Button variant="secondary" onPress={() => setBrowseOpen(true)}>
              Browse Catalog
            </Button>
          </div>
        )}
        <CardEditor card={draft} onChange={setDraft} />
        <div className={styles.formActions}>
          <Button
            variant="primary"
            onPress={handleSave}
            isDisabled={saveCard.isPending || draft.name === ""}
          >
            Save
          </Button>
          <Button variant="secondary" onPress={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
      <div className={styles.preview}>
        <div className={styles.previewLabel}>Preview (4 per page)</div>
        <Card
          card={draft}
          cardsPerPage={4}
          bodyHtml={visibleChunk?.bodyHtml}
          pagination={visibleChunk?.pagination}
        />
        {showPaginator && (
          <div className={styles.paginator} data-testid="preview-paginator">
            <Button
              variant="secondary"
              onPress={() => setPreviewPage((p) => Math.max(0, p - 1))}
              isDisabled={clampedPage === 0}
              aria-label="Previous preview page"
            >
              ←
            </Button>
            <span className={styles.paginatorPage}>
              Page {clampedPage + 1} of {totalPages4}
            </span>
            <Button
              variant="secondary"
              onPress={() => setPreviewPage((p) => Math.min(totalPages4 - 1, p + 1))}
              isDisabled={clampedPage === totalPages4 - 1}
              aria-label="Next preview page"
            >
              →
            </Button>
          </div>
        )}
        <div
          className={styles.counts}
          data-testid="preview-counts"
          data-pending={previewPending ? "true" : "false"}
        >
          {label}
        </div>
      </div>
      {browseOpen && (
        <BrowseApiModal
          deckId={deckId}
          onClose={() => setBrowseOpen(false)}
          onSelected={(importedCardId) => {
            setBrowseOpen(false);
            navigate({
              to: "/deck/$deckId/edit/$cardId",
              params: { deckId, cardId: importedCardId },
            });
          }}
        />
      )}
    </section>
  );
}
