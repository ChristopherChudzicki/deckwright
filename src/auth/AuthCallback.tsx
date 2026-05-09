import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "../api/supabase";
import { pluralize } from "../lib/pluralize";
import { useSetNextAnnouncement } from "../lib/ui/Announcement";
import { clear, readPending, stash, tryResume } from "./anonImport";
import { ImportAccountDialog } from "./ImportAccountDialog";
import { readNextFromUrl } from "./safeNext";
import { useSession } from "./useSession";

function parseLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("error_code") ?? search.get("error_code");
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
    let cancelled = false;

    const linkError = parseLinkError();
    if (linkError === "identity_already_exists" && session.user.is_anonymous) {
      void (async () => {
        const { data } = await supabase.rpc("list_my_decks");
        if (cancelled) return;
        setDeckCount(data?.length ?? 0);
        setPhase("dialog");
      })();
      return () => {
        cancelled = true;
      };
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
            onProgress: (imported, total) => {
              if (cancelled) return;
              setProgress({ imported, total });
            },
          });
          if (cancelled) return;
          if (result.kind === "completed" && result.importedCount > 0) {
            setAnnouncement(`Imported ${pluralize(result.importedCount, "deck")}`);
          } else if (result.kind === "partial") {
            setAnnouncement(
              `Imported ${result.importedCount} of ${pluralize(result.total, "deck")}. We'll try again next time you sign in.`,
            );
          }
          window.localStorage.removeItem("dndCards.lastProvider");
          navigate({ to: readNextFromUrl() });
        } catch {
          if (cancelled) return;
          setAnnouncement(
            "Couldn't finish importing your decks. We'll try again next time you sign in.",
          );
          navigate({ to: readNextFromUrl() });
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!session.user.is_anonymous) {
      setAnnouncement("Signed in");
      window.localStorage.removeItem("dndCards.lastProvider");
    }
    navigate({ to: readNextFromUrl() });
    return () => {
      cancelled = true;
    };
  }, [session, navigate, setAnnouncement]);

  const onImport = async () => {
    if (session.status !== "authenticated") return;
    const { data: anonDecks, error: listError } = await supabase.rpc("list_my_decks");
    if (listError) {
      setErrorMessage("Couldn't start the import. Please try again.");
      setPhase("error");
      return;
    }
    const anonDeckIds = (anonDecks ?? []).map((d: { id: string }) => d.id);
    stash({ version: 2, anonDeckIds, importedDeckIds: [] });
    const next = readNextFromUrl();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const provider = lastProvider();
    await supabase.auth.signOut();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  };

  const onSkip = async () => {
    clear();
    const next = readNextFromUrl();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const provider = lastProvider();
    await supabase.auth.signOut();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  };

  const onCancel = () => {
    // The anon session is preserved by linkIdentity failures, so dismissing
    // the dialog returns the user to their anon home with decks intact.
    window.localStorage.removeItem("dndCards.lastProvider");
    navigate({ to: "/" });
  };

  if (phase === "dialog") {
    return (
      <ImportAccountDialog
        isOpen
        deckCount={deckCount}
        onImport={onImport}
        onSkip={onSkip}
        onCancel={onCancel}
      />
    );
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
        <p>
          <Link to="/login">Back to sign-in</Link>
        </p>
      </section>
    );
  }

  return (
    <section style={{ textAlign: "center", padding: "4rem" }}>
      <p>Signing you in…</p>
    </section>
  );
}
