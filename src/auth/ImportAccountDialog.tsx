import { useState } from "react";
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
  onCancel: () => void;
};

export function ImportAccountDialog({ isOpen, deckCount, onImport, onSkip, onCancel }: Props) {
  // Both onImport and onSkip kick off network work + a redirect. A fast
  // double-click before the parent unmounts the dialog would otherwise fire
  // two parallel imports — disable both buttons after either one is pressed.
  const [pressed, setPressed] = useState(false);
  if (!isOpen) return null;
  const handleImport = () => {
    if (pressed) return;
    setPressed(true);
    onImport();
  };
  const handleSkip = () => {
    if (pressed) return;
    setPressed(true);
    onSkip();
  };
  return (
    <DialogShell
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      aria-label="You already have a dnd-cards account"
    >
      {() => (
        <>
          <DialogHeader
            title="You already have a dnd-cards account"
            onClose={onCancel}
            closeLabel="Cancel"
          />
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
            <button type="button" className={styles.skip} onClick={handleSkip} disabled={pressed}>
              Skip — leave decks behind
            </button>
            <Button variant="primary" onPress={handleImport} isDisabled={pressed}>
              Yes, import {pluralize(deckCount, "deck")}
            </Button>
          </div>
        </>
      )}
    </DialogShell>
  );
}
