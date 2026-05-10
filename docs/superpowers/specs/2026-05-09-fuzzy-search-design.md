# Browse search — fuzzy subsequence matching

> **Amendment (2026-05-10):** This spec describes the homegrown 30-line greedy matcher originally landed on this branch. Manual UX testing surfaced a ranking-quality issue (`flm` ranked "Rod of Lordly Might" above "Flame Tongue Battleaxe" — two stacked word-start bonuses with no compactness penalty). The merged implementation uses the [`fuzzysort`](https://www.npmjs.com/package/fuzzysort) library instead. The "Why no library" subsection below was the explicit decision we reversed; the rest of the spec (problem, goal, non-goals, call-site shape) still describes the merged behavior. References to `src/lib/fuzzyMatch.ts` and its tests are obsolete — both files were deleted in PR #62.

## Problem

The Browse SRD modal's search filter (`src/api/content-types/spells.ts:14-16`, `src/api/content-types/items.ts:14-16`) uses a literal case-insensitive substring check: `name.toLowerCase().includes(query.toLowerCase())`. This misses common typing patterns:

- `firebolt` does not match "Fire Bolt" (the space breaks the substring).
- `fir bolt` does not match "Fire Bolt" (`fir` is not a substring of `fire bolt` ending where the user expects).
- Users have to type a contiguous prefix of a single word to hit anything.

More content types (monsters, feats, etc.) are landing soon, all reusing the same search input. Improving this once benefits all of them.

## Goal

Replace the substring filter with a VSCode command-P-style fuzzy match: characters of the query must appear in the target in the same order (case-insensitive), with no requirement that they be contiguous. Rank matches by a simple quality score so the best hits surface first.

Concretely, after this change:

- `firebolt` matches "Fire Bolt".
- `fir bolt` matches "Fire Bolt" (the space in the query matches the space in the target).
- `cat` matches "Cornwall Times".
- `bag` still matches "Bag of Holding" but not "Cloak of Protection" (existing behavior preserved).

When the query is non-empty, results are sorted by descending score — this is a deliberate visible change from today's API-order rendering. When the query is empty, results render in API order (matches today's behavior).

## Non-goals

- **Highlighting matched characters in the UI.** Worthwhile follow-up; not required for the filter to feel useful.
- **Tie-breaker beyond score.** Stable sort preserves API order for items with equal scores. We are not adding "shorter target wins" or alphabetical tie-breaks.
- **Applying fuzzy match anywhere besides the Browse modal.** No other search inputs need it today.
- **Edit-distance / typo tolerance** (e.g., `freball` matching `fireball` despite the missing letter). Subsequence covers the cases the user raised; edit-distance is a different feature.
- **Token / full-text search across card bodies.** Different problem; lunr/minisearch territory if it ever comes up.

## Approach

### Helper

Add a single function at `src/lib/fuzzyMatch.ts`:

```ts
export type FuzzyMatch = { score: number };

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null;
```

Returns `null` when the query is not a subsequence of the target. Returns `{ score }` otherwise.

Contract:
- **Empty query** returns `{ score: 0 }` (matches everything; callers preserve natural order via stable sort).
- **Empty target with non-empty query** returns `null`.
- **Query longer than target** returns `null` (fast path).
- **No trimming.** The helper does not trim its inputs. Callers that want lenient leading/trailing whitespace must trim themselves (the call sites in this change do).
- **Internal whitespace in the query is significant.** A literal space in the query must match a literal space in the target. We do not collapse runs of spaces — `fir  bolt` (two spaces) will not match "Fire Bolt".

### Algorithm

Greedy left-to-right subsequence match, case-insensitive:

1. Lowercase both query and target.
2. Walk the target. Keep a query cursor `qi` starting at 0.
3. For each target index `ti`, if `target[ti] === query[qi]`, count it as a match and advance `qi`. Otherwise continue.
4. Each matched character contributes to the score:
   - **+1** base
   - **+2** bonus if the match is consecutive with the previous matched character (i.e., previous match was at `ti - 1`)
   - **+3** bonus if the match is at a word start — target index 0, or the previous target character is one of `[' ', '-', '_']`
5. After the walk, if `qi` reached `query.length`, return `{ score }`. Otherwise return `null`.

Word-start boundary chars are exactly space, hyphen, underscore. Apostrophes, commas, parentheses, and slashes do **not** start new words for scoring purposes — `Bigby's` scores `b` as the only word start, not `s` after the apostrophe. This is fine for SRD content; revisit if a content type ships names where punctuation-as-word-boundary actually changes ranking quality.

Lives in `src/lib/` (not `src/api/content-types/`) because it is generic — nothing about it is API-specific.

### Why greedy is good enough

