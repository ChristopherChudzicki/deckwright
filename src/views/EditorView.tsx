import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "../cards/Card";
import { ItemEditor } from "../cards/ItemEditor";
import type { ItemCard } from "../cards/types";
import { useExpandedCards } from "../cards/useExpandedCards";
import { useDeleteCard, useSaveCard } from "../decks/mutations";
import { useDeckCards } from "../decks/queries";
import { newId } from "../lib/id";
import { nowIso } from "../lib/time";
import { Button } from "../lib/ui/Button";
import { Link } from "../lib/ui/Link";
import { LoadingState } from "../lib/ui/LoadingState";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { BrowseApiModal } from "./BrowseApiModal";
import styles from "./EditorView.module.css";

const isPristineNewCard = (card: ItemCard): boolean =>
  card.name === "" &&
  card.headerTags.length === 0 &&
  card.body === "" &&
  card.footerTags.length === 0 &&
  card.imageUrl === undefined &&
  card.createdAt === card.updatedAt;

const isTemplateItem = (card: ItemCard): boolean =>
  card.source === "api" && /\(any /i.test(card.body);

type Bucket = { perPage: number; count: number };

function countsLabel(buckets: Bucket[]): string {
  if (buckets.length === 0) return "0 cards";
  const first = buckets[0]!.count;
  const allEqual = buckets.every((b) => b.count === first);
  if (allEqual) {
    return `${first} card${first === 1 ? "" : "s"}`;
  }
  return buckets
    .map((b) => `${b.count} card${b.count === 1 ? "" : "s"} (${b.perPage} per page)`)
    .join(" · ");
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

  const [draft, setDraft] = useState<ItemCard | null>(
    initial && initial.kind === "item" ? initial : null,
  );

  useEffect(() => {
    if (initial && initial.kind === "item") setDraft(initial);
  }, [initial]);

  const debouncedBody = useDebouncedValue(draft?.body ?? "", 200);
  const measurementCard = useMemo<ItemCard | null>(
    () => (draft ? { ...draft, body: debouncedBody } : null),
    [draft, debouncedBody],
  );
  const measurementItems = useMemo(
    () => (measurementCard ? [measurementCard] : []),
    [measurementCard],
  );
  const { physicalCards: chunks4Up } = useExpandedCards(measurementItems, 4);
  const { physicalCards: chunks2Up } = useExpandedCards(measurementItems, 2);

  const [previewPage, setPreviewPage] = useState(0);
  const [browseOpen, setBrowseOpen] = useState(false);
  const totalPages4 = Math.max(chunks4Up.length, 1);
  const clampedPage = Math.min(previewPage, totalPages4 - 1);
  const visibleChunk = chunks4Up[clampedPage];

  if (cardsQuery.isLoading && !isNew) return <LoadingState />;
  if (!isNew && !existing) return <p>Card not found.</p>;
  if (existing && existing.kind !== "item") return <p>Only item cards are supported in v1.</p>;
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
        {isTemplateItem(draft) && (
          <div className={styles.templateNotice} data-testid="template-notice">
            <strong>Template item.</strong> The Open5e entry is weapon-type-agnostic (e.g.
            &ldquo;Any melee weapon&rdquo;). Rename and edit the description to match your specific
            weapon or armor.
          </div>
        )}
        {showImportHint && (
          <div className={styles.importHint} data-testid="import-hint">
            <span>
              Importing from the{" "}
              <Link
                href="https://en.wikipedia.org/wiki/System_Reference_Document"
                target="_blank"
                rel="noopener noreferrer"
              >
                SRD
              </Link>
              ? Browse the catalog instead.
            </span>
            <Button variant="secondary" onPress={() => setBrowseOpen(true)}>
              Browse Items
            </Button>
          </div>
        )}
        <ItemEditor card={draft} onChange={setDraft} />
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
          bodyOverride={visibleChunk?.bodyChunk}
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
        <div className={styles.counts} data-testid="preview-counts">
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
