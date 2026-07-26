# Handoff: LLM icon descriptions (and the SRD re-fetch that preceded it)

Date: 2026-07-25. Spec:
`docs/superpowers/specs/2026-07-25-icon-descriptions-design.md`.

## State

| branch | worktree | state |
|---|---|---|
| `chore/refetch-srd` | `.worktrees/srd-refetch` | **merged** as `3cf38b8` (PR #96) |
| `feat/icon-descriptions` | `.worktrees/icon-descriptions` | spec + experiments, rebased on merged main; no implementation |

Worktrees need `ln -s <repo>/node_modules <worktree>/node_modules` to run
anything. The repo root had no `node_modules` at session start; `npm install`
fixed it.

### PR #96 — SRD re-fetch

Re-ran `npm run fetch:srd`; bundles had been stale since 2026-05-04 / 05-10. Row
counts unchanged; only `src/data/srd-2024-spells.json` has content changes. Seven
2024 spells had **truncated descriptions upstream that are now complete** (Alarm,
Create/Destroy Water, Bigby's Hand, Magic Aura, Control Water, Teleport,
Forcecage) — they had been losing every bolded sub-section. Component flags
corrected on 20 spells. Second commit fixes comments/test names in
`src/lib/srd-format/spells.ts` that claimed 2014/2024 diverge on casting-time and
duration formats; they no longer do. No formatter changes were needed — the
existing normalization already handled both forms.

Open5e quirks from `feature_work/TODOS_AND_IDEAS/open5e-contribution-ideas.md`
are all **still open** (Potion of Healing absent from `/magicitems/`, Flame Tongue
still 29 entries, Belt of Giant Strength still 5).

### `feat/icon-descriptions` — spec, revised twice

Written, reviewed by four parallel agents (methodology, feasibility, downstream
fit, clarity), revised, then revised again after prompt experiments. `sharp` is
installed as a devDependency (`^0.35.3`) — approved this session. No script
exists yet.

## Decisions made

- **Describe all 4,134 icons**, not a curated subset. Curation becomes a
  *second* LLM pass over the descriptions; the full set stays reachable by
  search, so "the curated list is too limited" cannot recur.
- **The name IS given to the model**, subordinated by an explicit "the image is
  authoritative" clause. This reverses the earlier blind protocol; see below.
- **Batch size 30.**
- **Batch order stays randomized** (seeded shuffle) — user's call, on intuition
  rather than measurement, and it costs nothing.
- **Description shape:** literal depiction first, then a conventional-association
  clause *only if* a well-established one exists. No relevance flag, no tags.
- **No generated synonym / search-text field.** Name indexing + `fuzzysort` +
  query-side expansion come first; expansion would amplify wrong descriptions.
- **Filesystem, not DB.** Output `src/data/icon-descriptions.json` (committed);
  PNG cache `.icon-cache/png/<icon-name>.png` (gitignored). No hashing.
- **The output file is the progress marker** — no separate progress file.
  Requires that per-entry validation gate the write.
- **Sequential invocations.** Concurrency is out of scope (lost-update race).

## Not decided

1. **256×256 vs 512×512.** Untested. Images are ~1% of cost, so 512 is ~+$4 over
   a full run — cheap, and the direction that might fix the `claw-hammer` class.
2. **Does thematic clustering actually hurt?** The seeded shuffle is now the only
   unmeasured element. Designed test is in the spec's "Open experiments".
3. **`--force` overwrites hand-corrected descriptions.** Documented as a
   limitation with `--only` as the repair path; an overrides file was considered
   and deferred as YAGNI.

## Measured, so it need not be re-derived

- **Current icon assignment:** 2,354 cards, 1,604 distinct names, **34 of 4,134
  icons reachable**. Fallback `perspective-dice-six-faces-random` = 581 cards
  (24.7%); `broadsword` = 472 (includes Blowgun and Club +1/+2/+3);
  `fire-flower` = 24 cards / 12 names. Fireball is *not* among them — the
  specific rule precedes the generic fire rule.
- **The collection:** 4,134 icons, every one a single `<path>` with only `fill`
  (always `currentColor`) and `d`, uniform 512×512. No gradients, masks, clip
  paths, strokes, `fill-rule`, or text anywhere. Plus 3 aliases and 1 hidden
  icon, so `listIcons()` returns **4,137**.
- **`claude -p` reads rendered PNGs.** Verified blind on anonymized filenames.
  Under a subscription `total_cost_usd` is **usage quota, not dollars**.
- **Cost curve, 60 icons, same sample, blind:** batch 10 → $1.435/376s;
  20 → $0.867/255s; **30 → $0.625/167s**; 60 → $0.487/123s but **one entry
  silently dropped**. Fit is `~$0.14–0.20 fixed per invocation + ~$0.005/icon`;
  both components are real, resolving the earlier two-model ambiguity. Full run
  at batch 30 ≈ **$43-equivalent, 138 invocations, 3.2h**.
- **Named beats blind 4×:** 2 misses vs 8 out of 60, for +17% cost. Blind
  failures were systematic — `flamethrower` ("a rifle fitted with a bayonet"),
  `bellows` ("a broom"), `sea-star` ("a shooting star"), `energy-sword` — wrong
  the same way at *every* batch size. Named descriptions add detail the name
  doesn't contain (the flamethrower's hose and fuel tank).
