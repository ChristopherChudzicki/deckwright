import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../api/database.types";

const STORAGE_KEY = "dndCards.pendingAnonImport";

export type PendingAnonImport = {
  version: 2;
  anonDeckIds: string[];
  importedDeckIds: string[];
};

export function stash(payload: PendingAnonImport): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clear(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function readPending(): PendingAnonImport | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number };
    if (parsed.version !== 2) return null;
    return parsed as PendingAnonImport;
  } catch {
    return null;
  }
}

export type ResumeResult =
  | { kind: "noop" }
  | { kind: "completed"; importedCount: number }
  | { kind: "partial"; importedCount: number; total: number };

export async function tryResume(args: {
  supabase: SupabaseClient<Database>;
  currentUserId: string;
  onProgress?: (imported: number, total: number) => void;
}): Promise<ResumeResult> {
  const pending = readPending();
  if (!pending) return { kind: "noop" };
  if (pending.anonDeckIds.length === 0) {
    clear();
    return { kind: "completed", importedCount: 0 };
  }

  const total = pending.anonDeckIds.length;
  let imported = pending.importedDeckIds.length;
  args.onProgress?.(imported, total);

  for (const deckId of pending.anonDeckIds) {
    if (pending.importedDeckIds.includes(deckId)) continue;

    const { data: oldDeck, error: deckError } = await args.supabase
      .rpc("get_public_deck", { deck_id: deckId })
      .maybeSingle();
    if (deckError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }
    if (!oldDeck) {
      // Anon deck deleted between stash and resume — mark as imported and continue.
      pending.importedDeckIds.push(deckId);
      imported += 1;
      stash(pending);
      args.onProgress?.(imported, total);
      continue;
    }

    const { data: newDeck, error: insertDeckError } = await args.supabase
      .from("decks")
      .insert({ owner_id: args.currentUserId, name: oldDeck.name })
      .select()
      .single();
    if (insertDeckError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    const { data: cards, error: cardsError } = await args.supabase.rpc("get_public_deck_cards", {
      deck_id: deckId,
    });
    if (cardsError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    const cardRows = cards ?? [];
    if (cardRows.length > 0) {
      const rows = cardRows.map((c) => ({
        deck_id: newDeck.id,
        position: c.position,
        payload: c.payload,
      }));
      const { error: insertCardsError } = await args.supabase.from("cards").insert(rows);
      if (insertCardsError) {
        stash(pending);
        return { kind: "partial", importedCount: imported, total };
      }
    }

    pending.importedDeckIds.push(deckId);
    imported += 1;
    stash(pending);
    args.onProgress?.(imported, total);
  }

  clear();
  return { kind: "completed", importedCount: imported };
}
