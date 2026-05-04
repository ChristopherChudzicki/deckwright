import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "../auth/useSession";
import { serializeDeck } from "../decks/io";
import { useDeleteCard, useRenameDeck } from "../decks/mutations";
import { useDeck, useDeckCards } from "../decks/queries";
import { downloadText } from "../lib/download";
import { Button } from "../lib/ui/Button";
import { IconButton } from "../lib/ui/IconButton";
import { Input } from "../lib/ui/Input";
import { PencilIcon } from "../lib/ui/icons/PencilIcon";
import { TrashIcon } from "../lib/ui/icons/TrashIcon";
import { LoadingState } from "../lib/ui/LoadingState";
import { BrowseApiModal } from "./BrowseApiModal";
import styles from "./DeckView.module.css";

type Props = { deckId: string };

export function DeckView({ deckId }: Props) {
  const session = useSession();
  const deckQuery = useDeck(deckId);
  const cardsQuery = useDeckCards(deckId);
  const renameDeck = useRenameDeck();
  const deleteCard = useDeleteCard();
  const [browseOpen, setBrowseOpen] = useState(false);

  if (deckQuery.isLoading || cardsQuery.isLoading) return <LoadingState />;
  if (!deckQuery.data) return <p>This deck no longer exists.</p>;

  const deck = deckQuery.data;
  const cards = cardsQuery.data ?? [];
  const isOwner = session.status === "authenticated" && session.user.id === deck.owner_id;

  const handleExport = () => {
    downloadText(`${deck.name}.json`, serializeDeck({ version: 1, cards }));
  };

  return (
    <section>
      <header className={styles.header}>
        {isOwner ? (
          <DeckTitle name={deck.name} onRename={(n) => renameDeck.mutate({ deckId, name: n })} />
        ) : (
          <h2 className={styles.title}>{deck.name}</h2>
        )}
        <span className={styles.count}>
          {cards.length} {cards.length === 1 ? "card" : "cards"}
        </span>
        <div className={styles.actions}>
          <Button variant="secondary" onPress={handleExport} isDisabled={cards.length === 0}>
            Export JSON
          </Button>
          <Link to="/deck/$deckId/print" params={{ deckId }} className={styles.printLink}>
            Print
          </Link>
          {isOwner && (
            <>
              <Button variant="secondary" onPress={() => setBrowseOpen(true)}>
                Browse Items
              </Button>
              <Link
                to="/deck/$deckId/edit/$cardId"
                params={{ deckId, cardId: "new" }}
                className={styles.newCardLink}
              >
                New card
              </Link>
            </>
          )}
        </div>
      </header>

      {cards.length === 0 ? (
        <p className={styles.empty}>No cards yet.</p>
      ) : (
        <ul className={styles.list}>
          {cards.map((card) => (
            <li key={card.id} className={styles.row}>
              <div className={styles.rowMain}>
                {isOwner ? (
                  <Link
                    to="/deck/$deckId/edit/$cardId"
                    params={{ deckId, cardId: card.id }}
                    className={styles.cardLink}
                  >
                    <strong>{card.name}</strong>
                  </Link>
                ) : (
                  <strong>{card.name}</strong>
                )}
                {card.kind === "item" && card.headerTags.length > 0 && (
                  <span className={styles.headerTags}>{card.headerTags.join(" | ")}</span>
                )}
              </div>
              {isOwner && (
                <IconButton
                  aria-label={`Delete ${card.name}`}
                  variant="danger"
                  onPress={() => deleteCard.mutate({ cardId: card.id, deckId })}
                >
                  <TrashIcon />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {browseOpen && (
        <BrowseApiModal
          deckId={deckId}
          onClose={() => setBrowseOpen(false)}
          onSelected={() => setBrowseOpen(false)}
        />
      )}
    </section>
  );
}

function DeckTitle({ name, onRename }: { name: string; onRename: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (!editing) {
    return (
      <div className={styles.titleRow}>
        <h2 className={styles.title}>{name}</h2>
        <IconButton
          aria-label={`Rename deck ${name}`}
          onPress={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          <PencilIcon />
        </IconButton>
      </div>
    );
  }
  return (
    <Input
      className={styles.titleInput}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft && draft !== name) onRename(draft);
        setEditing(false);
      }}
      aria-label={`Rename deck (currently: ${name})`}
      autoFocus
    />
  );
}
