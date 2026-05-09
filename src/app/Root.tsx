import { Link, Outlet } from "@tanstack/react-router";
import { Announcement, AnnouncementProvider } from "../lib/ui/Announcement";
import { GitHubLogo } from "../lib/ui/icons/GitHubLogo";
import { UserMenu } from "../lib/ui/UserMenu";
import { DeckBreadcrumb } from "./DeckBreadcrumb";
import styles from "./root.module.css";

const REPO_URL = "https://github.com/ChristopherChudzicki/dnd-cards";

export function Root() {
  return (
    <AnnouncementProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link to="/" className={styles.brand}>
            D&amp;D Cards
          </Link>
          <DeckBreadcrumb />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.iconLink}
            aria-label="View source on GitHub"
          >
            <GitHubLogo size={20} />
          </a>
          <UserMenu />
        </header>
        <main className={styles.main}>
          <Announcement />
          <Outlet />
        </main>
      </div>
    </AnnouncementProvider>
  );
}