Greedy can pick a suboptimal alignment in pathological cases (e.g., `abc` against `axbcabc` greedily picks `a(0), b(2), c(3)` instead of the consecutive run starting at `a(4)`). For card names — short, English, mostly two-to-four-word phrases — these patterns are rare, and the score difference does not change the visible ordering for realistic queries. A backtracking / DP version is worth ~30 extra lines and complexity that we can add later if a real example surfaces.

### Why no library

The current `package.json` has no fuzzy-search dependency. `command-score` (~80 lines, used by cmdk) and `fuzzysort` are reasonable picks if we ever need ranking quality, highlighting, or edit-distance. The homegrown 30-line version covers the user's stated cases, is inspectable in one screen, and avoids a dependency the codebase does not currently carry.

### Call site changes

Both `spellsContentType.useResults` and `itemsContentType.useResults` switch from:

```ts
const q = query.trim().toLowerCase();
return (idx.data?.results ?? [])
  .filter((e) => q === "" || e.name.toLowerCase().includes(q))
  .map(/* ... */);
```

to (intent sketch — exact typing tightened in implementation):

```ts
const q = query.trim();
const entries = idx.data?.results ?? [];
const scored = q === ""
  ? entries.map((entry) => ({ entry, score: 0 }))
  : entries.flatMap((entry) => {
      const m = fuzzyMatch(q, entry.name);
      return m ? [{ entry, score: m.score }] : [];
    });

return scored
  .sort((a, b) => b.score - a.score) // stable; ties preserve API order
  .map(({ entry }) => ({ /* existing row shape */ }));
```

`flatMap` avoids a separate type-narrowing predicate. The design intent is filter → score → sort → map.

We are *not* extracting the duplicated `useResults` boilerplate between the two content types in this change. That refactor is adjacent and worth doing once a third type lands and the pattern is settled — a one-shot two-call-site duplication is not yet costly enough to abstract.

### Performance

Per-keystroke recompute remains inside the existing `useMemo([idx.data, query, source])`. SRD content sizes are ~hundreds of entries (Items ~360, Spells ~320, Monsters ~330 when added). At those sizes, fuzzy match + `O(n log n)` sort per keystroke is well under a frame; no debounce needed. Revisit only if a content type ships >5k entries.

## Testing

### `src/lib/fuzzyMatch.test.ts` (new)

Cover, at minimum:

- The three user examples: `firebolt → "Fire Bolt"`, `fir bolt → "Fire Bolt"`, `cat → "Cornwall Times"` all return non-null.
- A clear non-match: `xyz → "Fire Bolt"` returns `null`.
- Case insensitivity: `FIREBOLT → "fire bolt"` matches.
- Empty query returns `{ score: 0 }`. Empty target with non-empty query returns `null`. Query longer than target returns `null`.
- Repeated query characters: `ll → "Bell"` matches; `ll → "Lab"` returns `null`.
- Word-start bonus: under the **greedy** algorithm, `fb` against "Fire Bolt" (b lands at a word start) scores higher than `fb` against "Firebolt" (b lands mid-word). Computed scores: 4+4 = 8 vs 4+1 = 5.
- Consecutive bonus: under the **greedy** algorithm, `fi` against "Fight" (i is consecutive with f) scores higher than `fi` against "Fortify" (i is several characters later, neither word-start nor consecutive). Computed scores: 4+3 = 7 vs 4+1 = 5.

All score-comparison tests should be written against the greedy alignment the algorithm actually produces, not the optimal alignment a backtracking matcher would find.

### `src/views/BrowseApiModal.test.tsx`

- Existing "search filters the items list" test continues to pass unchanged (`bag` still matches "Bag of Holding", does not match "Cloak of Protection").
- Add one fuzzy-style end-to-end test in the Spells tab. Seed two spells via `spellIndexEntryFactory.build({ name: "Fire Bolt" })` and `spellIndexEntryFactory.build({ name: "Acid Splash" })`. Type `firebolt` into the search box. Assert the "Fire Bolt" button is visible and the "Acid Splash" button is not — `Acid Splash` has no `f`, so it falls out of the subsequence filter, demonstrating fuzzy behavior the old substring filter would have missed.

## Files touched

| File | Change |
|---|---|
| `src/lib/fuzzyMatch.ts` | New: helper. |
| `src/lib/fuzzyMatch.test.ts` | New: unit tests for the helper. |
| `src/api/content-types/spells.ts` | Replace substring filter with `fuzzyMatch`; sort by descending score. |
| `src/api/content-types/items.ts` | Same change. |
| `src/views/BrowseApiModal.test.tsx` | Add one fuzzy-style end-to-end assertion. |

No CSS, no new tokens, no new dependencies, no schema changes.
