# LLM-generated descriptions for the full game-icons set

## Problem

Icon assignment is driven by `src/cards/iconRules.ts` — 218 lines of regex over
`name + headerTags`. Run against the SRD bundles (2,354 cards, 1,604 distinct
names), it reaches **34 of the 4,134 available icons**:

| icon | cards | distinct names | |
|---|---|---|---|
| `perspective-dice-six-faces-random` | 581 | 421 | the fallback: every Amulet, Bag, Belt, Boots, Brooch, Broom, Candle, Carpet… |
| `broadsword` | 472 | 365 | includes Blowgun +1/+2/+3 and Club +1/+2/+3 — the generic weapon rule matches the literal `Weapon` category tag |
| `shield` | 181 | 142 | |
| `fire-flower` | 24 | 12 | Burning Hands, Fire Bolt, Wall of Fire… — an icon that depicts a flower |

**24.7% of cards (26.2% of distinct names) get the fallback** — a die with
question marks on it.

Names alone are insufficient input. A name-matching layer has no way to know
that `perspective-dice-six-faces-random` depicts a shrug or that `broadsword` is
not a blowgun. A previous attempt curated a shortlist from names alone and was
found too limited. Note the narrower claim: names carry real signal — they are a
useful *search* key — but they cannot be checked against what an icon actually
depicts. Descriptions add an orthogonal channel that can.

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
- **Fuzzy search over descriptions** in `IconPickerDialog`. With the
  domain-aware prompt this no longer has to wait for curation — see "What
  descriptions can and cannot support" below.
- **Rewriting `iconRules.ts`.**
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
second copy of the same truth whose failure mode is silent.

That property only holds if **nothing invalid is ever written**. Per-entry
validation therefore runs at batch-acceptance time, before the merge — see
"Validation". An entry that lands bad is permanent, because resume sees the key
present and skips it forever.

### What "the collection" means

`Object.keys(iconsJson.icons)` — **4,134** entries, including the one `hidden`
icon (`female-vampire`). The bundle also carries **3 aliases** (`eskimo`,
`sattelite`, `star-sattelites`), which are excluded: they are not in `icons` and
resolve to their parent's artwork.

This matters because `IconPickerDialog.tsx:80` enumerates with
`listIcons("", "game-icons")`, which returns **4,137** — `@iconify/react` folds
aliases into storage. Downstream consumers must resolve an alias to its parent's
description rather than expect its own entry. The generator and the validator
both use the 4,134 figure.

### Rasterization

Claude's vision accepts PNG/JPEG/GIF/WebP, not SVG. Passing the `.svg` would put
path `d` coordinates into context as text — uninterpretable, and exactly the
markup-guessing this change exists to avoid.

Rasterizer choice is not a fidelity question. Every one of the 4,134 icons is a
single `<path>` with only `fill` and `d` on a uniform 512×512 viewBox — no
gradients, masks, clip paths, strokes, `fill-rule`, or text anywhere in the
collection. Any correct renderer emits the same pixels.

Three details the render must get right:

1. **`fill` is `currentColor` on every icon.** The wrapper must substitute an
   explicit `#000` rather than rely on a renderer's default, or the run silently
   describes 4,134 blank squares.
2. The `body` fragment needs wrapping in `<svg xmlns viewBox="0 0 512 512">`.
   `scripts/generate-og.ts:33-41` already builds exactly this wrapper.
3. Composite onto opaque white (`.flatten({ background: "#fff" })`); transparent
   PNGs composite unpredictably.

**Resolution is 256×256, and this is not yet validated against the alternative.**
The trial ran at 256, downsampling 2× from the 512 sources. The one recorded
miss (`claw-hammer`, read as a hatchet — thin claw geometry) is the kind of error
a 2× downsample produces. 512×512 costs ~350 tokens/image versus 87, roughly +$3
across a full run. See "Open experiments".

