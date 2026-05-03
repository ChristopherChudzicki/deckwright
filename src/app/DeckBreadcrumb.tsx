import { Link, useLocation } from "@tanstack/react-router";
import styles from "./root.module.css";

export function DeckBreadcrumb() {
  const { pathname } = useLocation();
  const deckId = parseDeckId(pathname);

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
            <li>…</li>
          </>
        )}
      </ol>
    </nav>
  );
}

function parseDeckId(pathname: string): string | undefined {
  const m = pathname.match(/^\/deck\/([^/]+)/);
  return m?.[1];
}
