import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./Announcement.module.css";

const AUTO_DISMISS_MS = 5000;

type Slot = { message: string | null };
type Subscriber = () => void;

type ContextValue = {
  slotRef: { current: Slot };
  subscribe: (fn: Subscriber) => () => void;
  setNext: (message: string | null) => void;
};

const AnnouncementContext = createContext<ContextValue | null>(null);

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const slotRef = useRef<Slot>({ message: null });
  const subsRef = useRef<Set<Subscriber>>(new Set());
  const value = useRef<ContextValue>({
    slotRef,
    subscribe: (fn) => {
      subsRef.current.add(fn);
      return () => {
        subsRef.current.delete(fn);
      };
    },
    setNext: (message) => {
      slotRef.current.message = message;
      for (const fn of subsRef.current) fn();
    },
  }).current;
  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>;
}

export function useSetNextAnnouncement() {
  const ctx = useContext(AnnouncementContext);
  if (!ctx) {
    throw new Error("useSetNextAnnouncement must be used inside <AnnouncementProvider>");
  }
  return useCallback(
    (message: string | null) => {
      ctx.setNext(message);
    },
    [ctx],
  );
}

export function Announcement() {
  const ctx = useContext(AnnouncementContext);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const consume = () => {
      const queued = ctx.slotRef.current.message;
      if (queued) {
        setMessage(queued);
        ctx.slotRef.current.message = null;
      }
    };
    consume();
    return ctx.subscribe(consume);
  }, [ctx]);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [message]);

  if (!message) return null;
  return (
    <div className={styles.root} role="status" aria-live="polite">
      <span className={styles.message}>{message}</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss announcement"
        onClick={() => setMessage(null)}
      >
        ✕
      </button>
    </div>
  );
}
