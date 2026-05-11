import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../api/database.types";
import { clear, type PendingAnonImport, readPending, stash, tryResume } from "./anonImport";

describe("anonImport storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is stashed", () => {
    expect(readPending()).toBeNull();
  });

  it("round-trips a v2 payload", () => {
    const payload: PendingAnonImport = {
      version: 2,
      anonDeckIds: ["d1", "d2"],
      importedDeckIds: [],
    };
    stash(payload);
    expect(readPending()).toEqual(payload);
  });

  it("clears the stashed payload", () => {
    stash({ version: 2, anonDeckIds: ["d1"], importedDeckIds: [] });
    clear();
    expect(readPending()).toBeNull();
  });

  it("returns null and does not throw on a malformed value", () => {
    window.localStorage.setItem("dndCards.pendingAnonImport", "not json");
    expect(readPending()).toBeNull();
  });

  it("returns null on a stashed v1 payload (silently dropped)", () => {
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({
        version: 1,
        anonUuid: "00000000-0000-0000-0000-000000000001",
        importedDeckIds: [],
      }),
    );
    expect(readPending()).toBeNull();
  });

  it("returns null on a stashed value with an unknown version", () => {
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({ version: 999, anonDeckIds: [], importedDeckIds: [] }),
    );
    expect(readPending()).toBeNull();
  });
});

type FakeSupabase = {
  deckById: Record<string, { id: string; name: string } | null>;
  cardsByDeck: Record<
    string,
    Array<{ id: string; deck_id: string; position: number; payload: unknown }>
  >;
  inserts: { decks: unknown[]; cards: unknown[] };
  insertResults?: { table: string; error: Error | null }[];
};

function makeFakeSupabase(initial: FakeSupabase) {
  let insertCallCount = 0;
  const fake = {
    rpc(name: string, params?: { deck_id?: string }) {
      if (name === "get_public_deck") {
        const id = params?.deck_id ?? "";
        const row = initial.deckById[id] ?? null;
        return {
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        };
      }
      if (name === "get_public_deck_cards") {
        const id = params?.deck_id ?? "";
        const rows = initial.cardsByDeck[id] ?? [];
        return Promise.resolve({ data: rows, error: null });
      }
      throw new Error(`unmocked rpc: ${name}`);
    },
    from(table: string) {
      return {
        insert(rows: unknown) {
          initial.inserts[table as "decks" | "cards"].push(rows);
          const callNum = insertCallCount++;
          const resultConfig = initial.insertResults?.[callNum];
          if (resultConfig?.error) {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: null, error: resultConfig.error }),
              }),
            };
          }
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: "new-deck-id", ...(Array.isArray(rows) ? rows[0] : rows) },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
  // Hand-rolled mock implements only the surface tryResume touches; the
  // double-cast bridges to SupabaseClient<Database> without dragging in
  // the full client interface.
  return {
    state: initial,
    client: fake as unknown as SupabaseClient<Database>,
  };
}

describe("tryResume", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clones each anon deck and its cards under the new user, then clears the key", async () => {
    stash({ version: 2, anonDeckIds: ["d1"], importedDeckIds: [] });
    const fake = makeFakeSupabase({
      deckById: { d1: { id: "d1", name: "Goblins" } },
      cardsByDeck: {
        d1: [{ id: "c1", deck_id: "d1", position: 0, payload: { kind: "item", name: "Sword" } }],
      },
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake.client, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(1);
    expect(fake.state.inserts.cards).toHaveLength(1);
    expect(readPending()).toBeNull();
  });

  it("skips decks already in importedDeckIds (resumable)", async () => {
    stash({ version: 2, anonDeckIds: ["d1", "d2"], importedDeckIds: ["d1"] });
    const fake = makeFakeSupabase({
      deckById: {
        d1: { id: "d1", name: "Done" },
        d2: { id: "d2", name: "Pending" },
      },
      cardsByDeck: { d2: [{ id: "c2", deck_id: "d2", position: 0, payload: {} }] },
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake.client, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(1);
  });

  it("skips a deck that was deleted between stash and resume", async () => {
    stash({ version: 2, anonDeckIds: ["missing"], importedDeckIds: [] });
    const fake = makeFakeSupabase({
      deckById: { missing: null },
      cardsByDeck: {},
      inserts: { decks: [], cards: [] },
    });
    const result = await tryResume({ supabase: fake.client, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(0);
    expect(result).toEqual({ kind: "completed", importedCount: 1 });
    expect(readPending()).toBeNull();
  });

  it("treats an empty anonDeckIds list as already-completed and clears the key", async () => {
    stash({ version: 2, anonDeckIds: [], importedDeckIds: [] });
    const fake = makeFakeSupabase({
      deckById: {},
      cardsByDeck: {},
      inserts: { decks: [], cards: [] },
    });
    const result = await tryResume({ supabase: fake.client, currentUserId: "real-1" });
    expect(result).toEqual({ kind: "completed", importedCount: 0 });
    expect(readPending()).toBeNull();
  });

  it("is a no-op when there is no pending import", async () => {
    const fake = makeFakeSupabase({
      deckById: {},
      cardsByDeck: {},
      inserts: { decks: [], cards: [] },
    });
    const result = await tryResume({ supabase: fake.client, currentUserId: "real-1" });
    expect(result).toEqual({ kind: "noop" });
  });

  it("returns partial and re-stashes when deck insert fails mid-loop", async () => {
    stash({ version: 2, anonDeckIds: ["d1", "d2"], importedDeckIds: [] });
    const fake = makeFakeSupabase({
      deckById: {
        d1: { id: "d1", name: "First" },
        d2: { id: "d2", name: "Second" },
      },
      cardsByDeck: {},
      inserts: { decks: [], cards: [] },
      insertResults: [
        { table: "decks", error: null },
        { table: "decks", error: new Error("boom") },
      ],
    });
    const result = await tryResume({ supabase: fake.client, currentUserId: "real-1" });
    expect(result).toEqual({ kind: "partial", importedCount: 1, total: 2 });
    const stashed = readPending();
    expect(stashed).not.toBeNull();
    expect(stashed?.importedDeckIds).toEqual(["d1"]);
  });
});
