# Handoff: LLM icon descriptions (and the SRD re-fetch that preceded it)

Date: 2026-07-25. Spec:
`docs/superpowers/specs/2026-07-25-icon-descriptions-design.md`.

## State

Two independent branches, neither merged.

| branch | worktree | state |
|---|---|---|
| `chore/refetch-srd` | `.worktrees/srd-refetch` | **draft PR #96**, complete, tests + build pass |
| `feat/icon-descriptions` | `.worktrees/icon-descriptions` | spec only, no implementation |

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
- **Blind to the name, not to the domain.** The prompt withholds icon names
  (hashed filenames, seeded shuffle) but *does* say these are D&D card icons.
- **Description shape:** literal depiction first, then a conventional-association
  clause *only if* a well-established one exists. No relevance flag, no tags.
- **Filesystem, not DB.** Output `src/data/icon-descriptions.json` (committed);
  PNG cache `.icon-cache/png/` (gitignored).
- **The output file is the progress marker** — no separate progress file.
  Requires that per-entry validation gate the write.
- **Sequential invocations.** Concurrency is out of scope (lost-update race).

## Not decided

1. **`--batch-size`.** Default 25 is a guess. The cost curve is one data point
   fitting two models that differ 7× at N=100.
2. **Blind vs. include-name was never A/B'd.** Blindness rests on reasoning, not
   measurement. Note the distinction: `fire-flower` proves name-based *rules*
   fail, which is not the claim that name-*informed descriptions* are worse.
3. **256×256 vs 512×512.** Untested; the one recorded miss (`claw-hammer`) is the
   kind of error a 2× downsample produces.
4. **`--force` overwrites hand-corrected descriptions.** Currently documented as
   a limitation with `--only` as the repair path; an overrides file was
   considered and deferred as YAGNI.

Recommended experiment design (trimmed from a 9-run factorial, since grading is
the bottleneck): 4 ungraded runs of the same 60 icons at batch 10/20/30/60 for
the cost curve, plus 2 graded runs ±name for the blind control.

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
  12 icons ≈ $0.20–0.23 API-equivalent, 23–47s. Cost driver is per-invocation
  harness overhead (~110k cached tokens), not images (~87 tokens at 256²).
  Under a subscription this is **usage quota, not dollars**.
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

Spec review by the user, then `writing-plans`. Optionally run the two
experiments first — they change `--batch-size` and could delete two of the three
blind-protocol defenses.

Scratch experiment scripts (rasterizing, contact sheets, batch runs) are in this
session's scratchpad, not the repo. They are trivial to recreate from the spec.
