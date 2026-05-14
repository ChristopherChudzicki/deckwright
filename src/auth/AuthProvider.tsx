import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "../api/supabase";
import { isAnonUsersEnabled } from "../lib/anonEnabled";
import { SessionContext, type SessionState } from "./useSession";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: "loading",
    user: null,
    session: null,
  });

  useEffect(() => {
    // `cancelled` short-circuits the listener after cleanup runs. Under React
    // StrictMode the effect mounts → cleans up → mounts again; the first
    // mount's async INITIAL_SESSION handler must not fire signInAnonymously
    // after its cleanup. App.test.tsx asserts signInAnonymously is called
    // exactly once — that count depends on this guard.
    let cancelled = false;
    const anonEnabled = isAnonUsersEnabled();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session) {
        setState({ status: "authenticated", user: session.user, session });
        return;
      }
      if (event === "INITIAL_SESSION" && anonEnabled) {
        // Stay "loading"; signInAnonymously will fire SIGNED_IN, which we'll
        // pick up on the next listener invocation. If it fails (e.g. server
        // has anon sign-ins disabled), fall back to "unauthenticated" so the
        // app doesn't deadlock at the loading screen.
        void supabase.auth.signInAnonymously().then((result) => {
          if (cancelled) return;
          if (result.error) {
            setState({ status: "unauthenticated", user: null, session: null });
          }
        });
        return;
      }
      setState({ status: "unauthenticated", user: null, session: null });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
