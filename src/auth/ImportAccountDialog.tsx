import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import styles from "./ImportAccountDialog.module.css";

type Props = {
  isOpen: boolean;
  deckCount: number;
  onImport: () => void;
  onSkip: () => void;
};

export function ImportAccountDialog({ isOpen, deckCount, onImport, onSkip }: Props) {
  if (!isOpen) return null;
  return (
    <DialogShell
      isOpen={isOpen}
      onOpenChange={() => {}}
      aria-label="You already have a dnd-cards account"
    >
      {({ close }) => (
        <>
          <DialogHeader title="You already have a dnd-cards account" onClose={close} />
          <div className={styles.body}>
            <p>
              An account on dnd-cards is already linked to that identity. Want to bring your{" "}
              {deckCount} decks into that account?
            </p>
            <p className={styles.warning}>
              If you skip, those decks will be left behind. They cannot be recovered.
            </p>
          </div>
          <div className={styles.actions}>
            <Button variant="primary" onPress={onImport}>
              Yes, import {deckCount} decks
            </Button>
            <button type="button" className={styles.skip} onClick={onSkip}>
              Skip — leave decks behind
            </button>
          </div>
        </>
      )}
    </DialogShell>
  );
}
