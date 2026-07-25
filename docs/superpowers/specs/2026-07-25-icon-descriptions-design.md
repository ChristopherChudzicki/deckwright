# LLM-generated descriptions for the full game-icons set

## Problem

Icon assignment is driven by `src/cards/iconRules.ts` — 218 lines of regex over
`name + headerTags`. Run against the current SRD bundles (2,354 cards, 1,604
distinct names), it uses **34 of the 4,134 available icons**:

| icon | cards | |
|---|---|---|
| `perspective-dice-six-faces-random` | 421 | the fallback: every Amulet, Bag, Belt, Boots, Brooch, Broom, Candle, Carpet… |
| `broadsword` | 367 | includes Blowgun +1/+2/+3 and Club +1/+2/+3 — the generic weapon rule matches the literal `Weapon` category tag |
| `shield` | 143 | |
| `fire-flower` | 12 | Burning Hands, Fire Bolt, Wall of Fire… — an icon that depicts a flower |

18% of cards get a shrug. The rules cannot do better, because a name-matching
layer has no way to know that `perspective-dice-six-faces-random` is a die with
question marks or that `broadsword` is not a blowgun.

A previous attempt curated a shortlist from icon **names** alone, which was
found too limited. That diagnosis holds: names are the wrong input.

## Goals

- A committed description for every one of the 4,134 icons, derived from the
  rendered image rather than the icon's name.
- Descriptions consistent enough in shape to drive downstream fuzzy search and
  a later curation pass.
- A re-runnable, resumable generator that survives rate limits and can be
  re-scoped to a subset of icons.

## Non-goals

These are downstream consumers of this artifact, each its own piece of work:

- **Curating a shortlist** from the descriptions, and constraining the
  auto-picker to it.
- **Fuzzy search over descriptions** in `IconPickerDialog`.
- **Rewriting `iconRules.ts`.** It keeps working untouched; this change adds
  data and nothing else reads it yet.
- **LLM card-body summarization**, deferred until this pipeline pattern proves out.

## Approach

Three stages, one entrypoint, one committed artifact:

```
game-icons icons.json
   → rasterize to PNG (cached, gitignored)
   → describe in batches via `claude -p` (blind)
   → src/data/icon-descriptions.json (committed)
```

**The output file is the progress marker.** Resume is
`icons.filter(name => !(name in existing))`. A separate progress file would be a
second copy of the same truth, and its failure mode is silent — a crash between
writing the output and writing the marker redoes or skips work with no error.
Writes are atomic (temp file + rename) after each batch, so a kill mid-write
cannot truncate accumulated work.

### Why rasterize

Claude's vision accepts PNG/JPEG/GIF/WebP, not SVG. Passing the `.svg` would put
path `d` coordinates into context as text — uninterpretable, and exactly the
name-and-markup guessing this change exists to avoid.

Rasterizer choice is not a fidelity question here. Every one of the 4,134 icons
is a single `<path>` with only `fill` and `d` on a uniform 512×512 viewBox — no
gradients, masks, clip paths, strokes, `fill-rule`, or text anywhere in the
collection. Any correct renderer emits the same pixels.

`sharp` is added as an explicit devDependency. It is currently present only
transitively via `wrangler → miniflare`, and this script is meant to be
re-runnable for years; it should not depend on a grandchild of an unrelated package.

Render settings, as validated: **256×256, black on opaque white.** Opaque rather
than transparent, since transparent PNGs composite unpredictably.

### The blind protocol

The model never learns an icon's name. Three separate leaks have to be closed,
and closing only the obvious one is insufficient:

1. **The prompt** carries no names — images only.
2. **Filenames are hashed.** PNGs are cached as `<sha1(name)[:12]>.png`, since
   the model reads file paths. The hash is stable, so the cache still works
   across runs, and `.icon-cache/index.json` maps hash → name for our own
   debugging.
3. **Batch membership is shuffled with a fixed seed.** Alphabetical order in
   this collection correlates strongly with theme — thirteen consecutive keys
   run `fire-bottle, fire-bowl, fire-breath, fire-dash, fire-extinguisher,
   fire-flower, fire-gem, fire-iris, fire-punch, fire-ray, fire-ring,
   fire-shield, fire-shrine`. A naive batch would show the model twelve flame
   images at once and prime it to read any ambiguous shape as fire; `fire-flower`
   sits inside that exact run. The seed keeps runs reproducible: shuffle the
   full list once, then filter out already-described icons, then chunk, so batch
   composition is stable across resumes.

## Artifacts

| path | committed | contents |
|---|---|---|
| `src/data/icon-descriptions.json` | yes | `{ "<icon-name>": "<description>" }`, keys sorted |
| `.icon-cache/<hash>.png` | no | rendered icons, skipped when present |
| `.icon-cache/index.json` | no | hash → name, for debugging |

`src/data/` rather than `data/` because the descriptions ship to the client once
the picker searches them. Estimated ~500KB at ~120 chars per entry, comparable
to the existing `srd-2024-magicitems.json` at 678KB and immaterial against the
already-6.4MB icons chunk.

