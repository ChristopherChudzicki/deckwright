import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import styles from "./ReferenceShell.module.css";

export function ReferenceShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          Deckwright
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
