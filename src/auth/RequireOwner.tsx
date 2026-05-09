import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useDeck } from "../decks/queries";
import { useSession } from "./useSession";

type Props = { deckId: string; children: ReactNode };

export function RequireOwner({ deckId, children }: Props) {
  const session = useSession();
  const deckQuery = useDeck(deckId);
  const navigate = useNavigate();

  const sessionLoading = session.status === "loading";
  const userId = session.status === "authenticated" ? session.user.id : null;
  const isOwner = deckQuery.data?.is_owner;

  useEffect(() => {
    if (sessionLoading || deckQuery.isLoading) return;

    if (!userId) {
      const next = `${window.location.pathname}${window.location.search}`;
      navigate({ to: "/login", search: { next } });
      return;
    }
    if (isOwner === false) {
      navigate({ to: "/deck/$deckId", params: { deckId } });
    }
  }, [sessionLoading, deckQuery.isLoading, userId, isOwner, deckId, navigate]);

  if (sessionLoading || deckQuery.isLoading) return null;
  if (!userId) return null;
  if (isOwner !== true) return null;
  return <>{children}</>;
}
