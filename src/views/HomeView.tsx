import { Link, useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, useEffect, useRef } from "react";
import { useSession } from "../auth/useSession";
import { parseDeckJson } from "../decks/io";
import { useCreateDeck, useDeleteDeck, useSaveCard } from "../decks/mutations";
import { useDecks } from "../decks/queries";
import { newId } from "../lib/id";
import { Button } from "../lib/ui/Button";
import { EmptyHero } from "../lib/ui/EmptyHero";
import { IconButton } from "../lib/ui/IconButton";
import { TrashIcon } from "../lib/ui/icons/TrashIcon";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./HomeView.module.css";

export function HomeView() {
  const session = useSession();
  const navigate = useNavigate();
  const ownerId = session.status === "authenticated" ? session.user.id : undefined;
  const decks = useDecks(ownerId);
  const createDeck = useCreateDeck();
  const deleteDeck = useDeleteDeck();
  const saveCard = useSaveCard();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      navigate({ to: "/login" });
    }
  }, [session.status, navigate]);

  if (session.status !== "authenticated") return null;

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;
    try {
      const text = await file.text();
      const result = parseDeckJson(text);
      if (!result.ok) {
        alert(`Import failed: ${result.error}`);
        return;
      }
      const name = file.name.replace(/\.json$/i, "") || "Imported deck";
      const deck = await createDeck.mutateAsync({ name, ownerId });
      try {
        for (const card of result.deck.cards) {
          const fresh = { ...card, id: newId() };
          await saveCard.mutateAsync({ card: fresh, deckId: deck.id, isNew: true });
        }
      } catch (err) {
        await deleteDeck.mutateAsync(deck.id).catch(() => {});
        alert(`Import failed mid-way: ${err instanceof Error ? err.message : "unknown error"}`);
        return;
      }
      navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
    } finally {
      e.target.value = "";
    }
  };

  const handleCreate = async () => {
    if (!ownerId) return;
    const deck = await createDeck.mutateAsync({ name: "Untitled deck", ownerId });
    navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
  };

  const handleDelete = (deckId: string, name: string) => {
    if (!window.confirm(`Delete "${name}" and all its cards?`)) return;
    deleteDeck.mutate(deckId);
  };

  if (decks.isLoading) return <LoadingState />;

  if (!decks.data || decks.data.length === 0) {
    return (
      <>
        <EmptyHero
          title="No decks yet"
          actions={
            <>
              <Button variant="secondary" onPress={() => fileInputRef.current?.click()}>
                Import JSON
              </Button>
              <Button variant="primary" onPress={handleCreate} isDisabled={createDeck.isPending}>
                Create your first deck
              </Button>
            </>
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          aria-label="Import JSON"
          hidden
          onChange={handleImport}
        />
      </>
    );
  }

  return (
    <section>
      <header className={styles.header}>
        <h2>Your decks</h2>
        <div className={styles.headerActions}>
          <Button variant="secondary" onPress={() => fileInputRef.current?.click()}>
            Import JSON
          </Button>
          <Button variant="primary" onPress={handleCreate} isDisabled={createDeck.isPending}>
            New deck
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          aria-label="Import JSON"
          hidden
          onChange={handleImport}
        />
      </header>
      <ul className={styles.list}>
        {decks.data.map((d) => (
          <li key={d.id} className={styles.row}>
            <Link to="/deck/$deckId" params={{ deckId: d.id }} className={styles.deckLink}>
              {d.name}
            </Link>
            <IconButton
              aria-label={`Delete ${d.name}`}
              variant="danger"
              onPress={() => handleDelete(d.id, d.name)}
            >
              <TrashIcon />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