- **No parroting:** the model contradicted the filename on `card-king-spades`,
  ignored the joke name on `pick-of-destiny`, and declined on `abstract-092`
  ("no representational subject").
- **Quality vs batch size:** flat 10→30, degrades at 60 (dropped entry plus two
  icons correct at 10/20/30 and hallucinated at 60). Smaller isn't better —
  batch 10 invented an association for `bellows` and garbled `butter-toast`.
- **Images are ~1% of cost** (87 tokens at 256²; ~2,600 per 30-icon batch vs a
  $0.31 invocation). JPEG saves nothing — token cost is dimensional — and its
  artifacts would hurt thin line art. PNGs average 9KB.
- **Errors are deterministic.** Six of eight blind misses were the *same wrong
  object class* in all four runs, with wording varying freely. So re-running at
  the same settings is not a repair, self-consistency voting is near-worthless,
  and only changing the input (name, resolution) helps.
- **Named-run misses were `card-king-spades`** (rotated spade called "a
  heart-shaped symbol" — accurate shape, wrong identification, and it
  contradicted the filename to get there) **and `overdose`** ("different sizes
  and colors" on a monochrome image; soft, since the capsules are two-tone).
- **`--output-format json` returns an envelope**; the model text is in
  `.result`, usually inside ``` fences.
- **Domain-aware prompt does not strain on irrelevant icons** — `laptop` and
  `basketball-ball` get no association clause at all.

## Repo facts worth keeping

- `vitest.config.ts` includes **only `src/**`**. Tests under `scripts/` are never
  collected and `npm test` passes having asserted nothing. **User wants this
  fixed repo-wide as separate work** — invert to collect everywhere and exclude
  `e2e/**` (Playwright, `testDir: "./e2e"`) plus `.worktrees/**` and
  `.claude/worktrees/**`, which contain ~10 full checkouts vitest would otherwise
  collect. Currently only `e2e/*.spec.ts` sits outside `src/`, so the fix should
  be behaviour-preserving.
- `src/test/setup.ts` globally mocks the icon collection down to **2 icons**;
  use `vi.importActual` (see `src/cards/iconRules.test.ts:16`).
- `tsconfig.node.json` lacks `resolveJsonModule` — scripts must
  `createRequire` + `readFileSync` (see `scripts/generate-og.ts:33-36`).
- `cmk --clean` (run by `gen:css` on every build/typecheck/CSS-module edit)
  **wipes `/generated/`** — never cache anything there.
- `scripts/generate-og.ts` already rasterizes a game-icons SVG via Playwright, so
  a reviewer may ask why sharp was added; the spec answers it.
- `sharp`'s entry point is `sharp/dist/index.cjs` at 0.35.x.

## Next step

Spec review by the user, then `writing-plans`.

Scratch experiment scripts (`exp-render.mjs`, `exp-run.mjs`, `exp-sheet.mjs`,
`exp-summary.mjs`) and all run outputs live in this session's scratchpad, not the
repo. `exp-run.mjs blind|named <batchSize>` reproduces any run; grading is done
by viewing the labelled contact sheets `exp-sheet.mjs` produces.