`sharp` is added as an explicit devDependency (**requires approval** per
CLAUDE.md's "Ask before `npm install`"). It is currently present only
transitively via `wrangler → miniflare`, and this script should not depend on a
grandchild of an unrelated package. The repo does already rasterize a game-icons
SVG in `scripts/generate-og.ts` via Playwright Chromium; sharp is preferred here
because 4,134 headless conversions through a browser is the wrong tool, but the
Playwright path is a working fallback if adding a dependency is unwelcome.

### The blind protocol

The model is not told an icon's name. Three in-context leaks are closed:

1. **The prompt** carries no names — images only.
2. **Filenames are hashed** to `sha1(name)` truncated to 12 hex chars, since the
   model reads file paths. Verified collision-free across all 4,134.
3. **Batch membership is shuffled with a fixed seed.** Alphabetical order
   correlates strongly with theme — thirteen consecutive keys run `fire-bottle`
   through `fire-shrine`. A naive batch would show twelve flame images at once
   and prime the model to read ambiguity as fire; `fire-flower` sits inside that
   run.

**`.icon-cache/index.json` (hash → name) must live outside the directory the
model can read.** Images go in `.icon-cache/png/<hash>.png` and the invocation is
scoped to that subdirectory. An index file sitting beside the images is a
plaintext answer key in the working directory, which defeats defense 2 entirely.

Two limits stated honestly:

- **Blindness is a prompt-and-cwd property, not an enforced one.** With
  filesystem tools available, a sufficiently curious agent could read
  `icons.json` directly. Scoping the working directory and `--allowedTools Read`
  is the mitigation.
- **Parametric recognition is not addressed.** game-icons is a large public
  CC-BY collection; the model has likely seen these rasters with their names in
  training. If it recognizes an asset rather than reading pixels, name-derived
  inference re-enters through a door these three defenses do not lock. This may
  even produce better descriptions — but the spec should not claim blindness is
  achieved when only the in-context channel is closed. See "Open experiments".

A caveat on `--only` reruns: regenerating "the fire ones" by hand recreates
exactly the thematic clustering the seeded shuffle prevents. Fix-up batches
should be assembled from the shuffled order, not hand-grouped.

## Artifacts

| path | committed | contents |
|---|---|---|
| `src/data/icon-descriptions.json` | yes | `{ "<icon-name>": "<description>" }`, keys sorted |
| `.icon-cache/png/<hash>.png` | no | rendered icons, skipped when present |
| `.icon-cache/index.json` | no | hash → name, for debugging; outside `png/` |

`src/data/` rather than `data/` because the descriptions ship to the client once
the picker searches them. Realistically **~600–650KB** (4,134 × ~120 chars of
prose, plus keys, punctuation, and pretty-printing) — comparable to
`srd-2024-magicitems.json` at 678KB, and immaterial against the 6.4MB icons
chunk. Nothing imports it in this change, so it does not reach the bundle yet.

Serialization matches `scripts/fetch-srd.ts:71` exactly:
`JSON.stringify(sorted, null, 2) + "\n"`. Keys sorted with plain `.sort()`
(code-unit order — **not** `localeCompare`, whose hyphen handling would churn
diffs among `fire-bolt`/`firebolt`-style neighbours). `biome.json` covers
`src/**`, and pre-commit runs `biome-check` and `end-of-file-fixer`, so this
formatting is required, not cosmetic. A missing output file is treated as `{}`.

`/.icon-cache/` is added to `.gitignore` — deliberately **not** under
`/generated/`, which `npm run gen:css` wipes on every build, typecheck, and
CSS-module edit (`cmk --clean`: "Remove the output directory before generating
files").

**Cache invalidation:** the cache key is `sha1(name)`, which does not cover the
artwork or the render settings. Bumping `@iconify-json/game-icons` or changing
resolution would silently reuse stale PNGs. `index.json` records the icon-set
version and render settings; a mismatch invalidates the whole cache directory.

## Script interface

`scripts/gen-icon-descriptions.ts`, wired as `npm run gen:icon-descriptions`.
Arguments via `node:util parseArgs`.

| flag | default | effect |
|---|---|---|
| `--only <name>` | all | repeatable (`multiple: true`); implies `--force` for the named icons. An unknown name is a hard error listing the offenders. |
| `--batch-size <n>` | 25 | icons per `claude -p` invocation |
| `--force` | off | re-describe icons that already have entries |
| `--validate` | off | run per-entry checks over the committed file and exit; exclusive — combining it with any other flag is an error (exit 2) |
| `--limit <n>` | none | truncate the selection to n icons, for smoke-testing |

**Selection pipeline, in order:** all 4,134 → seeded shuffle → `--only` filter →
drop already-described (unless `--force`/`--only`) → `--limit` truncate → chunk
by `--batch-size`. A final short batch is fine.

`--force` **merges into existing content and never truncates**, so a crash
cannot destroy prior work. It is explicitly non-resumable: a restarted `--force`
run re-describes from scratch, at full cost. Pair it with `--only` for bounded
re-runs.

**Invocations are sequential.** Concurrency is out of scope: the write design
("read existing, merge, atomic rename") is a lost-update race under concurrent
writers. A `wx`-flag lockfile in `.icon-cache/` prevents two runs in two
terminals from silently clobbering each other. At ~166 sequential invocations,
expect **1–2 hours wall clock** for a full run.

## The `claude -p` contract

- Model pinned in a script constant, not inherited from operator config — the
  measurements below are Sonnet-specific.
- `--output-format json`. **stdout is an envelope**
  (`{"type":"result","is_error":…,"result":"<model text>","total_cost_usd":…}`).
  Parse with `JSON.parse(stdout)`, check `is_error`, then extract the description
  object from `envelope.result`. Naively "extracting the first `{…}` block" from
  stdout yields the envelope and fails every batch forever.
- Within `.result`: strip ``` fences, then take the first `{` through its
  matching `}` via depth counting. Test fixtures must include a fenced response
  and one with a prose preamble.
- Images referenced by absolute path with `--allowedTools Read`, working
  directory scoped to `.icon-cache/png/`.
- **Per-invocation timeout** (300s) with an explicit kill signal. An unbounded
  hang stalls the entire run with no output — the most likely real-world failure
  across ~166 invocations.
- Fail fast with a clear message when the `claude` binary is absent or
  unauthenticated.

The literal prompt lives in one exported constant
(`scripts/icon-descriptions/prompt.ts`) and is reproduced verbatim in the plan.
Prompt stability is load-bearing — a change means a full regeneration — so it
must be a reviewable constant, not a paraphrase.

### Failure policy

Distinguish three cases, because they need different handling:

| failure | handling |
|---|---|
| subprocess error (non-zero exit, timeout, rate limit) | retry up to 2× with backoff (5s, 20s), then log and skip |
| response unparseable | log and skip the batch |
| individual entry fails per-entry validation | drop **that entry**, keep the rest of the batch |

Nothing failed is written, so failures are simply still-missing keys that the
next run picks up. That is the same mechanism as resume — no separate
bookkeeping.

**Partial batch acceptance is required.** All-or-nothing discards 24 good
descriptions because of 1 bad one, and if a specific image reliably trips the
model, that batch fails on every run and its other 24 icons are never persisted
— a permanent hole indistinguishable from "not done yet". Responses are also
rejected for *unknown* hashes (an unmapped hash would otherwise be written under
the wrong icon); extra keys are ignored, missing ones simply retried.

**Abort threshold.** After 3 consecutive batch failures the run exits non-zero.
This mirrors `scripts/fetch-srd.ts:90-101`, which throws on a >10% row loss
precisely so a systemic failure cannot produce a quietly "successful" run.
Without it, an expired credential at batch 3 of 166 logs 163 failures, writes
nothing, and exits 0.

## Description style

**Blind means blind to the *name*, not blind to the *domain*.** An earlier draft
conflated the two and required purely literal pixel description. That was an
over-correction: withholding domain context does not close any leak the three
defenses don't already close, and it strips out the vocabulary downstream search
needs.

Structure, in one sentence of ≤30 words:

1. **Literally what is depicted**, leading with the primary object named as
   specifically as the image supports. Naming a recognizable object by its
   conventional name is required, not forbidden — calling a caduceus a caduceus
   is reading the image, not the filename.
2. **Then, only if a well-established real-world or fantasy-genre association
   exists**, what it conventionally symbolizes. No invented flavor text; nothing
   the image does not show.

The prompt states that these are icons for a D&D spell-and-item card app.

### Measured: the conditional clause self-regulates

Both halves of this were A/B'd on 12-icon samples (see "Measured behavior").
The conditional in step 2 is load-bearing — it is what stops the model straining
to find a D&D reading for irrelevant icons, and it works without any explicit
"flag as irrelevant" instruction:

| icon | output |
|---|---|
| `laptop` | "A laptop computer shown open with its screen and keyboard visible." — **association clause omitted entirely** |
| `basketball-ball` | "A basketball, the ball used in the sport of basketball." |
| `card-7-clubs` | "A playing card depicting the Seven of Clubs." — no invented meaning |
| `card-ace-spades` | "…historically nicknamed the 'death card', associated with fate or bad luck" — genuine association surfaced |
| `turtle-shell` | "…commonly symbolizes protection or defense" |
| `dragon-head` | "…a classic fantasy creature symbolizing danger or power" |

**No relevance flag is added.** "Is this D&D-relevant" is the curation pass's
judgment, and a per-icon boolean produced inside a 25-icon batch has no global
view, whereas curation sees all 4,134 descriptions at once. Same reasoning as
deferring tags.

### What descriptions can and cannot support

With domain context, functional vocabulary does appear — "protection", "fire
damage", "fire magic", "battle" all surfaced in testing. This substantially
relaxes, but does not eliminate, the lexical gap: `IconPickerDialog.tsx:123`
filters with a plain `.includes()` substring match and `fuzzysort` (already a
dependency) is lexical, not semantic, so retrieval still depends on the
association clause happening to contain the user's word.

Fuzzy search over descriptions is therefore **viable independently of
curation** — a reversal of this spec's earlier position, which assumed literal
descriptions and concluded search had to wait. Confidence is moderate: the
evidence is two 12-icon samples, not a retrieval benchmark.

The corollary for consumers with no human in the loop still stands: **the name
is a search signal, not a semantic one.** Indexing name + description recovers
the bad-description/good-name case (`claw-hammer` findable via "hammer"), does
*nothing* for bad-description/bad-name, and a curation or rules pass matching on
names alone reproduces the `fire-flower` defect this work exists to fix.

**Deferring keywords/tags remains correct**, on one condition: it holds only if
the curation pass re-renders the images. If curation works from this text alone,
these descriptions become the permanent text proxy for every future semantic
pass.

## Validation

The rules live in `src/data/iconDescriptions.ts` with its test beside it —
**`src/`, not `scripts/`**, because `vitest.config.ts` includes only
`src/**/*.{test,spec}.{ts,tsx}`. A test under `scripts/` is never collected and
`npm test` goes green having asserted nothing. `scripts/fetch-srd.ts:5-9`
already sets the precedent of a script importing from `src/data/`.

Two tiers, because conflating them makes `--validate` fail by construction after
any partial run:

**Per-entry** (run at batch acceptance, by `--validate`, and by the test):
- Non-empty, not whitespace-only.
- Length 15–200 **characters**. The 25-word prompt instruction is guidance; the
  character bound is the hard gate.
- No refusal/apology boilerplate ("I can't", "I'm unable", "Sorry") — the
  signature of a silently degraded call.

**Completeness** (the vitest test only, never `--validate`):
- All 4,134 icons present; no entries for icons no longer in the collection.

So a `--limit` smoke run or an `--only` fix-up leaves a file that passes
`--validate`. The PR that adds the script also commits the complete file;
otherwise CI is red from the first commit until a full run lands.

**Name/description agreement is reported, not enforced.** An earlier draft
failed entries that restate their icon name, calling it "the signature of name
leakage." That is backwards: under a blind protocol the model cannot see the
name, so agreement is the *expected* result for an unambiguously drawn icon —
the rule would fail on the best entries in the file, including `turtle-shell`,
which the trial run records as a success. Inverted, it becomes the artifact's
most useful signal: `--validate` reports the agreement rate, and the
disagreements are the human review queue and a per-icon confidence marker
separating "trust the name" (`turtle-shell`) from "the name misleads"
(`fire-flower`).

The test must call `vi.importActual` for the icon collection: `src/test/setup.ts`
globally mocks `@iconify-json/game-icons/icons.json` down to a **2-icon**
fixture, so completeness and collision assertions would otherwise pass
vacuously. `src/cards/iconRules.test.ts:16` shows the pattern. A sharp
rasterization test needs `// @vitest-environment node`, since the suite is jsdom.

Neither caller needs `claude`; CI has no credentials and must never invoke the LLM.

Beyond mechanical checks, `IconDebugView` gains a side-by-side image/description
mode: a fixed sample of 24 drawn from the same seeded shuffle plus a "Reroll"
button, **plus a filter seeded with the 34 icons `iconRules.ts` currently
references** — those are the descriptions that matter on day one, and random
sampling over 4,134 would essentially never surface them. It renders via the
existing `IconPreview` (SVG; the PNGs are gitignored and unavailable to the app)
and loads the JSON through a dynamic `import()` so the 600KB stays out of the
main chunk — `src/app/router.tsx:15` imports `IconDebugView` statically.

## Measured behavior

From a 12-icon trial on a deterministic random sample (Sonnet, 256×256):

- **11/12 matched their icon name on inspection.** Note what this grades: it is
  *name recovery*, judged by a grader who knew the names. It is a reasonable
  smoke test, not a measure of description quality, and it is in tension with
  the goal — it counts `claw-hammer` as a miss and then argues the miss is
  acceptable. 11/12 carries a 95% Wilson interval of roughly **[65%, 99%]**; at
  the lower bound ~1,450 of 4,134 entries would be wrong.
- **The miss was `claw-hammer`**, described as "a hand axe or hatchet held at an
  angle with a chipped blade edge." Inspecting the image, that is a defensible
  misread — the claw reads as a second blade.
- **Cost: $0.198 for 12 icons, 23s** (literal-only prompt); **$0.234, 47s** with
  the domain-aware prompt, which produces longer output.

Three prompt variants were run, all blind, all 12 icons:

1. **Literal-only** — accurate but no functional vocabulary.
2. **Domain-aware** — functional vocabulary appears; `claw-hammer` regressed from
   the hedged "a hand axe or hatchet" to the confident "A hand axe (tomahawk)".
   Domain priming makes wrong answers *more assured*, which raises the value of
   the name/description disagreement report.
3. **Domain-aware on deliberately irrelevant icons** — no strain, no invented
   fantasy readings (table above).

Incidental evidence on parametric recognition: the model read rank *and* suit
correctly off three different playing cards. It cannot have inferred "Seven of
Clubs" from a hash, so at least some of the time it is genuinely reading pixels.

### Cost is subscription usage, not dollars

`total_cost_usd` reports **API-equivalent** pricing. Run under a Claude
subscription, these invocations draw down plan usage; they are not billed. The
binding constraints are therefore **usage limits and wall clock**, not money.

This reframes the batch-size question: it is not "how do I spend less" but "how
much quota does a full run consume, and how likely am I to hit a limit partway
through". It also makes resumability the load-bearing property of the design
rather than a nicety — **hitting a usage limit is the expected interruption**,
not an exotic one.

**The cost curve is still one data point and two models fit it equally well.**
Per-invocation cost gives ~$68-equivalent at batch 12, ~$33 at 25, ~$9 at 100.
Per-icon cost — which an agentic read-one-file-at-a-time loop produces — gives
~$68 at *every* batch size. The two are indistinguishable at N=12 by
construction and differ 7× at N=100. Batch-size savings remain **hypothetical**;
the batch-size default of 25 is a guess, not a finding. The curve also omits
retry cost, which rises with batch size.

## Open experiments

Two measurements, neither blocking the plan, both changing defaults if they come
back unexpected. Grading is the bottleneck, not generation, so each is designed
to minimize what has to be judged by hand.

1. **Cost curve — 4 runs, no grading.** The same 60 icons at batch 10 / 20 / 30 /
   60. Identical work, different invocation counts; read `total_cost_usd` off
   each. Discriminates per-invocation from per-icon and settles `--batch-size`.
2. **Blind versus named — 2 runs, needs grading.** The same 60 icons, one batch
   size, with and without the icon name in the prompt. **This control has never
   been run.** Blindness is currently justified by reasoning, not measurement:
   the `fire-flower` evidence shows name-based *rules* fail, which is not the
   same claim as name-*informed descriptions* being worse. If outputs are
   near-identical, hash filenames and seeded shuffle can be simplified away.

A third, lower priority: **512×512 versus 256×256** on the same sample, testing
the lever most likely to fix the `claw-hammer` class at ~+4× image tokens.

## Testing

Structured so the units are testable: `claude` invocation sits behind an
injectable seam (`describeBatch(images, { run })` defaulting to the real
`execFile`), and selection is a pure exported function
(`selectIcons({ all, existing, only, force, limit })`). Otherwise the tests have
to mock `node:child_process` globally.

- **Rasterization:** a rendered icon is a non-empty PNG of the expected
  dimensions **and is not blank** (assert dark pixels are present via
  `sharp().stats()`) — the `currentColor` hazard makes the blank case real.
- **Hashing:** stable per name; collision-free across all 4,134 (via `importActual`).
- **Shuffle:** seeded and deterministic; differs from alphabetical order.
- **Selection:** resume picks only missing icons; `--force` reselects all;
  `--only` restricts and implies force; `--limit` truncates before chunking.
- **Response parsing:** the `--output-format json` envelope is unwrapped
  correctly; fenced and preamble-prefixed responses parse; a missing hash, a
  non-string value, and an unknown hash are each rejected.
- **Partial acceptance:** a batch with one bad entry writes the other 24.
- **Merge semantics:** writing batch 2 does not drop batch 1; output keys are
  sorted. (Real atomicity is not unit-testable and should not be attempted.)
- **Failure policy:** transient errors retry; the run aborts non-zero after 3
  consecutive batch failures.
- **Per-entry validators:** each rejects a crafted bad entry and accepts a good one.

Implementation note: `tsconfig.node.json` has no `resolveJsonModule`, so the
script cannot `import` the collection JSON. Use `createRequire(import.meta.url)`
+ `require.resolve` + `readFileSync`, as `scripts/generate-og.ts:33-36` does.
The seeded shuffle needs a small inline PRNG — mulberry32 + Fisher-Yates, ~6
lines, with `const SHUFFLE_SEED = 20260725` — rather than a new dependency.

## Risks and follow-ups

- **Manual edits do not survive `--force`.** Descriptions are data and a human
  may correct one in the committed file, but a full `--force` run overwrites it
  and the flat map has nowhere to record provenance. The sanctioned repair path
  is `--only <name>` plus a commit. If hand-correction becomes common, a sibling
  `icon-descriptions-overrides.json` merged at read time and never written by
  the script is the minimal fix — deliberately deferred as YAGNI.
- **A prompt change costs a full regeneration.** Incremental adoption via
  `--only` is *not* recommended: it leaves the file a mix of two prompt versions
  with no marker distinguishing them, in an artifact whose value is consistency.
- **~204 icons produce accurate descriptions no D&D query will want** — 121
  `abstract-*`, 61 `card-*`, 22 `tarot-*`, about 5% of the run. Verified in
  testing: they come out correct and boring (`card-7-clubs` → "A playing card
  depicting the Seven of Clubs"). Not worth special-casing; describing all 4,134
  buys completeness and a simpler contract. A wider count of 41 first-token
  groups of ≥8 covers 629 icons, so the genuinely-unreachable fraction may be
  larger.
- **`IconDebugView` sampling has poor power for systematic faults.** If 1 batch
  in 50 goes bad, a 24-icon random sample catches it about a third of the time.
  It judges quality; it does not detect per-batch faults.
- **The 6.4MB icons chunk** is untouched here. Once curation lands, shipping only
  curated icons could cut it substantially — out of scope.
- **Log `total_cost_usd` per batch** for a running total, so a runaway run is
  obvious.
