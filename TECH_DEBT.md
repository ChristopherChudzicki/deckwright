# Tech Debt Review — 2026-05-10

Repo-wide pass for refactor/cleanup candidates. Findings prioritized by impact ÷ effort.
Spot-checks are noted; everything cited has a file:line.

## Meta

**AGENTS.md doesn't exist.** `CLAUDE.md` and `README.md` cover the same ground (stack, conventions, sensitive areas). No action needed unless a contributor explicitly wants the AGENTS.md filename for tooling reasons (some agents look for it by convention). If we add one, it should be a short pointer to CLAUDE.md, not a duplicate.

---

## Done in this session (2026-05-10)

- **AuthCallback inline styles** — moved to `src/auth/AuthCallback.module.css` as `.statusPanel`. Padding dropped from `4rem` (no matching token) to `var(--space-6)` (2rem); space scale tops out at `--space-6`, so this nudges the design toward the existing scale rather than introducing a new token.
- **Factory discipline (partial / scoped down)** — removed unused `name`, `headerTags`, and redundant `iconKey: undefined` overrides in `src/cards/Card.test.tsx` (4 tests) and redundant `headerTags: []` in 6 cases in `src/cards/iconRules.test.ts`. The original write-up implied broader debt here; in practice most overrides in `iconRules.test.ts` are load-bearing — the rule engine matches against `name + headerTags.join(" ")`, and "X picks Y, not Z" tests need the headerTags to make the negative claim non-vacuous. Remaining overrides were deliberately kept.
- **`iconRules.test.ts` spell name-keyword tests → `test.each` table** — collapsed 27 near-duplicate tests into a single 26-row table keyed on `(name, expected)`. The level/school tags those tests carried were not load-bearing (default factory tags don't fire any rule), so they're omitted. The Counterspell case (which genuinely tests the name → school fall-through) remains a standalone test. The block dropped from ~225 lines to ~50.
- **`as unknown as` cast in test setup** — `src/test/setup.ts` now uses `class ResizeObserverMock implements ResizeObserver` with a typed constructor; the double-cast is gone.
- **`children: any` in test wrappers** — `src/decks/queries.test.tsx` and `src/decks/mutations.test.tsx` now use `{ children: ReactNode }`; the `biome-ignore` comments are removed.
- **`Card.test.tsx` icon assertions** — `Card.tsx` now exposes `data-icon-key` on the (already aria-hidden) icon container, and the four icon-selection tests assert that attribute directly. Closes a real coverage gap: the previous `slot.querySelector("svg")` matched the frame SVG and would have passed even if no icon resolved. Frame-shape tests now assert only `data-frame` and drop the redundant `querySelector("rect"|"polygon")` checks (matching `CardBack.test.tsx`'s pattern).

## High impact

### 1. Supabase RPC results cast without runtime validation — ✅ RESOLVED (2026-05-24, PR #86)

This item was written against the pre-#66 tree and was almost entirely stale by the time the review was committed; #66 landed the same evening (2026-05-10).

- **`src/decks/queries.ts` (and `mutations.ts`) — resolved by #66.** `createClient<Database>` + a checked-in generated `src/api/database.types.ts` replaced the `as DeckSummary[]` / `as PublicDeck | null` / `as CardRow[]` casts; the RPCs are now typed at the source, and a `check:db-types` CI guard fails the build on schema/types drift (strictly stronger than the `invariant()` guards originally proposed). The Supabase-side casts cited for `anonImport.ts` (`oldDeck`, `newDeck`, `cards`) went away in the same change.
- **`src/auth/anonImport.ts` localStorage parse — resolved by #86.** The lone live remnant was `readPending()`'s `JSON.parse(raw) as { version?: number }` → `parsed as PendingAnonImport`, which asserted the full shape after only checking `version === 2`. Replaced with a `pendingAnonImportSchema` (zod) validated via `safeParse`, with `PendingAnonImport` derived via `z.infer`. `localStorage` is genuinely untrusted input — the one category worth validating — unlike Supabase, which is now typed end-to-end.

(Note: the resolution was Zod at the one *external* boundary, not blanket `invariant()` on RPC returns. The original "Supabase is *almost* internal, defer Zod" call held for the RPC results — #66's generated types cover those — and the Zod investment went where the input is actually untrusted.)

### 2. `BrowseApiModal.tsx` is doing too much — ❌ REJECTED (2026-05-24)

Re-reviewed against the code (now 254 lines after the #85 `Select` migration). Both proposed fixes were rejected:

- **Size & nesting — not worth it.** `SourceMenu` (8 lines) and `TypeMenu` (10 lines) are thin one-call-site wrappers over the shared `Select` primitive; extracting them to files adds import ceremony for zero reuse. `TypePanel` (~75 lines) is the only plausible extraction, and it's already a clean prop-driven component — moving it to its own file is lateral, not an improvement. 254 lines is not egregious.
- **Lift `useSaveCard` to the parent — actively wrong for this code.** The modal has **two** parents (`EditorView.tsx:184`, `DeckView.tsx:148`) and only `EditorView` otherwise uses `useSaveCard`. They want different things after a pick — EditorView *navigates* to the imported card, DeckView just *closes* — and already express exactly that via `onSelected`. The modal owns the whole `browse → persist → per-row spinner → inline error` flow in one cohesive place; `pickingKey`/`pickError` are intrinsically the modal's row-level UI state (`:233-249`). Lifting the mutation would force duplicating the `handlePick` try/catch into both parents *or* inventing a new shared hook — both worse than today. The "easier to test" claim doesn't hold either: the ~545-line test file already drives the mutation through the query client; lifting just relocates the seam.

The original "doing too much" framing overstated it. The current split (modal = pick + persist + progress; parent = what to do after) is the correct seam for two consumers.

---

## Medium impact

### 3. Missing tests for non-trivial modules — ✅ RESOLVED (2026-05-24)
- `src/cards/FramedIcon.tsx` — **done.** Added `src/cards/FramedIcon.test.tsx`: a dedicated, isolated unit asserting the rendered primitive matches `data-frame` for both kinds (item → `square` + `<rect>`, spell → `hex` + `<polygon>`), each with a non-vacuous negative (item has no polygon, spell has no rect). Correction to the original note: the `rect`/`polygon` element-shape was **not** fully lost — `CardBack.test.tsx:50-64` still asserts it transitively; only `Card.test.tsx` dropped it. The dedicated test is still the right call as the canonical home for the component's contract, surviving erosion of either transitive path.
- `src/app/router.tsx` (route tree — typically integration-tested, **left as-is**).
- `src/app/QueryProvider.tsx` (setup wrapper — **left as-is**).

### 4. Duplicate dropdown-menu pattern — ✅ RESOLVED (2026-05-23, PR #85)

Extracted a `src/lib/ui/Select` primitive and migrated the four select-style dropdowns to it: **DeckView sort, PrintSelectionModal sort, BrowseApiModal Source + Type**. The work escalated past the original "just dedupe the CSS" framing — these are single-value selections with a current value, so they moved from the ARIA **menu-button** pattern to the **listbox/Select** pattern (`react-aria` `Select`): options now expose `aria-selected`, the trigger announces label + current value, and the value derives from `selectedKey` (one source of truth) instead of a hand-assembled string. Also added a `cx()` class-merge helper and adopted it across the 11 existing primitives.

`UserMenu` was deliberately **not** migrated — it's a *command* menu (single Sign-out action), not a value-select, so the menu-button pattern is correct for it. The original "two sites, configuration differs" caution held for that pairing; what actually crossed the rule-of-three was the three sort/source/type selects.

The 2026-05-23 sort-dropdown-CSS-triplication TODO is closed by the same change: the byte-identical `.sort*` / `.menu*` rules are gone, now owned by `Select.module.css`. (Note: the eventual resolution was a value-`Select`, not the `MenuTrigger`/`onAction` dedup the TODO sketched — modeling the controls correctly was the better move than mechanically sharing the old pattern.)

### 5. `PrintView.tsx` has local helpers that belong in `src/cards/` — ❌ REJECTED (2026-05-24)
`src/views/PrintView.tsx:21` — `chunk()` is a 3-line generic helper used in exactly one file (no other callers anywhere in `src/`). `src/cards/` owns *card-pagination* algorithms (`layoutPaginator`, `pairSlots`, `backImposition`), so a generic `chunk` doesn't belong there; the only honest home would be a new `src/lib/array.ts` created solely for this 3-liner — overkill. A single-use local helper inline is the correct state. Leave it.

---

## Reference

### 6. `tsconfig` already strict — keep it that way
For reference: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true` are on. No additional flag would obviously catch more bugs without false-positive churn. Keep `npm run build` in the pre-merge loop (the user's memory note: vitest doesn't enforce `noUncheckedIndexedAccess`).

---

## Things that look fine (don't touch)

- **`src/cards/` algorithms.** `layoutPaginator`, `breakCandidates`, `pairSlots`, `sliceAt`, `measurer`, `backImposition` are well-factored and individually tested. The print path's *logic* is in good shape — any structural debt here is in the views, not the cards module.
- **`src/decks/mutations.ts`.** Already uses the `if (!data) throw` + cast pattern correctly.
- **Shared UI primitives in `src/lib/ui/`.** Coverage looks healthy (each primitive has a test file).
- **MSW + factories + Vitest setup.** No obvious anti-patterns in the harness itself.

---

## Status

All actionable items are now closed:

- **#1** done — #66 + PR #86 (typed RPCs + zod at the localStorage boundary)
- **#3** done — 2026-05-24 (`FramedIcon.test.tsx`)
- **#4** done — PR #85 (`Select` primitive)
- **#2** rejected — 2026-05-24 (re-review: nesting benign; lifting `useSaveCard` is wrong for the two-parent case)
- **#5** rejected — 2026-05-24 (single-use 3-line helper belongs inline)
- **Meta** / **#6** — informational, no action expected.
