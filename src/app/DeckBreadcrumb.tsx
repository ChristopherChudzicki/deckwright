import { Link, useLocation } from "@tanstack/react-router";
import { useDeck } from "../decks/queries";
import styles from "./root.module.css";

export function DeckBreadcrumb() {
  const { pathname } = useLocation();
  const deckId = parseSubdeckRoute(pathname);
  const deckQuery = useDeck(deckId);

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol className={styles.crumbList}>
        <li>
          <Link to="/" className={styles.link}>
            Decks
          </Link>
        </li>
        {deckId && (deckQuery.isPending || deckQuery.data) && (
          <>
            <li aria-hidden="true" className={styles.separator}>
              ›
            </li>
            <li>{renderDeckLink(deckQuery.data?.name, deckId)}</li>
          </>
        )}
      </ol>
    </nav>
  );
}

function renderDeckLink(name: string | undefined, deckId: string) {
  if (!name) return "…";
  return (
    <Link to="/deck/$deckId" params={{ deckId }} className={styles.link} title={name}>
      {name}
    </Link>
  );
}

// Matches /deck/$deckId/<something>. Returns undefined on the deck root itself,
// so the breadcrumb collapses to just "Decks" there (the deck name is already
// shown as the page H2; chrome doesn't repeat it).
function parseSubdeckRoute(pathname: string): string | undefined {
  const m = pathname.match(/^\/deck\/([^/]+)\/.+$/);
  return m?.[1];
}
