import { pluralize } from "../lib/pluralize";
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
      onOpenChange={(open) => {
        if (!open) onSkip();
      }}
      aria-label="You already have a dnd-cards account"
    >
      {() => (
        <>
          <DialogHeader title="You already have a dnd-cards account" onClose={onSkip} />
          <div className={styles.body}>
            <p>
              An account on dnd-cards is already linked to that identity. Want to bring your{" "}
              {pluralize(deckCount, "deck")} into that account?
            </p>
            <p className={styles.warning}>
              <strong>Heads up:</strong> if you skip, those decks will be left behind. They cannot
              be recovered.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.skip} onClick={onSkip}>
              Skip — leave decks behind
            </button>
            <Button variant="primary" onPress={onImport}>
              Yes, import {pluralize(deckCount, "deck")}
            </Button>
          </div>
        </>
      )}
    </DialogShell>
  );
}
