import styles from "./FramedIcon.module.css";
import { ResolvedIcon } from "./resolveIcon";

type Props = { kind: "item" | "spell"; iconKey: string };

export function FramedIcon({ kind, iconKey }: Props) {
  const isSpell = kind === "spell";
  return (
    <>
      <svg
        className={styles.frame}
        viewBox="0 0 100 100"
        aria-hidden="true"
        data-testid="card-icon-frame"
        data-frame={isSpell ? "hex" : "square"}
      >
        {isSpell ? (
          <polygon
            points="20,8 80,8 96,50 80,92 20,92 4,50"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        ) : (
          <rect
            x="3"
            y="3"
            width="94"
            height="94"
            rx="14"
            ry="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        )}
      </svg>
      <div className={`${styles.glyph} ${isSpell ? styles.glyphSpell : ""}`}>
        <ResolvedIcon iconKey={iconKey} />
      </div>
    </>
  );
}
