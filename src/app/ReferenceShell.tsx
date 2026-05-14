import { Link, Outlet } from "@tanstack/react-router";
import styles from "./ReferenceShell.module.css";

export function ReferenceShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          Deckwright
        </Link>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
