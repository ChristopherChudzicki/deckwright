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
        // pick up on the next listener invocation.
        void supabase.auth.signInAnonymously();
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