Sorted keys mean a scoped rerun produces a minimal diff rather than reshuffling
the file. `/.icon-cache/` is added to `.gitignore` — deliberately **not** under
`/generated/`, which `npm run gen:css` wipes on every build, typecheck, and
CSS-module edit hook (`cmk --clean`: "Remove the output directory before
generating files").

## Script interface

`scripts/gen-icon-descriptions.ts`, wired as `npm run gen:icon-descriptions`,
following the existing `scripts/fetch-srd.ts` pattern.

| flag | default | effect |
|---|---|---|
| `--only <names…>` | all | restrict to specific icons; the rerun and fix-up mechanism |
| `--batch-size <n>` | 25 | icons per `claude -p` invocation |
| `--force` | off | re-describe icons that already have descriptions |
| `--validate` | off | run checks against the existing file and exit, describing nothing |
| `--limit <n>` | none | stop after n icons, for smoke-testing a run |

## Prompt and output contract

Each invocation reads N PNGs and returns a JSON object mapping filename stem
(the hash) back to one description. Descriptions are one sentence, ≤25 words,
leading with the primary depicted object and describing only what is visibly
present. Consistent shape matters more than prose quality — it is what makes
downstream fuzzy search and the curation pass work.

The response is parsed by extracting the first `{…}` block and validating with
`zod` (already a dependency, used by `src/data/srd-schema.ts`): every requested
hash present, every value a non-empty string. A batch that fails validation is
logged and skipped rather than aborting the run; because nothing is written for
it, its icons are simply still missing from the output and get picked up by the
next run. This is the same mechanism as resume — there is no failure bookkeeping
to keep in sync.

## Validation

Nobody is reading 4,134 descriptions, so the artifact gets mechanical checks.
The rules live in one module (`scripts/icon-descriptions/validate.ts`) with two
callers: the `--validate` CLI flag, for checking a run you just did, and a
vitest test over the committed file, so a bad entry cannot land silently:

- No empty or whitespace-only descriptions.
- No description that merely restates its icon name (normalized comparison) —
  the signature of name leakage.
- Length within bounds (a floor catches degenerate one-word output; a ceiling
  catches runaway prose).
- No refusal or apology boilerplate ("I can't", "I'm unable", "Sorry"), which
  indicates a call silently degraded.
- Every icon in the collection has an entry; no entries for icons that no longer exist.

Both callers run without `claude` — CI has no credentials and must never invoke
the LLM.

Beyond mechanical checks, `IconDebugView` gains a mode showing image and
description side by side for a random sample, for human spot-checking.

## Measured behavior

From a 12-icon trial run on a deterministic random sample (Sonnet, 256×256):

- **Accuracy: 11/12.** Correct on `turtle-shell`, `ropeway` ("a cable car
  gondola hanging from an overhead cable line"), `guards`, `branch-arrow`,
  `power-button`, and others.
- **The miss was `claw-hammer`**, described as "a hand axe or hatchet held at an
  angle with a chipped blade edge." Inspecting the image, this is a defensible
  misread — the claw reads as a second blade. This is the known cost of the
  blind protocol, and it is the right trade: search indexes **name +
  description together**, so `claw-hammer` remains findable by "hammer" via its
  name while its description honestly reports what is visible. The alternative,
  feeding the name in, reintroduces exactly the name-driven inference that
  produced a flower for every fire spell.
- **Cost: $0.198 for 12 icons, 23s.** The driver is per-invocation harness
  overhead — ~110k tokens of cached system prompt and tool definitions against
  roughly 87 tokens per 256×256 image. Images are nearly free; invocations are not.

Batch size is therefore the dominant cost lever, not image size or a grid
layout. Extrapolating the measured per-call cost: ~$68 at 12 per call, ~$17 at
50, ~$9 at 100. The default of 25 is deliberately conservative — accuracy at
larger batch sizes is **unmeasured**, and 11/12 is a small sample. Tuning it is
part of the separately-scoped batching work.

## Testing

- Rasterization: a rendered icon is a non-empty PNG of the expected dimensions.
- Hashing: stable for a given name, and no collisions across all 4,134 (asserted
  over the real collection).
- Shuffle: seeded and deterministic; the same seed yields the same order, and
  the order differs from alphabetical.
- Resume: given a partial output file, only missing icons are selected; `--force`
  reselects everything; `--only` restricts correctly.
- Response parsing: valid JSON round-trips; a response missing a requested hash,
  or containing a non-string value, is rejected.
- Atomic write: output is complete and parseable after a batch write.
- Validation rules: each check above rejects a crafted bad entry and accepts a good one.

The `claude` subprocess is stubbed in tests. No test invokes the LLM.

## Risks and follow-ups

- **Descriptions are only as good as one blind pass.** The `claw-hammer` class of
  ambiguity is inherent. `--only` exists so specific icons can be regenerated,
  and a human can override any description by editing the committed file — it is
  data, reviewable in a diff, not a black box.
- **Regenerating everything after a prompt change** costs a full run. Since the
  file is committed, a prompt change is a deliberate, reviewable event, and
  `--only` allows incremental adoption.
- **The 6.4MB icons chunk** is untouched here. Once curation lands, shipping only
  curated icons plus descriptions could cut it substantially — a real win, but
  out of scope.
- **`total_cost_usd` is reported per invocation** by `claude -p --output-format
  json`. Logging it per batch gives a running total and makes a runaway run obvious.
