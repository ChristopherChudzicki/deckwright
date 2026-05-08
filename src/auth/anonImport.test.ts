import { beforeEach, describe, expect, it } from "vitest";
import { clear, type PendingAnonImport, readPending, stash, tryResume } from "./anonImport";

describe("anonImport storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is stashed", () => {
    expect(readPending()).toBeNull();
  });

  it("round-trips a stashed payload", () => {
    const payload: PendingAnonImport = {
      version: 1,
      anonUuid: "00000000-0000-0000-0000-000000000001",
      importedDeckIds: [],
    };
    stash(payload);
    expect(readPending()).toEqual(payload);
  });

  it("clears the stashed payload", () => {
    stash({ version: 1, anonUuid: "x", importedDeckIds: [] });
    clear();
    expect(readPending()).toBeNull();
  });

  it("returns null and does not throw on a malformed value", () => {
    window.localStorage.setItem("dndCards.pendingAnonImport", "not json");
    expect(readPending()).toBeNull();
  });

  it("returns null on a stashed value with an unknown version", () => {
    window.localStorage.setItem(
      "dndCards.pendingAnonImport",
      JSON.stringify({ version: 999, anonUuid: "x", importedDeckIds: [] }),
    );
    expect(readPending()).toBeNull();
  });
});

type FakeSupabase = {
  decks: { ownerId: string; id: string; name: string }[];
  cards: { id: string; deck_id: string; position: number; payload: unknown }[];
  inserts: { decks: unknown[]; cards: unknown[] };
};

function makeFakeSupabase(initial: FakeSupabase) {
  return {
    state: initial,
    from(table: string) {
      const state = initial;
      return {
        select() {
          return {
            eq(_col: string, val: string) {
              if (table === "decks") {
                return Promise.resolve({
                  data: state.decks
                    .filter((d) => d.ownerId === val)
                    .map((d) => ({ id: d.id, owner_id: d.ownerId, name: d.name })),
                  error: null,
                });
              }
              if (table === "cards") {
                return Promise.resolve({
                  data: state.cards.filter((c) => c.deck_id === val),
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
        insert(rows: unknown) {
          state.inserts[table as "decks" | "cards"].push(rows);
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
}

describe("tryResume", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clones each anon-owned deck and its cards under the new user, then clears the key", async () => {
    stash({ version: 1, anonUuid: "anon-1", importedDeckIds: [] });
    const fake = makeFakeSupabase({
      decks: [{ ownerId: "anon-1", id: "d1", name: "Goblins" }],
      cards: [{ id: "c1", deck_id: "d1", position: 0, payload: { kind: "item", name: "Sword" } }],
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(1);
    expect(fake.state.inserts.cards).toHaveLength(1);
    expect(readPending()).toBeNull();
  });

  it("skips decks already in importedDeckIds (resumable)", async () => {
    stash({ version: 1, anonUuid: "anon-1", importedDeckIds: ["d1"] });
    const fake = makeFakeSupabase({
      decks: [
        { ownerId: "anon-1", id: "d1", name: "Done" },
        { ownerId: "anon-1", id: "d2", name: "Pending" },
      ],
      cards: [{ id: "c2", deck_id: "d2", position: 0, payload: {} }],
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(1);
  });

  it("treats zero-rows as already-imported and clears the key without inserting", async () => {
    stash({ version: 1, anonUuid: "missing-anon", importedDeckIds: [] });
    const fake = makeFakeSupabase({
      decks: [],
      cards: [],
      inserts: { decks: [], cards: [] },
    });
    await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(fake.state.inserts.decks).toHaveLength(0);
    expect(readPending()).toBeNull();
  });

  it("is a no-op when there is no pending import", async () => {
    const fake = makeFakeSupabase({ decks: [], cards: [], inserts: { decks: [], cards: [] } });
    const result = await tryResume({ supabase: fake as never, currentUserId: "real-1" });
    expect(result).toEqual({ kind: "noop" });
  });
});
