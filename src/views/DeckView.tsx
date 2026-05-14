import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, MenuItem, MenuTrigger, Popover, Button as RACButton } from "react-aria-components";
import type { DeckSearch } from "../app/router";
import { deckListing } from "../decks/deckListing";
import { useDeleteCard, useRenameDeck } from "../decks/mutations";
import { useDeck, useDeckCards } from "../decks/queries";
import { Button } from "../lib/ui/Button";
import { IconButton } from "../lib/ui/IconButton";
import { Input } from "../lib/ui/Input";
import { PencilIcon } from "../lib/ui/icons/PencilIcon";
import { TrashIcon } from "../lib/ui/icons/TrashIcon";
import { LoadingState } from "../lib/ui/LoadingState";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import { BrowseApiModal } from "./BrowseApiModal";
import styles from "./DeckView.module.css";

type Props = { deckId: string };

export function DeckView({ deckId }: Props) {
  const deckQuery = useDeck(deckId);
  const cardsQuery = useDeckCards(deckId);
  const renameDeck = useRenameDeck();
  const deleteCard = useDeleteCard();
  const search = useSearch({ from: "/app/deck/$deckId" });
  const navigate = useNavigate();
  const updateSearch = (patch: Partial<DeckSearch>) =>
    navigate({ from: "/deck/$deckId", search: (prev) => ({ ...prev, ...patch }) });
  const [browseOpen, setBrowseOpen] = useState(false);

  if (deckQuery.isLoading || cardsQuery.isLoading) return <LoadingState />;
  if (!deckQuery.data) return <p>This deck no longer exists.</p>;

  const deck = deckQuery.data;
  const rawCards = cardsQuery.data ?? [];
  const kind = search.kind ?? "all";
  const sort = search.sort ?? "updated";
  const { cards, counts } = deckListing(rawCards, { kind, sort });
  const isOwner = deck.is_owner;

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
          <Link to="/deck/$deckId/print" params={{ deckId }} className={styles.printLink}>
            Print
          </Link>
          {isOwner && (
            <>
              <Button variant="secondary" onPress={() => setBrowseOpen(true)}>
                Browse Catalog
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

      {rawCards.length > 0 && (
        <div className={styles.toolbar}>
          <ToggleButtonGroup
            aria-label="Filter by kind"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[kind]}
            onSelectionChange={(keys) => {
              const next = Array.from(keys)[0];
              if (next === "all") updateSearch({ kind: undefined });
              else if (next === "item" || next === "spell") updateSearch({ kind: next });
            }}
          >
            <ToggleButton id="all">All ({counts.all})</ToggleButton>
            <ToggleButton id="item">Items ({counts.item})</ToggleButton>
            <ToggleButton id="spell">Spells ({counts.spell})</ToggleButton>
          </ToggleButtonGroup>
          <MenuTrigger>
            <RACButton className={styles.sortTrigger}>
              Sort: {sort === "updated" ? "Last updated" : "Name"} <span aria-hidden="true">▾</span>
            </RACButton>
            <Popover className={styles.sortPopover} placement="bottom end">
              <Menu
                className={styles.sortMenu}
                onAction={(key) => {
                  if (key === "updated") updateSearch({ sort: undefined });
                  else if (key === "name") updateSearch({ sort: "name" });
                }}
              >
                <MenuItem id="updated" className={styles.sortMenuItem}>
                  Last updated
                </MenuItem>
                <MenuItem id="name" className={styles.sortMenuItem}>
                  Name
                </MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        </div>
      )}

      {rawCards.length === 0 ? (
        <p className={styles.empty}>No cards yet.</p>
      ) : cards.length === 0 ? (
        <p className={styles.empty}>
          {kind === "item"
            ? "No items in this deck."
            : kind === "spell"
              ? "No spells in this deck."
              : "No cards yet."}
        </p>
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
                {card.headerTags.length > 0 && (
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
