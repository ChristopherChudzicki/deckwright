import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "../api/supabase";
import { decksKey } from "../decks/queries";
import { pluralize } from "../lib/pluralize";
import { useSetNextAnnouncement } from "../lib/ui/Announcement";
import { OAuthButton } from "../lib/ui/OAuthButton";
import { clear, stash, tryResume } from "./anonImport";
import { ImportAccountDialog } from "./ImportAccountDialog";
import styles from "./LoginView.module.css";
import { readNextFromUrl } from "./safeNext";
import { useSession } from "./useSession";

const DEV_EMAIL = "dev@local";
const DEV_PASSWORD = "devpass";

export function LoginView() {
  const navigate = useNavigate();
  const session = useSession();
  const queryClient = useQueryClient();
  const setAnnouncement = useSetNextAnnouncement();
  const [pending, setPending] = useState<"google" | "github" | "dev" | null>(null);
  const [importPrompt, setImportPrompt] = useState<{
    deckCount: number;
    anonUuid: string;
  } | null>(null);

  const isAnon = session.status === "authenticated" && session.user.is_anonymous === true;
  const userId = session.status === "authenticated" ? session.user.id : null;

  const signIn = async (provider: "google" | "github") => {
    if (pending !== null) return;
    setPending(provider);
    try {
      const next = readNextFromUrl();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      if (isAnon && userId) {
        const decks = await queryClient.fetchQuery({
          queryKey: decksKey(userId),
          queryFn: async () => {
            const { data } = await supabase.from("decks").select("id").eq("owner_id", userId);
            return data ?? [];
          },
          staleTime: 0,
        });
        if ((decks?.length ?? 0) > 0) {
          window.localStorage.setItem("dndCards.lastProvider", provider);
          await supabase.auth.linkIdentity({ provider, options: { redirectTo } });
          return;
        }
      }
      await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    } catch {
      setPending(null);
    }
  };

  const switchToExistingDevAccount = async (next: string) => {
    await supabase.auth.signOut();
    await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
    navigate({ to: next });
  };

  const devSignIn = async () => {
    if (pending !== null) return;
    setPending("dev");
    const next = readNextFromUrl();
    if (isAnon && userId) {
      // Supabase rejects setting a password on an anon user before the email
      // lands, so update email first, then password.
      const { error: emailError } = await supabase.auth.updateUser({ email: DEV_EMAIL });
      if (emailError) {
        // Email is taken — an existing dev account already exists. Mirror the
        // OAuth identity_already_exists flow: if the anon has decks, prompt
        // to import them; otherwise switch silently.
        const { data: decks } = await supabase.from("decks").select("id").eq("owner_id", userId);
        const deckCount = decks?.length ?? 0;
        if (deckCount > 0) {
          setImportPrompt({ deckCount, anonUuid: userId });
          return;
        }
        await switchToExistingDevAccount(next);
        return;
      }
      const { error: pwError } = await supabase.auth.updateUser({ password: DEV_PASSWORD });
      if (pwError) {
        await switchToExistingDevAccount(next);
        return;
      }
      navigate({ to: next });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });
    if (error?.message === "Invalid login credentials") {
      // First run on this local DB — create the user. With
      // enable_confirmations=false (set in supabase/config.toml),
      // signUp establishes a session immediately.
      await supabase.auth.signUp({ email: DEV_EMAIL, password: DEV_PASSWORD });
    }
    // OAuth providers route back through /auth/callback which navigates;
    // dev sign-in is direct, so navigate manually.
    navigate({ to: next });
  };

  const onImportConfirm = async () => {
    if (!importPrompt) return;
    const { anonUuid } = importPrompt;
    setImportPrompt(null);
    const next = readNextFromUrl();
    stash({ version: 1, anonUuid, importedDeckIds: [] });
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });
    if (error || !data?.user) {
      setAnnouncement("Couldn't sign in to existing dev account.");
      navigate({ to: next });
      return;
    }
    try {
      const result = await tryResume({ supabase, currentUserId: data.user.id });
      if (result.kind === "completed" && result.importedCount > 0) {
        setAnnouncement(`Imported ${pluralize(result.importedCount, "deck")}`);
      } else if (result.kind === "partial") {
        setAnnouncement(
          `Imported ${result.importedCount} of ${pluralize(result.total, "deck")}. We'll try again next time you sign in.`,
        );
      }
    } catch {
      setAnnouncement(
        "Couldn't finish importing your decks. We'll try again next time you sign in.",
      );
    }
    navigate({ to: next });
  };

  const onImportSkip = async () => {
    setImportPrompt(null);
    clear();
    await switchToExistingDevAccount(readNextFromUrl());
  };

  const heading = isAnon ? "Save your work to your account" : "Sign in";
  const copy = isAnon
    ? "Sign in to save your decks to your account, where you can access them from any device."
    : "Sign in to create and edit decks. Anyone can view shared decks via link.";

  return (
    <section className={styles.login} aria-labelledby="signin-heading">
      <h1 id="signin-heading">{heading}</h1>
      <p className={styles.copy}>{copy}</p>
      {/* biome-ignore lint/a11y/noRedundantRoles: required because list-style:none strips the implicit list role in WebKit */}
      <ul className={styles.providers} role="list">
        {import.meta.env.VITE_AUTH_GOOGLE_ENABLED === "true" && (
          <li>
            <OAuthButton
              provider="google"
              onPress={() => void signIn("google")}
              isDisabled={pending !== null && pending !== "google"}
              isPending={pending === "google"}
            />
          </li>
        )}
        {import.meta.env.VITE_AUTH_GITHUB_ENABLED === "true" && (
          <li>
            <OAuthButton
              provider="github"
              onPress={() => void signIn("github")}
              isDisabled={pending !== null && pending !== "github"}
              isPending={pending === "github"}
            />
          </li>
        )}
        {import.meta.env.DEV && (
          <li>
            <OAuthButton
              provider="dev"
              onPress={() => void devSignIn()}
              isDisabled={pending !== null && pending !== "dev"}
              isPending={pending === "dev"}
            />
          </li>
        )}
      </ul>
      {importPrompt && (
        <ImportAccountDialog
          isOpen
          deckCount={importPrompt.deckCount}
          onImport={() => void onImportConfirm()}
          onSkip={() => void onImportSkip()}
        />
      )}
    </section>
  );
}
