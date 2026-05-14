import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Announcement, AnnouncementProvider } from "../lib/ui/Announcement";
import { UserMenu } from "../lib/ui/UserMenu";
import { DeckBreadcrumb } from "./DeckBreadcrumb";
import { Footer } from "./Footer";
import styles from "./root.module.css";

export function Root({ children }: { children: ReactNode }) {
  return (
    <AnnouncementProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandGroup}>
            <Link to="/" className={styles.brand}>
              Deckwright
            </Link>
            <span className={styles.tagline}>
              <span aria-hidden="true" className={styles.taglineSeparator}>
                ·
              </span>
              readable D&amp;D cards
            </span>
          </div>
          <DeckBreadcrumb />
          <div className={styles.spacer} />
          <UserMenu />
        </header>
        <main className={styles.main}>
          <Announcement />
          {children}
        </main>
        <Footer />
      </div>
    </AnnouncementProvider>
  );
}
