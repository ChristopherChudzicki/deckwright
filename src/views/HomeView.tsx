import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "../auth/useSession";
import { useCreateDeck, useDeleteDeck } from "../decks/mutations";
import { useDecks } from "../decks/queries";
import { Button } from "../lib/ui/Button";
import { EmptyHero } from "../lib/ui/EmptyHero";
import { IconButton } from "../lib/ui/IconButton";
import { TrashIcon } from "../lib/ui/icons/TrashIcon";
import { LoadingState } from "../lib/ui/LoadingState";
import { FirstDeckDialog } from "./FirstDeckDialog";
import styles from "./HomeView.module.css";

export function HomeView() {
  const session = useSession();
  const navigate = useNavigate();
  const ownerId = session.status === "authenticated" ? session.user.id : undefined;
  const decks = useDecks();
  const createDeck = useCreateDeck();
  const deleteDeck = useDeleteDeck();
  const [showFirstDeckDialog, setShowFirstDeckDialog] = useState(false);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      navigate({ to: "/login" });
    }
  }, [session.status, navigate]);

  if (session.status === "loading") return <LoadingState />;
  if (session.status !== "authenticated") return null;

  const maybeShowFirstDeckExplainer = () => {
    if (session.status !== "authenticated") return false;
    if (!session.user.is_anonymous) return false;
    if (
      window.localStorage.getItem("deckwright.firstDeckExplainerSeen") ??
      window.localStorage.getItem("dndCards.firstDeckExplainerSeen")
    ) {
      return false;
    }
    window.localStorage.setItem("deckwright.firstDeckExplainerSeen", "1");
    window.localStorage.removeItem("dndCards.firstDeckExplainerSeen");
    setShowFirstDeckDialog(true);
    return true;
  };

  const handleCreate = async () => {
    if (!ownerId) return;
    const deck = await createDeck.mutateAsync({ name: "Untitled deck", ownerId });
    if (maybeShowFirstDeckExplainer()) return;
    navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
  };

  const handleDelete = (deckId: string, name: string) => {
    if (!window.confirm(`Delete "${name}" and all its cards?`)) return;
    deleteDeck.mutate(deckId);
  };

  const dialog = (
    <FirstDeckDialog isOpen={showFirstDeckDialog} onOpenChange={setShowFirstDeckDialog} />
  );

  if (decks.isLoading)
    return (
      <>
        <LoadingState />
        {dialog}
      </>
    );

  if (!decks.data || decks.data.length === 0) {
    return (
      <>
        <EmptyHero
          title="No decks yet"
          actions={
            <Button variant="primary" onPress={handleCreate} isDisabled={createDeck.isPending}>
              Create your first deck
            </Button>
          }
        />
        {dialog}
      </>
    );
  }

  return (
    <>
      <section>
        <header className={styles.header}>
          <h2>Your decks</h2>
          <div className={styles.headerActions}>
            <Button variant="primary" onPress={handleCreate} isDisabled={createDeck.isPending}>
              New deck
            </Button>
          </div>
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
      {dialog}
    </>
  );
}
