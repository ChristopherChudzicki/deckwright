import { Link } from "@tanstack/react-router";
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import styles from "./FirstDeckDialog.module.css";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FirstDeckDialog({ isOpen, onOpenChange }: Props) {
  if (!isOpen) return null;
  return (
    <DialogShell
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      aria-label="Your decks live on this browser"
    >
      {({ close }) => (
        <>
          <DialogHeader title="Your decks live on this browser" onClose={close} />
          <div className={styles.body}>
            <p>
              You're not signed in, so your decks only exist on this device. If you clear browsing
              data, switch browsers, or don't visit for 30 days, your decks may be lost.
            </p>
            <p>Link an account to save decks permanently and from any device.</p>
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" onPress={close}>
              Not yet
            </Button>
            <Link to="/login" className={styles.primary}>
              Sign in now
            </Link>
          </div>
        </>
      )}
    </DialogShell>
  );
}
