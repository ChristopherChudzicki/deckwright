import { GitHubLogo } from "../lib/ui/icons/GitHubLogo";
import styles from "./Footer.module.css";

const REPO_URL = "https://github.com/ChristopherChudzicki/deckwright";
const OPEN5E_URL = "https://open5e.com";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>
        <GitHubLogo size={16} />
        <span>View source on GitHub</span>
      </a>
      <span className={styles.separator} aria-hidden="true">
        ·
      </span>
      <a href={OPEN5E_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>
        SRD data via Open5e
      </a>
    </footer>
  );
}
