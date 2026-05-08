import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY = "dndCards.pendingAnonImport";

export type PendingAnonImport = {
  version: 1;
  anonUuid: string;
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
    if (parsed.version !== 1) return null;
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
  supabase: SupabaseClient;
  currentUserId: string;
  onProgress?: (imported: number, total: number) => void;
}): Promise<ResumeResult> {
  const pending = readPending();
  if (!pending) return { kind: "noop" };

  const { data: anonDecks, error: deckError } = await args.supabase
    .from("decks")
    .select("id, name")
    .eq("owner_id", pending.anonUuid);
  if (deckError) throw deckError;
  if (!anonDecks || anonDecks.length === 0) {
    clear();
    return { kind: "completed", importedCount: 0 };
  }

  const total = anonDecks.length;
  let imported = pending.importedDeckIds.length;
  args.onProgress?.(imported, total);

  for (const deck of anonDecks as Array<{ id: string; name: string }>) {
    if (pending.importedDeckIds.includes(deck.id)) continue;

    const { data: newDeck, error: insertDeckError } = await args.supabase
      .from("decks")
      .insert({ owner_id: args.currentUserId, name: deck.name })
      .select()
      .single();
    if (insertDeckError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    const { data: cards, error: cardsError } = await args.supabase
      .from("cards")
      .select("position, payload")
      .eq("deck_id", deck.id);
    if (cardsError) {
      stash(pending);
      return { kind: "partial", importedCount: imported, total };
    }

    if (cards && cards.length > 0) {
      const rows = (cards as Array<{ position: number; payload: unknown }>).map((c) => ({
        deck_id: (newDeck as { id: string }).id,
        position: c.position,
        payload: c.payload,
      }));
      const { error: insertCardsError } = await args.supabase.from("cards").insert(rows);
      if (insertCardsError) {
        stash(pending);
        return { kind: "partial", importedCount: imported, total };
      }
    }

    pending.importedDeckIds.push(deck.id);
    imported += 1;
    stash(pending);
    args.onProgress?.(imported, total);
  }

  clear();
  return { kind: "completed", importedCount: imported };
}
