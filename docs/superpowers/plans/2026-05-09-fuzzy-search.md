# Browse fuzzy search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the literal substring filter in the Browse SRD modal's search input with a VSCode command-P-style fuzzy subsequence matcher so queries like `firebolt`, `fir bolt`, and `cat` find "Fire Bolt" / "Cornwall Times".

**Architecture:** Add one generic helper (`src/lib/fuzzyMatch.ts`) returning `{ score } | null` for greedy left-to-right subsequence matching with word-start and consecutive-character bonuses. Wire it into both `spellsContentType` and `itemsContentType` (which today share an identical `name.toLowerCase().includes(q)` filter), and sort matches by descending score.

**Tech Stack:** TypeScript, Vitest, React Testing Library + `@testing-library/user-event`, Fishery-built factories. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-09-fuzzy-search-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/fuzzyMatch.ts` | New | Pure helper: `fuzzyMatch(query, target)` → `{ score } | null`. |
| `src/lib/fuzzyMatch.test.ts` | New | Unit tests covering motivating examples, edge cases, ranking. |
| `src/api/content-types/spells.ts` | Modify | Replace substring filter with `fuzzyMatch`; sort by descending score. |
| `src/api/content-types/items.ts` | Modify | Same change as spells. |
| `src/views/BrowseApiModal.test.tsx` | Modify | Add one fuzzy-style end-to-end test in the Spells tab. |

---

## Task 1: Add the `fuzzyMatch` helper (TDD)

**Files:**
- Create: `src/lib/fuzzyMatch.ts`
- Create: `src/lib/fuzzyMatch.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/lib/fuzzyMatch.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { fuzzyMatch } from "./fuzzyMatch";

