import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export type SessionState =
  | { status: "loading"; user: null; session: null }
  | { status: "unauthenticated"; user: null; session: null }
  | { status: "authenticated"; user: User; session: Session };

export const SessionContext = createContext<SessionState | undefined>(undefined);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error(
      "useSession must be used within an <AuthProvider>. Routes under the `reference` " +
        "layout intentionally have no AuthProvider — don't consume useSession there.",
    );
  }
  return ctx;
}
