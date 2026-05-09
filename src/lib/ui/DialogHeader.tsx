import type { ReactNode } from "react";
import { Button } from "./Button";
import styles from "./DialogHeader.module.css";
import { IconButton } from "./IconButton";
import { XIcon } from "./icons/XIcon";

export type DialogHeaderProps = {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children?: ReactNode;
};

export function DialogHeader({ title, onClose, closeLabel, children }: DialogHeaderProps) {
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {children !== undefined && <div className={styles.slot}>{children}</div>}
      {closeLabel ? (
        <Button variant="secondary" size="sm" onPress={onClose}>
          <XIcon size={16} /> {closeLabel}
        </Button>
      ) : (
        <IconButton aria-label="Close" onPress={onClose}>
          <XIcon size={20} />
        </IconButton>
      )}
    </header>
  );
}