describe("fuzzyMatch", () => {
  test("matches the user's motivating examples", () => {
    expect(fuzzyMatch("firebolt", "Fire Bolt")).not.toBeNull();
    expect(fuzzyMatch("fir bolt", "Fire Bolt")).not.toBeNull();
    expect(fuzzyMatch("cat", "Cornwall Times")).not.toBeNull();
  });

  test("returns null when the query is not a subsequence of the target", () => {
    expect(fuzzyMatch("xyz", "Fire Bolt")).toBeNull();
  });

  test("is case insensitive", () => {
    expect(fuzzyMatch("FIREBOLT", "fire bolt")).not.toBeNull();
  });

  test("empty query returns score 0", () => {
    expect(fuzzyMatch("", "Fire Bolt")).toEqual({ score: 0 });
  });

  test("empty target with non-empty query returns null", () => {
    expect(fuzzyMatch("a", "")).toBeNull();
  });

  test("query longer than target returns null", () => {
    expect(fuzzyMatch("abcd", "abc")).toBeNull();
  });

  test("matches repeated query characters when they appear in order", () => {
    expect(fuzzyMatch("ll", "Bell")).not.toBeNull();
  });

  test("rejects repeated query characters that exceed target supply", () => {
    expect(fuzzyMatch("ll", "Lab")).toBeNull();
  });

  test("word-start bonus: 'fb' scores higher against 'Fire Bolt' than 'Firebolt'", () => {
    const wordStart = fuzzyMatch("fb", "Fire Bolt");
    const midWord = fuzzyMatch("fb", "Firebolt");
    expect(wordStart).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordStart!.score).toBeGreaterThan(midWord!.score);
  });

  test("consecutive bonus: 'fi' scores higher against 'Fight' than 'Fortify'", () => {
    const consecutive = fuzzyMatch("fi", "Fight");
    const sparse = fuzzyMatch("fi", "Fortify");
    expect(consecutive).not.toBeNull();
    expect(sparse).not.toBeNull();
    expect(consecutive!.score).toBeGreaterThan(sparse!.score);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they all fail**

Run: `npx vitest run src/lib/fuzzyMatch.test.ts`
Expected: All tests fail because `src/lib/fuzzyMatch.ts` does not exist (import error).

- [ ] **Step 1.3: Implement the helper**

Create `src/lib/fuzzyMatch.ts`:

```ts
export type FuzzyMatch = { score: number };

const BOUNDARY = new Set([" ", "-", "_"]);

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query === "") return { score: 0 };
  if (query.length > target.length) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastMatchTi = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let bonus = 1;
    if (ti === lastMatchTi + 1) bonus += 2;
    if (ti === 0 || BOUNDARY.has(t[ti - 1])) bonus += 3;

    score += bonus;
    lastMatchTi = ti;
    qi++;
  }

  return qi === q.length ? { score } : null;
}
```

- [ ] **Step 1.4: Run tests to verify they all pass**

Run: `npx vitest run src/lib/fuzzyMatch.test.ts`
Expected: 10 tests, all pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/fuzzyMatch.ts src/lib/fuzzyMatch.test.ts
git commit -m "feat(lib): add fuzzyMatch helper for VSCode-style subsequence search"
```

---

## Task 2: Wire `fuzzyMatch` into the spell and item content types

**Files:**
- Modify: `src/api/content-types/spells.ts`
- Modify: `src/api/content-types/items.ts`

Both files share an identical `useResults` shape today. Apply the same change to each. Existing `BrowseApiModal.test.tsx` tests assert behavior that survives this change (`bag` still narrows "Bag of Holding" out of a two-entry list) — they act as the regression check.

- [ ] **Step 2.1: Update `spells.ts`**

Replace the body of the `useMemo` in `src/api/content-types/spells.ts:11-23` so the file reads:

```ts
import { useMemo } from "react";
import { fuzzyMatch } from "../../lib/fuzzyMatch";
import { useSpellIndex } from "../hooks";
import { levelTag, spellDetailToCard } from "../mappers/spells";
import type { ContentType } from "./types";

export const spellsContentType: ContentType = {
  id: "spells",
  label: "Spells",
  searchPlaceholder: "Search spells…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useSpellIndex(source);
    const rows = useMemo(() => {
      const q = query.trim();
      const entries = idx.data?.results ?? [];
      const scored =
        q === ""
          ? entries.map((entry) => ({ entry, score: 0 }))
          : entries.flatMap((entry) => {
              const m = fuzzyMatch(q, entry.name);
              return m ? [{ entry, score: m.score }] : [];
            });
      return scored
        .sort((a, b) => b.score - a.score)
        .map(({ entry }) => ({
          key: entry.key,
          name: entry.name,
          meta: levelTag(entry.level, entry.school.name),
          toCard: () => spellDetailToCard({ ...entry, ruleset: source }),
        }));
    }, [idx.data, query, source]);
    return {
      isLoading: idx.isLoading,
      isError: idx.isError,
      refetch: idx.refetch,
      rows,
    };
  },
};
```

- [ ] **Step 2.2: Update `items.ts`**

Replace the body of the `useMemo` in `src/api/content-types/items.ts:11-23` so the file reads:

```ts
import { useMemo } from "react";
import { fuzzyMatch } from "../../lib/fuzzyMatch";
import { useMagicItemIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import type { ContentType } from "./types";

export const itemsContentType: ContentType = {
  id: "items",
  label: "Magic Items",
  searchPlaceholder: "Search magic items…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useMagicItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim();
      const entries = idx.data?.results ?? [];
      const scored =
        q === ""
          ? entries.map((entry) => ({ entry, score: 0 }))
          : entries.flatMap((entry) => {
              const m = fuzzyMatch(q, entry.name);
              return m ? [{ entry, score: m.score }] : [];
            });
      return scored
        .sort((a, b) => b.score - a.score)
        .map(({ entry }) => ({
          key: entry.key,
          name: entry.name,
          meta: entry.rarity.name,
          toCard: () => magicItemDetailToCard({ ...entry, ruleset: source }),
        }));
    }, [idx.data, query, source]);
    return {
      isLoading: idx.isLoading,
      isError: idx.isError,
      refetch: idx.refetch,
      rows,
    };
  },
};
```

- [ ] **Step 2.3: Run the regression check**

Run: `npx vitest run src/views/BrowseApiModal.test.tsx`
Expected: All existing tests pass (notably "search filters the items list" — `bag` still matches "Bag of Holding", does not match "Cloak of Protection").

- [ ] **Step 2.4: Run the full test suite to confirm nothing else regressed**

Run: `npm test`
Expected: 502 tests pass (same as the worktree baseline).

- [ ] **Step 2.5: Commit**

```bash
git add src/api/content-types/spells.ts src/api/content-types/items.ts
git commit -m "feat(browse): use fuzzyMatch for spell and item search"
```

---

## Task 3: Add a fuzzy-behavior end-to-end test

**Files:**
- Modify: `src/views/BrowseApiModal.test.tsx`

Add one test that exercises behavior the old substring filter could not handle.

- [ ] **Step 3.1: Add the test**

Insert this test alongside "search filters the items list" in `src/views/BrowseApiModal.test.tsx` (anywhere inside the existing `describe("<BrowseApiModal>", ...)` block — the cluster around the existing search test is the natural home):

```ts
test("fuzzy search matches across whitespace in spell names", async () => {
  const fireBolt = spellIndexEntryFactory.build({ name: "Fire Bolt" });
  const acidSplash = spellIndexEntryFactory.build({ name: "Acid Splash" });
  const client = makeClient({
    spells: { "2024": { count: 2, results: [fireBolt, acidSplash] } },
  });

  wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

  await userEvent.click(screen.getByRole("tab", { name: "Spells" }));
  await screen.findByRole("button", { name: /Fire Bolt/ });
  await userEvent.type(screen.getByRole("searchbox"), "firebolt");

  expect(screen.getByRole("button", { name: /Fire Bolt/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Acid Splash/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 3.2: Run the new test**

Run: `npx vitest run src/views/BrowseApiModal.test.tsx -t "fuzzy search"`
Expected: 1 test, passes.

- [ ] **Step 3.3: Run the full BrowseApiModal test file**

Run: `npx vitest run src/views/BrowseApiModal.test.tsx`
Expected: All BrowseApiModal tests pass (existing + the new one).

- [ ] **Step 3.4: Commit**

```bash
git add src/views/BrowseApiModal.test.tsx
git commit -m "test(browse): cover fuzzy-match behavior across whitespace"
```

---

## Task 4: Final verification

- [ ] **Step 4.1: Run the full test suite**

Run: `npm test`
Expected: 503 tests pass (502 baseline + 1 new BrowseApiModal test). The 10 new fuzzyMatch unit tests are also part of the count — total may be 513; the key is zero failures.

- [ ] **Step 4.2: Type-check and lint**

Run: `npm run build && npm run lint`
Expected: Both succeed.

- [ ] **Step 4.3: Manually verify in the browser (~2 minutes)**

Run: `npm run dev`

In the running app:
1. Open a deck and click the "Browse SRD" button.
2. On the Magic Items tab, type `bagofhold` — expect "Bag of Holding" to appear.
3. Switch to the Spells tab, type `firebolt` — expect "Fire Bolt" in the results. The old substring filter would have shown nothing.
4. Clear the search and confirm spells render in their default API order.
5. Type a sparse subsequence query (e.g., `cw` for "Cure Wounds", or `mm` for "Magic Missile") — confirm matches appear and the ordering is sensible (best matches near the top, not random).

Stop the dev server when done.
