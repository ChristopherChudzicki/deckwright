import { Link, Outlet } from "@tanstack/react-router";
import { Announcement, AnnouncementProvider } from "../lib/ui/Announcement";
import { UserMenu } from "../lib/ui/UserMenu";
import { DeckBreadcrumb } from "./DeckBreadcrumb";
import { Footer } from "./Footer";
import styles from "./root.module.css";

export function Root() {
  return (
    <AnnouncementProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link to="/" className={styles.brand}>
            D&amp;D Cards
          </Link>
          <DeckBreadcrumb />
          <UserMenu />
        </header>
        <main className={styles.main}>
          <Announcement />
          <Outlet />
        </main>
        <Footer />
      </div>
    </AnnouncementProvider>
  );
}
