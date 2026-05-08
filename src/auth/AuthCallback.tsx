import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "../api/supabase";
import { useSetNextAnnouncement } from "../lib/ui/Announcement";
import { clear, readPending, stash, tryResume } from "./anonImport";
import { ImportAccountDialog } from "./ImportAccountDialog";
import { useSession } from "./useSession";

function parseLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("error_code") ?? search.get("error_code");
}

function getNextPath(): string {
  return new URLSearchParams(window.location.search).get("next") ?? "/";
}

function lastProvider(): "google" | "github" {
  const v = window.localStorage.getItem("dndCards.lastProvider");
  return v === "github" ? "github" : "google";
}

export function AuthCallback() {
  const navigate = useNavigate();
  const session = useSession();
  const setAnnouncement = useSetNextAnnouncement();

  const [phase, setPhase] = useState<"checking" | "importing" | "dialog" | "error">("checking");
  const [deckCount, setDeckCount] = useState(0);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "authenticated") return;

    const linkError = parseLinkError();
    if (linkError === "identity_already_exists" && session.user.is_anonymous) {
      void (async () => {
        const { data } = await supabase.from("decks").select("id").eq("owner_id", session.user.id);
        setDeckCount(data?.length ?? 0);
        setPhase("dialog");
      })();
      return;
    }

    if (linkError) {
      setErrorMessage("Sign-in didn't complete. Please try again.");
      setPhase("error");
      return;
    }

    const pending = readPending();
    if (pending && !session.user.is_anonymous) {
      setPhase("importing");
      void (async () => {
        try {
          const result = await tryResume({
            supabase,
            currentUserId: session.user.id,
            onProgress: (imported, total) => setProgress({ imported, total }),
          });
          if (result.kind === "completed" && result.importedCount > 0) {
            setAnnouncement(`Imported ${result.importedCount} decks`);
          } else if (result.kind === "partial") {
            setAnnouncement(
              `Imported ${result.importedCount} of ${result.total} decks. We'll try again next time you sign in.`,
            );
          }
          window.localStorage.removeItem("dndCards.lastProvider");
          navigate({ to: getNextPath() });
        } catch {
          setAnnouncement(
            "Couldn't finish importing your decks. We'll try again next time you sign in.",
          );
          navigate({ to: getNextPath() });
        }
      })();
      return;
    }

    if (!session.user.is_anonymous) {
      setAnnouncement("Signed in");
      window.localStorage.removeItem("dndCards.lastProvider");
    }
    navigate({ to: getNextPath() });
  }, [session, navigate, setAnnouncement]);

  const onImport = async () => {
    if (session.status !== "authenticated") return;
    stash({ version: 1, anonUuid: session.user.id, importedDeckIds: [] });
    const next = getNextPath();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const provider = lastProvider();
    await supabase.auth.signOut();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  };

  const onSkip = async () => {
    clear();
    const next = getNextPath();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const provider = lastProvider();
    await supabase.auth.signOut();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  };

  if (phase === "dialog") {
    return <ImportAccountDialog isOpen deckCount={deckCount} onImport={onImport} onSkip={onSkip} />;
  }

  if (phase === "importing") {
    return (
      <section style={{ textAlign: "center", padding: "4rem" }} role="status" aria-live="polite">
        <h2>Bringing your decks over</h2>
        <p>
          Imported {progress.imported} of {progress.total} decks…
        </p>
      </section>
    );
  }

  if (phase === "error") {
    return (
      <section style={{ textAlign: "center", padding: "4rem" }}>
        <p>{errorMessage}</p>
      </section>
    );
  }

  return (
    <section style={{ textAlign: "center", padding: "4rem" }}>
      <p>Signing you in…</p>
    </section>
  );
}
