# Browse search — fuzzy subsequence matching

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

Returns `null` when the query is not a subsequence of the target. Returns `{ score }` otherwise. Empty query returns `{ score: 0 }` (matches everything; callers preserve their natural order via stable sort).

### Algorithm

Greedy left-to-right subsequence match, case-insensitive:

1. Lowercase both query and target.
2. Walk the target. Keep a query cursor `qi` starting at 0.
3. For each target index `ti`, if `target[ti] === query[qi]`, count it as a match and advance `qi`. Otherwise continue.
4. Each matched character contributes to the score:
   - **+1** base
   - **+2** bonus if the match is consecutive with the previous matched character (i.e., previous match was at `ti - 1`)
   - **+3** bonus if the match is at a word start — target index 0, or the previous target character is whitespace, `-`, or `_`
5. After the walk, if `qi` reached `query.length`, return `{ score }`. Otherwise return `null`.

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

to:

```ts
const q = query.trim();
const matched = q === ""
  ? (idx.data?.results ?? []).map((entry) => ({ entry, score: 0 }))
  : (idx.data?.results ?? [])
      .map((entry) => ({ entry, match: fuzzyMatch(q, entry.name) }))
      .filter((x): x is { entry: typeof x.entry; match: FuzzyMatch } => x.match !== null)
      .map((x) => ({ entry: x.entry, score: x.match.score }));

return matched
  .sort((a, b) => b.score - a.score) // stable; ties preserve API order
  .map(({ entry }) => ({ /* existing row shape */ }));
```

(Exact shape will be tightened during implementation; the design intent is filter → score → sort → map.)

We are *not* extracting the duplicated `useResults` boilerplate between the two content types in this change. That refactor is adjacent and worth doing once a third type lands and the pattern is settled — a one-shot two-call-site duplication is not yet costly enough to abstract.

## Testing

### `src/lib/fuzzyMatch.test.ts` (new)

Cover, at minimum:

- The three user examples: `firebolt → "Fire Bolt"`, `fir bolt → "Fire Bolt"`, `cat → "Cornwall Times"` all return non-null.
- A clear non-match: `xyz → "Fire Bolt"` returns `null`.
- Case insensitivity: `FIREBOLT → "fire bolt"` matches.
- Empty query: returns `{ score: 0 }`.
- Word-start bonus: `fb` against "Fire Bolt" (both letters at word starts) scores higher than `fb` against "Featherbrain" (word start + mid-word).
- Consecutive bonus: `fire` against "Fire Bolt" (four consecutive matches at a word start) scores higher than `fire` against "Frantic Inverse Rune Echo" (four word-start matches but none consecutive).

### `src/views/BrowseApiModal.test.tsx`

- Existing "search filters the items list" test continues to pass unchanged (`bag` still matches "Bag of Holding", does not match "Cloak of Protection").
- Add one assertion that demonstrates fuzzy behavior end-to-end: typing `firebolt` (or similar) in the Spells tab finds an item whose name has a space the substring filter would miss.

## Files touched

| File | Change |
|---|---|
| `src/lib/fuzzyMatch.ts` | New: helper. |
| `src/lib/fuzzyMatch.test.ts` | New: unit tests for the helper. |
| `src/api/content-types/spells.ts` | Replace substring filter with `fuzzyMatch`; sort by descending score. |
| `src/api/content-types/items.ts` | Same change. |
| `src/views/BrowseApiModal.test.tsx` | Add one fuzzy-style end-to-end assertion. |

No CSS, no new tokens, no new dependencies, no schema changes.
