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
              You're not signed in, so your new deck only exists here on this device — not on your
              phone, your other laptop, or anywhere else. Sign in any time to save your decks to
              your account, where you can access them from any device.
            </p>
            <p>
              Otherwise, your decks may be lost if you clear browsing data, switch browsers, or
              don't visit for 30 days.
            </p>
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
