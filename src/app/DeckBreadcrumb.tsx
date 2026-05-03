import { Link, useLocation } from "@tanstack/react-router";
import { useDeck } from "../decks/queries";
import styles from "./root.module.css";

export function DeckBreadcrumb() {
  const { pathname } = useLocation();
  const { deckId, isAtDeckRoot } = parsePathname(pathname);
  const deckQuery = useDeck(deckId);

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol className={styles.crumbList}>
        <li>
          <Link to="/" className={styles.link}>
            Decks
          </Link>
        </li>
        {deckId && (
          <>
            <li aria-hidden="true" className={styles.separator}>
              ›
            </li>
            <li>{renderDeckCrumb(deckQuery.data?.name, isAtDeckRoot, deckId)}</li>
          </>
        )}
      </ol>
    </nav>
  );
}

function renderDeckCrumb(name: string | undefined, isAtDeckRoot: boolean, deckId: string) {
  if (!name) return "…";
  if (isAtDeckRoot) {
    return (
      <span aria-current="page" className={styles.crumbCurrent} title={name}>
        {name}
      </span>
    );
  }
  return (
    <Link to="/deck/$deckId" params={{ deckId }} className={styles.link} title={name}>
      {name}
    </Link>
  );
}

function parsePathname(pathname: string): { deckId: string | undefined; isAtDeckRoot: boolean } {
  const m = pathname.match(/^\/deck\/([^/]+)(\/.*)?$/);
  if (!m) return { deckId: undefined, isAtDeckRoot: false };
  return { deckId: m[1], isAtDeckRoot: !m[2] };
}
