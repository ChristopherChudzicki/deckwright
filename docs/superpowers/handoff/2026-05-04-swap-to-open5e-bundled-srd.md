# Handoff: bundled SRD data on `swap-to-open5e`

**Status:** in-flight. Branch `swap-to-open5e` works end-to-end with IndexedDB persistence; the next planned change reverts that and replaces it with bundled JSON in the repo.
**As of:** 2026-05-04
**Audience:** the next agent (or fresh-context me) picking this up.

---

## TL;DR

Magic-item import has been migrated from dnd5eapi to Open5e v2 in 14 commits on `swap-to-open5e`. All 268 tests pass; build clean; `npm run check:schema` passes. The branch is shippable as-is.

The user wants one more change before merge: **stop fetching from Open5e at runtime; bundle the SRD JSON in the repo, with a fetch script + zod validation.** That replaces the IndexedDB persistence shipped in the most recent commit.

After this branch lands, the next major project is **spell import** (Open5e v2 has both 2014/2024 SRD spells; we'll layer that on the same bundled-JSON pipeline). Spells are explicitly out of scope for this branch.

---

## State of the branch

Commits on `swap-to-open5e` (oldest → newest):

```
288eea1  docs: spec for dnd5eapi → Open5e migration (items)
714edde  docs: expand spec scope to delete enrichment subsystem
2eb9e69  docs: implementation plan for dnd5eapi → Open5e swap
ff17f70  refactor: collapse BrowseApiModal to a single-step picker
60277b6  refactor: drop enrichment parameter from magicItemDetailToCard
5422930  chore: delete orphaned enrichment subsystem
69c5bad  chore: import DAY_MS from ./timing in hooks.ts
e6f26b3  feat: swap magic-item import from dnd5eapi to Open5e v2
9e8f549  chore: biome formatting + MSW fallthrough comment
41151c8  chore: drop EditorView template-item notice
d14acd0  style: switch tag separator from middle-dot to vertical bar
c3278f9  chore: sync Supabase schema + drop unused useMagicItemDetail
3e14483  feat: surface damage/AC/weight tags from Open5e structured fields
71e5daf  feat: persist magic-items queries to IndexedDB; drop index slice  ← may revert
```

Documents on the branch:
- `docs/superpowers/specs/2026-05-03-swap-to-open5e-design.md` — full spec.
- `docs/superpowers/plans/2026-05-03-swap-to-open5e.md` — implementation plan (reflects the original branch scope; doesn't include the bundled-JSON change or the IDB persistence).

---

## What changed in the codebase

### Migrated to Open5e v2

- `src/api/apiClient.ts` — base URL is `https://api.open5e.com`. Generic `apiGet<T>(path)`, 10s timeout, typed error.
- `src/api/endpoints/magicItems.ts` — types: `MagicItemIndexEntry = Omit<MagicItemDetail, "ruleset">`. `fetchMagicItemIndex(ruleset)` hits `/v2/magicitems/?document=srd-{2014|2024}&limit=2000` and throws when `count > 2000`. `fetchMagicItemDetail(ruleset, key)` hits `/v2/magicitems/${key}/`. **Index returns Open5e's response verbatim** (no slicing — was sliced through commit `e6f26b3`, un-sliced in `71e5daf`).
- `src/api/mappers/magicItems.ts` — single `magicItemDetailToCard(detail) → ItemCard`. Header tags: `[category, "<dice> <damage_type>"?, "AC <n>"?, "requires attunement[ <detail>]"?]`. Footer tags: `[rarity, "<weight> lb"?]` (skipped when weight is "0.000"). Body = `desc` verbatim. `apiRef.system: "open5e"`. `imageUrl` always undefined (Open5e doesn't expose images on magicitems endpoint).
- `src/api/factories.ts` — `magicItemIndexEntryFactory` (full row shape, defaults to "ammunition-style minimal" with weapon/armor null and weight "0.000"). `magicItemDetailFactory` is `{ ...indexEntry, ruleset: "2024" }`.
- `src/api/hooks.ts` — only `useMagicItemIndex` (24h staleTime/gcTime). `useMagicItemDetail` was dead code, deleted in `c3278f9`.
- `src/test/msw.ts` — Open5e routes; `magicItemIndexHandler` falls through (returns `undefined`) on non-matching `?document=` so 2014/2024 handlers can coexist for the same URL. Comment in the file explains this MSW v2 idiom.
- `src/views/BrowseApiModal.tsx` — single-step picker. Reads `entry.key`/`entry.name`. `handlePick` calls `queryClient.fetchQuery` for detail, then `magicItemDetailToCard`, then `saveCard.mutateAsync`. No second step, no enrichment.
- `src/cards/Card.module.css` — separator is ` | ` (was ` · `). Header `::before` pseudo has `font-style: normal` so the bar isn't italic.
- `src/decks/schema.ts` — `apiRef.system: z.literal("open5e")`.
- `src/cards/types.ts` — same TS literal change.

### Supabase

- `supabase/schemas/card-payload.json` — regenerated via `npm run gen:schema` (literal is now `"open5e"`).
- `supabase/migrations/20260503212159_swap_apiref_system_to_open5e.sql` — drops + re-adds `cards_payload_valid` CHECK with regenerated JSON Schema. Includes a backfill: any existing row with `apiRef.system === "dnd5eapi"` is updated in place. Migration is **not yet applied to live DB** (run `npx supabase db push` or equivalent when ready).

### Deleted

The whole enrichment subsystem (was needed only because dnd5eapi returned "any X" template entries; Open5e pre-splits variants):

- `src/views/EnrichmentStep.tsx` + `.module.css` + `.test.tsx`
- `src/api/endpoints/equipment.ts` + `.test.ts`
- `src/api/mappers/equipment.ts` + `.test.ts`
- `src/api/mappers/baseHint.ts` + `.test.ts`
- `useEquipmentIndex` from hooks
- equipment MSW handlers
- `isTemplateItem` predicate + JSX + `.templateNotice` CSS + 2 related tests in EditorView
- Mapper helpers: `composeName`, `composeHeaderTags`, `composeFooterTags`, `stripBodyPrefix2014`, `stripBodyPrefix2024`, `detectAttunement2014`, `IMAGE_BASE`

### Persistence (most recent commit, may be reverted)

- `src/api/QueryProvider.tsx` — `PersistQueryClientProvider` from `@tanstack/react-query-persist-client`, with idb-keyval-backed async persister. Scope: `query.queryKey[0] === "magic-items"` only — Supabase auth/decks/cards are not persisted.
- New deps: `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval`.
- 24h `staleTime`/`gcTime` on the magic-items index already; persister respects `gcTime` for eviction.

---

## The next task: bundled SRD JSON

The user decided IDB persistence is the wrong long-term fit for this app's profile (1 user, SRD changes glacially, no live-data requirement). Better approach: **bundle Open5e's response in the repo, refresh periodically with a fetch script, validate with zod.**

Why bundling beats IDB here:
- Zero network on the import flow after first JS load.
- Works offline / during Open5e outages.
- Drops three persist deps (~50KB).
- Enables future LLM preprocessing (the user wants to script per-card summary generation later — out of scope for this task, but the architecture should leave the door open).

The user's exact ask:

> 1. fetch json
> 2. validate it matches a schema with zod or something
> 3. now we have a typed schema.

Plus:

> we are switching to open5e-based data, but moving to clone their data in our repo rather than fetch it on the client

### Approach to ship

1. **Uninstall the three persist deps.** Restore `src/api/QueryProvider.tsx` to plain `QueryClientProvider`.
2. **Create a zod schema** for the magic-item row shape (mirroring the current `MagicItemDetail` interface — `key, name, desc, category: { name }, rarity: { name }, requires_attunement, attunement_detail, weapon: WeaponInfo | null, armor: ArmorInfo | null, weight, weight_unit`). Put this somewhere like `src/data/srd-schema.ts`. Use `z.infer` to derive the TypeScript types — single source of truth for shape and validation.
3. **Write a fetch script** `scripts/fetch-srd.ts`:
   - Hits `/v2/magicitems/?document=srd-2024&limit=2000` and `/v2/magicitems/?document=srd-2014&limit=2000`.
   - Validates the response with `z.object({ count, results: z.array(magicItemSchema) }).parse(response)` — throws hard on shape changes.
   - Writes `src/data/srd-2024-magicitems.json` and `src/data/srd-2014-magicitems.json` (or whatever path the agent prefers; keep them in `src/` so the bundler picks them up).
   - Add `npm run fetch:srd` to `package.json`.
4. **Replace runtime fetching** in `src/api/endpoints/magicItems.ts`:
   - `fetchMagicItemIndex(ruleset)` returns the bundled JSON via dynamic `import()` so it's lazy-loaded (not in initial JS bundle) and tree-shakeable per ruleset. Wrap in a Promise to keep the return type stable.
   - `fetchMagicItemDetail(ruleset, key)` looks up the entry in the same bundled JSON (no separate detail file needed — every row is structurally complete since we removed the slice).
   - The over-limit assertion can move into the fetch script (it's a build-time concern now, not runtime).
   - **Optional simplification:** since the index has all detail data, `BrowseApiModal.handlePick` could skip `queryClient.fetchQuery` entirely and just look up the entry from the index data already in the cache. This is a follow-up; do whatever's simplest first.
5. **MSW handlers** in `src/test/msw.ts` are now mostly dead (no runtime network for magic-items). Either delete the magic-item handlers or keep them for future flexibility (e.g., testing the fetch script). Suggest: delete for cleanliness; the fetch script can be tested separately.
6. **Tests:**
   - `src/api/endpoints/magicItems.test.ts` — currently asserts on URL patterns and over-limit throw. Most of those tests become obsolete; replace with tests that the new `fetchMagicItemIndex` returns the expected shape from the bundled JSON.
   - `src/api/hooks.test.tsx`, `src/views/BrowseApiModal.test.tsx` — currently use MSW handlers. After the swap, the bundled JSON IS the test fixture. Tests can either import the bundled JSON or use a test-specific mock module via vitest's `vi.mock`.
   - `src/api/mappers/magicItems.test.ts` — unchanged (mapper consumes a `MagicItemDetail` regardless of source).
7. **Commit the JSON files** (~1MB total raw, ~200KB gzipped). Yes, that's a real-but-tolerable diff size.
8. **Future-proofing:** add a comment block at the top of each JSON file noting it's generated; add the fetch script to a GitHub Action on a monthly cron if you want automated freshness (the user mentioned this casually but it's a separable follow-up).

### Suggested implementer-subagent prompt for this work

(Copy-paste-ready; adjust as needed.)

```
You are implementing the bundled-SRD-data task on branch `swap-to-open5e`.

Working directory: /Users/cchudzicki/dev/dnd-cards.

## Context

Magic-item import currently fetches from Open5e at runtime, with IndexedDB
persistence (TanStack persist + idb-keyval). The user wants to replace that
with bundled JSON in the repo: a fetch script pulls Open5e, validates with
zod, and writes JSON files; the app reads those at runtime via dynamic
import. Three persist deps go away.

Background: the spec at docs/superpowers/specs/2026-05-03-swap-to-open5e-design.md
and the handoff at docs/superpowers/handoff/2026-05-04-swap-to-open5e-bundled-srd.md
have full context.

## Your job

1. `npm uninstall @tanstack/react-query-persist-client @tanstack/query-async-storage-persister idb-keyval`
2. Restore `src/api/QueryProvider.tsx` to plain QueryClientProvider.
3. Create `src/data/srd-schema.ts` exporting a zod schema for the magic-item
   row shape that matches `MagicItemDetail` minus `ruleset`. Export the
   inferred type.
4. Create `scripts/fetch-srd.ts`:
   - Fetches /v2/magicitems/?document=srd-{2014,2024}&limit=2000
   - Validates with `z.object({count, results: z.array(magicItemSchema)}).parse(...)`
   - Writes src/data/srd-2024-magicitems.json and src/data/srd-2014-magicitems.json
5. Add `"fetch:srd": "tsx scripts/fetch-srd.ts"` to package.json scripts.
6. Run `npm run fetch:srd` to populate the JSON files. Commit them.
7. Replace fetchMagicItemIndex/fetchMagicItemDetail in
   src/api/endpoints/magicItems.ts to read the bundled JSON via dynamic
   import. Keep the same public signatures so callers don't change.
8. Delete the now-unused magic-item MSW handlers from src/test/msw.ts.
9. Update tests:
   - src/api/endpoints/magicItems.test.ts — replace URL-assertion tests
     with shape-based tests against the bundled JSON.
   - src/api/hooks.test.tsx — bundled JSON is the fixture; adjust imports.
   - src/views/BrowseApiModal.test.tsx — same.
10. Run `npx vitest run --dir src` and `npm run build` and
    `npm run check:schema` — all must pass.
11. Single commit covering: dep removal, schema, fetch script, JSON files,
    endpoint rewrite, test updates.

## Project conventions

- Biome is authoritative; accept its reformatting.
- No comments unless WHY is non-obvious.
- Tests use getByRole; factories pass no values they don't assert on.
- Don't push or create PRs.
- Don't use `git -C <path>`.

## Out of scope

- Spell import (next branch).
- LLM-generated card summaries (architecture should leave room; no work
  here).
- Skipping the detail fetch in BrowseApiModal (optional cleanup; do only
  if trivial).
- iconRules improvement (issue #32, separate work).
- Backfilling the live DB (the migration handles new rows; existing rows
  in the dev DB can be left alone).

Report Status, commit SHA, file list, test count, and any concerns.
```

---

## Decisions already made (don't relitigate)

- **Open5e v2, not v1.** v1 is legacy.
- **Use the API endpoint, not the GitHub raw data.** GitHub raw is in Django fixtures format with FK references; we'd have to reimplement the joins (Weapon.json, Armor.json) and field synthesis (capitalization, `weight_unit`, `attunement_detail`). The API gives us the joined+formatted shape for free.
- **Bundle JSON in `src/data/`** so Vite handles asset hashing and the bundler can dynamic-import per ruleset. Don't put it in `public/` — that's for things you want served as-is at a fixed URL.
- **No buster string needed.** The cached shape will track Open5e's; their schema changes would surface as zod parse failures during the fetch run, before code is committed.
- **Lazy-load the JSON via dynamic `import()`.** Keeps initial JS bundle small.
- **Keep `apiRef.system: "open5e"` in the schema.** Even though the data now comes from a bundled file rather than a live API, the conceptual source is still Open5e — apiRef records provenance.

## Known accepted gaps

- **Dwarven Thrower** and similar non-variant-bound magic weapons have `weapon: null` in Open5e's data. No damage tag is generated; user accepted "edit the card manually" rather than build a heuristic. (Open5e variant-splits items like Adamantine Armor and Flame Tongue, but not items like Dwarven Thrower whose base is implicit-but-canonical-warhammer.)
- **`attunement_detail` field can include redundant "Requires Attunement" prefix text** for some items (e.g., Dwarven Thrower's `attunement_detail` is "Requires Attunement by a Dwarf or…"). Current mapper produces "requires attunement Requires Attunement by…". Cosmetically suboptimal; not addressed.
- The icon for "Bag of Holding"-type wondrous items falls back to the dice icon (no rule matches "Wondrous Item" name without keywords). Same as before the migration. Issue #32 tracks the long-term fix.

## Project ambitions (post-this-branch)

- **Spell import** — the next major effort. Open5e v2 has both 2014 (319 spells) and 2024 (339 spells) SRD spells under `/v2/spells/`. The same bundled-JSON pipeline this task ships will be reused for spells. The original spec for spell import was paused at the very start of this conversation; revisit it when ready.
- **LLM-generated card summaries** — newly enabled by repo-bundled data. A separate script can run after `fetch:srd` to call the Anthropic API per card and store a `summary` field. The zod schema can grow an optional `summary: string`. Consumers can fall back to truncating `desc` until the summary script has run.
- **iconRules rewrite** — issue #32. Use Open5e's structured `category.key`/`weapon.category`/`armor.category` instead of regex-on-prose. Out of scope for this branch and the next; tracked separately.

## Pointers

- Spec: `docs/superpowers/specs/2026-05-03-swap-to-open5e-design.md`
- Plan: `docs/superpowers/plans/2026-05-03-swap-to-open5e.md`
- This handoff: `docs/superpowers/handoff/2026-05-04-swap-to-open5e-bundled-srd.md`
- Issue tracking icon improvements: https://github.com/ChristopherChudzicki/dnd-cards/issues/32
- Open5e API: https://api.open5e.com/v2/
- Open5e source data on GitHub (do NOT use directly — see "Decisions already made"): https://github.com/open5e/open5e-api/tree/staging/data/v2/wizards-of-the-coast

## Project conventions reminder

From `CLAUDE.md` (read for full text):

- `npm test`, `npm run dev`, `npm run build` are pre-approved. Ask before `npm install` (but `npm uninstall` for the planned dep removal is fine — user has already approved this task's direction).
- Don't push or create PRs without explicit instruction.
- Don't use `git -C <path>` — run git from the cwd.
- No comments unless WHY is non-obvious.
- Address review nits inline; don't accumulate cleanup.
- Tests: `getByRole(...)`. Factories pass no values they don't assert on.
- Biome authoritative — accept its reformatting.
- DB changes go through `supabase/migrations`; never edit live tables.

## How to pick up

```bash
cd /Users/cchudzicki/dev/dnd-cards
git checkout swap-to-open5e
git log --oneline main..HEAD     # confirm 14 commits, last is 71e5daf
npm install                       # ensure deps match the lock
npx vitest run --dir src          # all 268 tests pass
npm run build                     # clean
```

Then read this doc and the spec, dispatch the implementer subagent with the prompt above (or fresh per your judgment), and run the standard spec-compliance + code-quality reviews afterward.
