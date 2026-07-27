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

## Out of scope for this change

This spec covers **producing the description file and nothing else**. The
consumers below are wanted — search especially — but each is its own piece of
work, and the generator is the risky part that deserves review on its own.

- **Fuzzy search over descriptions** in `IconPickerDialog` — **a goal of the
  wider effort, sequenced next**, not a rejected idea. It no longer waits on
  curation; see "What descriptions can and cannot support". Its first version
  needs no new data: index name + description with `fuzzysort`, already a
  dependency at `^3.1.0`, replacing the plain `.includes()` at
  `IconPickerDialog.tsx:123`.
- **Curating a shortlist** from the descriptions, and constraining the
  auto-picker to it.
- **A generated synonym or "search text" field.** Deliberately not part of this
  artifact; the reasoning is in "What descriptions can and cannot support".
- **Rewriting `iconRules.ts`.**
- **LLM card-body summarization**, deferred until this pipeline pattern proves out.

## Approach

Three stages, one entrypoint, one committed artifact:

```
game-icons icons.json
   → rasterize to PNG (cached, gitignored)
   → describe in shuffled batches via `claude -p` (name-informed)
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

**Resolution is 512×512 — the source viewBox, with no downsampling.** Earlier
runs rendered at 256 and the one recorded miss of this kind (`claw-hammer`, read
as a hatchet — thin claw geometry) is exactly the error a 2× downsample produces.
Rendering at native size removes resolution as a variable. `--size` overrides it.

**Resolution is a quality lever with a real cost tail under the API transport.**
Claude prices images by dimensions — `ceil(w/28) × ceil(h/28)` tokens — so
512×512 is **361 tokens** against 100 at 256×256. Under `--transport cli` that
difference is noise beside the agent scaffolding. Under `--transport api` images
dominate the bill, and dropping to 256 would cut a full run by roughly 45%. That
trade is deliberately not taken: the artifact is permanent and its errors are
only fixable by hand, so quality outranks a few dollars.

**PNG, not JPEG,** for the same reason: token cost is dimensional, so JPEG saves
zero, while its ringing artifacts degrade precisely the thin black-on-white
strokes that already fail. At 512 the rendered collection measures **18KB
average, 71MB total** (97MB once base64-encoded for the API transport).

`sharp` is an explicit devDependency (`^0.35.3`, approved and committed). It was
previously present only transitively via `wrangler → miniflare`, and this script
should not depend on a grandchild of an unrelated package. The repo does already
rasterize a game-icons SVG in `scripts/generate-og.ts` via Playwright Chromium;
sharp is preferred here because 4,134 headless conversions through a browser is
the wrong tool. Note its entry point is `sharp/dist/index.cjs` at 0.35.x.

### The name is included; batch order is randomized

**The prompt gives the model each icon's name, subordinated to the image.** An
earlier draft withheld names behind a three-part "blind protocol" — hashed
filenames, a seeded shuffle, and a name-free prompt. A/B measurement rejected it.

The authority clause is load-bearing and ships verbatim with the prompt:

> Each filename is the icon's name in the collection. The name is a hint, but the
> image is authoritative — where they disagree, describe the image.

#### Measured: blind vs. named, 60 icons, batch 30

Same 60 icons (seeded sample of the full collection), same prompt but for the
clause above, graded against the rendered images. **Blind produced 8 clearly
wrong descriptions; named produced 2.**

| icon | blind | named |
|---|---|---|
| `flamethrower` | "a rifle fitted with a bayonet … infantry weaponry" | "nozzle emitting flame, connected by a hose to a two-cylinder fuel tank" |
| `bellows` | "a bound broom or besom shown swinging" | "an accordion-style hand pump with a narrow nozzle, shown mid-squeeze" |
| `thunder-blade` | "a straight sword and a curved blade crossed" | "a jagged lightning-bolt-shaped blade crossed with a straight sword" |
| `spiral-thrust` | "a fin-like shape between them" | "one wrapped in a spiraling vortex line" |
| `sea-star` | "a shooting star … symbolizes a wish" | "resembling a starfish" |
| `architect-mask` | "hooded or ghost-like silhouette" | "a mask-like face … eye sockets pierced by needle-like spikes" |

The blind failures were **systematic, not sampling noise**: `flamethrower`,
`bellows`, `sea-star`, and `energy-sword` came back wrong in the same way at
every batch size tested (10, 20, 30, 60). No batch size reaches them.

The named descriptions add detail the name does not contain — the hose and fuel
tank, the accordion body mid-squeeze. **The name unlocks the model's reading of
the image rather than substituting for it.**

#### Measured: the name does not induce parroting

Three independent checks, all from the same run:

- `card-king-spades` — the model **contradicted the filename**, calling a corner
  pip a heart.
- `pick-of-destiny` — ignored the Tenacious D reference entirely and described
  what is there: a horned, skull-like ram mask.
- `abstract-092` — declined to invent: "no representational subject."

Cost of including the name is **+17%** ($0.732 vs $0.625 per 60 icons at batch
30) — the descriptions are longer and more specific.

Two limits stated honestly: the grading was **not blind to condition**, and 60
icons is a small sample. Both cut against the measured margin, but the margin is
4× and the failure mode was systematic rather than marginal.

#### Randomized order is retained

Batch membership is still shuffled with a fixed seed, and this is now a
**precaution rather than a measured result** — the leak it was one of three
defenses against no longer exists.

The rationale that survives: alphabetical order correlates strongly with theme —
thirteen consecutive keys run `fire` through `fire-zone`, with `fire-flower`
inside that run. Homogeneous batches plausibly homogenize descriptions, costing
the discriminating detail search depends on, and a batch of thirty names sharing
a prefix is the condition most likely to induce the name-following the authority
clause otherwise prevents. Randomizing is free; the untested hypothesis is that
clustering hurts. See "Open experiments" for the run that would settle it.

**The shuffle runs over the full 4,134 before any filtering; chunking happens
after.** The shuffle is what breaks up thematic clustering, and it must see the
whole collection to do that. Batch *boundaries*, though, are recomputed on every
resume: the survivors are packed densely into full batches rather than preserving
whole-collection chunk positions.

An earlier draft pinned the boundaries so that a resume shrank batches rather
than recomposing them. That is the wrong trade. Nothing consumes a batch index,
and preserving boundaries leaves a resume running mostly-singleton invocations —
each paying the same fixed per-invocation cost as a full batch, and singletons
make the consecutive-failure abort trivially reachable. Dense packing keeps the
anti-clustering property (membership is still drawn from shuffled order) while
keeping every invocation economically full.

A caveat on `--only` reruns: regenerating "the fire ones" by hand recreates
exactly the thematic clustering the shuffle avoids. Fix-up batches should be
assembled from the shuffled order, not hand-grouped.

## Artifacts

| path | committed | contents |
|---|---|---|
| `src/data/icon-descriptions.json` | yes | `{ "<icon-name>": "<description>" }`, keys sorted |
| `src/data/icon-descriptions-overrides.json` | yes | hand-written corrections; merged over the generated map at read time, never written by the script |
| `.icon-cache/png/<icon-name>.png` | no | rendered icons, skipped when present |
| `.icon-cache/meta.json` | no | icon-set version + render settings, for cache invalidation |
| `.icon-cache/run.lock` | no | `wx` lockfile; released via `process.exit` on signal |

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

**Cache invalidation:** the cache key is the icon name, which does not cover the
artwork or the render settings. Bumping `@iconify-json/game-icons` or changing
resolution would silently reuse stale PNGs. `meta.json` records the icon-set
version and render settings; a mismatch invalidates the whole cache directory.

Filenames are the plain icon names. Hashing them was a blind-protocol defense and
is now dead weight — it made the cache undebuggable and required an answer-key
file kept outside the readable directory.

## Script interface

`scripts/gen-icon-descriptions.ts`, wired as `npm run gen:icon-descriptions`.
Arguments via `node:util parseArgs`.

| flag | default | effect |
|---|---|---|
| `--only <name>` | all | repeatable (`multiple: true`); implies `--force` for the named icons. An unknown name is a hard error listing the offenders. |
| `--batch-size <n>` | 30 | icons per invocation; see the measured curve below |
| `--force` | off | re-describe icons that already have entries |
| `--validate` | off | run per-entry checks over the merged generated+overrides map and exit; exclusive — combining it with any other flag is an error (exit 2) |
| `--limit <n>` | none | truncate the selection to n icons, for smoke-testing |
| `--model <name>` | `sonnet` | the measurements are Sonnet-specific; the flag exists to re-run the comparison, not for routine use |
| `--size <n>` | 512 | render resolution; changing it invalidates the whole PNG cache |
| `--transport <cli\|api>` | `cli` | which back end runs the batch — see "Transports" |
| `--max-cost <usd>` | none | stop once the running total reaches this ceiling, checked after every batch |

**Selection pipeline, in order:** all 4,134 → seeded shuffle → `--only` filter →
drop already-described (unless `--force`/`--only`) → `--limit` truncate → chunk
by `--batch-size`. A final short batch is fine. The shuffle comes first and over
the full collection precisely so that resumes shrink batches rather than
recompose them.

`--force` **merges into existing content and never truncates**, so a crash
cannot destroy prior work. It is explicitly non-resumable: a restarted `--force`
run re-describes from scratch, at full cost. Pair it with `--only` for bounded
re-runs.

### Spend rails

Three, and only under `--transport api`, where a mistake costs money rather than
quota that refills:

1. **Bare `--force` is refused.** Unscoped it re-describes all 4,134 icons, one
   keystroke away from the scoped re-run that was almost certainly meant. It has
   to be qualified by `--only` or `--limit`.
2. **`--max-cost <usd>`** stops the run after the batch that crosses the ceiling.
   Everything accepted so far is already on disk, so a stopped run resumes.
3. **A cost estimate prints before the first request**, from the icon count and
   the resolved price. It is labelled a floor: it counts image and text tokens
   and nothing for thinking.

**Invocations are sequential.** Concurrency is out of scope: the write design
("read existing, merge, atomic rename") is a lost-update race under concurrent
writers. A `wx`-flag lockfile in `.icon-cache/` prevents two runs in two
terminals from silently clobbering each other. At batch 30 that is **138
invocations** for a full run — ~3.2 hours wall clock under `cli`, measured. Under
`api` the binding constraint is per-request latency rather than quota: the whole
job is ~1.5M input tokens against a 2,000,000 ITPM Start-tier limit, so rate
limiting never engages.

## Transports

Both transports implement one seam — `DescribeBatch`, in
`scripts/icon-descriptions/transport.ts`, alongside the schema builder, the
response filter, and the failure type they share — so `runBatches` is unaware of
which is in play. They send the same images under the same prompt with the same
schema, and differ only in delivery and billing.

**Shared contract.** Model pinned in a script constant, not inherited from
operator config; the measurements below are Sonnet-specific. The literal prompt
lives in one exported constant (`scripts/icon-descriptions/prompt.ts`). Prompt
stability is load-bearing — a change means a full regeneration — so it must be a
reviewable constant, not a paraphrase. Both fail fast, before any PNG is
rendered, when their credential is missing.

**Response shape is schema-constrained, not parsed out of prose.** Naming every
requested icon as a required property with `additionalProperties: false` turns a
short or renamed response into a constraint violation rather than a silent
shortfall paid for again later. `responseSchema()` builds it once and both
transports use it unchanged. This replaced an earlier design that stripped ```
fences and depth-counted braces out of free-form model text; that machinery is
gone, and with it the fenced/preamble test fixtures it needed.

### `--transport cli` (default)

Shells out to `claude -p` with `--output-format json`, `--json-schema`, and
`--allowedTools Read`, working directory scoped to `.icon-cache/png/` so the
agent reads the images off disk itself. stdout is an envelope; the descriptions
are in `structured_output` and the cost in `total_cost_usd`. A run reporting
`subtype: "success"` with no `structured_output` is a failure, not an empty
batch. Per-invocation timeout 600s with an explicit kill signal — an unbounded
hang stalls the entire run with no output.

Spends subscription quota, not money. This is the default so that a bare
`npm run gen:icon-descriptions` cannot bill anyone by accident.

### `--transport api`

Posts directly to the Messages API with images inline as base64, using native
structured output (`output_config.format`) for the same constraint the CLI gets
from `--json-schema`. Bare `fetch`; no SDK dependency for a single POST. Auth via
`ANTHROPIC_API_KEY`, which is Console billing and entirely separate from both the
subscription and purchasable usage credits.

The pinned prompt names files, because the CLI reads them itself. Over HTTP
nothing carries a filename, so **each inline image is preceded by a text block
naming it** — that label, not position, is what ties a description back to an
icon. `prompt.ts` is untouched.

Cost is computed from `usage` against a per-model price table, keyed by both the
friendly alias and the concrete model id. Only models with confirmed pricing are
accepted: a guessed rate would report a run's spend as fact while being wrong
about it, which is worse than refusing the model. An introductory rate carries
its own expiry date, so a run after it lapses prices at the standard rate rather
than under-reporting by a third. A response that reports no `usage` is a failure
for the same reason — real money spent, none of it accounted for.

`max_tokens` is a ceiling, not a reservation, and unused headroom is not billed.
Thinking tokens draw on the same budget as the ~3k tokens of JSON a 30-icon batch
emits, so it is set at 32,000: a tight limit saves nothing and truncates the
object mid-string. Where the response reports `thinking_tokens`, the per-batch
log line carries it, which is what makes the cost of adaptive thinking
measurable.

**Why it exists:** roughly 91% of the CLI transport's tokens are agent
scaffolding rather than images. Purchasable usage credits bill the CLI path at
standard API rates, which makes finishing the run on credits cost ~$65 against
~$4.70 direct — the same output for ~14× the money.

### Failure policy

Distinguish three cases, because they need different handling:

| failure | handling |
|---|---|
| transport error (non-zero exit, timeout, non-2xx, rate limit) | retry up to 2× with backoff (5s, 20s), then log and skip |
| response unparseable, or parseable but carrying no valid entry | **retry** on the same path, then log and skip |
| individual entry fails per-entry validation | drop **that entry**, keep the rest of the batch |
| HTTP 400/401/403/404 | **fatal** — abort the run without retrying |
| `stop_reason: "refusal"` | skip the batch without retrying; continue to the next |

Nothing failed is written, so failures are simply still-missing keys that the
next run picks up. That is the same mechanism as resume — no separate
bookkeeping.

The last two rows exist because the backoff ladder assumes a transient fault. A
rejected key or a malformed request fails identically on every attempt, and would
otherwise spend 9 requests and 75 seconds *per batch* — for 138 batches —
confirming it; a refusal is a decision about those exact images, so retrying
reproduces it twice at full price. Where a 429 or 529 carries `retry-after`, that
value is preferred over the fixed ladder.

**A failed batch still carries its cost.** An HTTP 200 is billed whether or not
anything usable came back, so `usage` is priced before any other check can throw
and the resulting cost rides out on the error for `runBatches` to add to the
total. Without that, truncation and unparseable responses spend real money the
run reports as $0.

An unparseable response retries rather than skipping, reversing an earlier draft.
Skipping treats a malformed reply as terminal when it is usually transient, and
the cost asymmetry runs the wrong way: a retry costs one invocation, while a skip
strands 30 icons until someone notices and re-runs. The three-consecutive-failure
abort still bounds the damage when the malformation is in fact systematic.

**Partial batch acceptance is required.** All-or-nothing discards 29 good
descriptions because of 1 bad one, and if a specific image reliably trips the
model, that batch fails on every run and its other 29 icons are never persisted
— a permanent hole indistinguishable from "not done yet". Responses are also
rejected for keys that name no requested icon; extra keys are ignored, missing
ones simply retried. **Missing keys are not hypothetical** — the batch-60 run
returned an object of the right size in which one key matched no requested file,
silently losing `butter-toast`.

**Abort threshold.** After 3 consecutive batch failures the run exits non-zero.
This mirrors `scripts/fetch-srd.ts:90-101`, which throws on a >10% row loss
precisely so a systemic failure cannot produce a quietly "successful" run.
Without it, an expired credential at batch 3 of 138 logs 135 failures, writes
nothing, and exits 0.

## Description style

**The prompt supplies domain context.** An earlier draft required purely literal
pixel description, on the theory that any framing was a leak. That was an
over-correction — it stripped out the vocabulary downstream search needs while
closing nothing.

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
judgment, and a per-icon boolean produced inside a 30-icon batch has no global
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
descriptions and concluded search had to wait. Name-informed generation
strengthens this further: the 60-icon run produced "fire-based weaponry",
"stoking or fanning a fire", "imbued with thunder or lightning power", "an energy
or force-field barrier". Confidence is moderate — the evidence is graded samples,
not a retrieval benchmark.

The corollary for consumers with no human in the loop still stands: **the name
is a search signal, not a semantic one.** Indexing name + description recovers
the bad-description/good-name case (`claw-hammer` findable via "hammer"), does
*nothing* for bad-description/bad-name, and a curation or rules pass matching on
names alone reproduces the `fire-flower` defect this work exists to fix.

#### Why there is no generated synonym field

A second pass expanding each description into search terms ("curved blade" →
"blade, sword, scimitar, sabre…") was considered and rejected for this artifact.

The decisive objection is that **synonym expansion amplifies confident wrong
descriptions.** The blind run described `flamethrower` as "a rifle fitted with a
bayonet"; expanded, that icon becomes strongly retrievable by *rifle, gun,
carbine, firearm, bayonet* and still unfindable by *flame*. Today a wrong
description is inert. Expanded, it is an active magnet that outranks correct
results. Expansion also collapses the distinctions a user is searching for: if
every blade expands to sword/scimitar/sabre/falchion/dagger, "scimitar" returns
hundreds of icons ordered by nothing.

Three cheaper measures come first, in order:

1. **Index the icon name alongside the description.** Free, and the highest-value
   fix, since the name survives a wrong description.
2. **Use `fuzzysort`** — already a dependency at `^3.1.0`, while
   `IconPickerDialog.tsx:123` still does a plain `.includes()` over names only.
3. **Expand the query, not the documents** — a small hand-edited synonym map
   applied to the typed term. Roughly the words people actually type, fixable one
   line at a time, no regeneration.

If a generated field is ever wanted, the defensible form is a **closed-vocabulary
category tag** (weapon / armor / creature / plant / food / tool / symbol / magic),
not open synonyms: a closed vocabulary can be validated and does not collapse
precision. That is the curation pass's business, not this one's.

**Deferring keywords/tags remains correct**, on one condition: it holds only if
the curation pass re-renders the images. If curation works from this text alone,
these descriptions become the permanent text proxy for every future semantic
pass.

## Validation

The rules live in `src/data/iconDescriptions.ts` with its test beside it, because
the app reads them too — `scripts/fetch-srd.ts:5-9` already sets the precedent of
a script importing from `src/data/`.

`vitest.config.ts` originally collected only `src/**/*.{test,spec}.{ts,tsx}`,
which silently discarded every test under `scripts/`: the suite went green having
asserted nothing about them. The `include` now covers `scripts/**/*.{test,spec}.ts`
as well. That is a repo-wide fix, not a local one — `scripts/` already held
untested code before this change.

Two tiers, because conflating them makes `--validate` fail by construction after
any partial run:

**Per-entry** (run at batch acceptance, by `--validate`, and by the test):
- Non-empty, not whitespace-only.
- Length 15–260 **characters**. The 30-word prompt instruction is guidance; the
  character bound is the hard gate. The ceiling was raised from 200: measured max
  across 299 generated descriptions is 191, and a reply honouring the word budget
  tops out near 210, but schema-constrained mode produced a legitimate 203. The
  headroom is deliberate — a rejected entry never enters the file, but it burns
  two retries and then re-fails identically, stranding that icon in a paid
  re-invocation.
- No refusal/apology boilerplate ("I can't", "I'm unable", "Sorry") — the
  signature of a silently degraded call.

**Completeness** (the vitest test only, never `--validate`):
- All 4,134 icons present; no entries for icons no longer in the collection.

So a `--limit` smoke run or an `--only` fix-up leaves a file that passes
`--validate`. The PR that adds the script also commits the complete file;
otherwise CI is red from the first commit until a full run lands.

**Name/description agreement carries no signal and is not measured.** Two
earlier drafts got this wrong in opposite directions — first failing entries that
restate their name as "the signature of name leakage", then inverting it into a
confidence metric. Both assumed the model could not see the name. It can, so
agreement is trivially expected and measures nothing.

What remains worth reporting is the opposite: **entries that add nothing beyond
their own name.** `--validate` flags descriptions whose content words are a
subset of the name's, since those are the parroting failures the authority clause
is meant to prevent, and they are worthless to search — the name is already
indexed. This is a reported warning, not a hard failure; some short names
genuinely exhaust their icon (`lungs`, `infinity`).

The test must call `vi.importActual` for the icon collection: `src/test/setup.ts`
globally mocks `@iconify-json/game-icons/icons.json` down to a **2-icon**
fixture, so completeness assertions would otherwise pass vacuously.
`src/cards/iconRules.test.ts:16` shows the pattern. A sharp rasterization test
needs `// @vitest-environment node`, since the suite is jsdom.

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

All figures are Sonnet at 256×256. The blind-versus-named result and the cost
curve are in their own sections above; this one records what the earlier 12-icon
probes established, which the 60-icon runs did not supersede.

Three prompt variants were run, all blind, all 12 icons:

1. **Literal-only** — accurate but no functional vocabulary.
2. **Domain-aware** — functional vocabulary appears; `claw-hammer` regressed from
   the hedged "a hand axe or hatchet" to the confident "A hand axe (tomahawk)".
   **Domain priming makes wrong answers more assured** — the failure mode to
   expect is confident and fluent, not hedged.
3. **Domain-aware on deliberately irrelevant icons** — no strain, no invented
   fantasy readings (table above).

`claw-hammer` is the standing example of the thin-geometry miss: the claw reads
as a second blade at 256×256. Rendering at 512 is the response; whether it
actually clears this class of miss has not been re-measured.

Incidental evidence that the model reads pixels rather than recalling assets: in
the blind runs it read rank *and* suit correctly off three different playing
cards. It cannot have inferred "Seven of Clubs" from a hash.

### What a run actually costs depends on the transport

Under `--transport cli`, `total_cost_usd` reports **API-equivalent** pricing. Run
against a Claude subscription's included usage, those invocations draw down plan
quota rather than being billed, so the binding constraints are **usage limits and
wall clock**, not money. That makes resumability load-bearing rather than a
nicety: **hitting a usage limit is the expected interruption**, not an exotic one.

Three distinct funding sources exist and they are not interchangeable:

| source | covers | billed to |
|---|---|---|
| plan usage (5-hour + weekly limits) | `cli` | included in the subscription |
| purchasable usage credits | `cli` | claude.ai payment method, at standard API rates |
| API key | `api` | Console organization, separate balance |

The middle row is the trap. Credits bill the CLI path at standard API rates while
that path spends ~91% of its tokens on agent scaffolding, so finishing the run on
credits costs **~$65** against **~$4.70** through `--transport api` — identical
output, ~14× the money. If a run is going to cost real money, it should go
through the transport that isn't mostly overhead.

### The measured cost curve

Four runs over the same 60 icons (blind, Sonnet, 256×256), varying only batch
size:

| batch | invocations | cost | per icon | wall | dropped | extrapolated to 4,134 |
|---|---|---|---|---|---|---|
| 10 | 6 | $1.435 | $0.0239 | 376s | 0 | $99, 7.2h |
| 20 | 3 | $0.867 | $0.0145 | 255s | 0 | $60, 4.9h |
| **30** | 2 | $0.625 | $0.0104 | 167s | 0 | **$43, 3.2h** |
| 60 | 1 | $0.487 | $0.0081 | 123s | **1** | $34, 2.4h |

This resolves the earlier ambiguity: **both** components are real. Fitting
`cost = fixed + marginal × n` gives roughly **$0.14–0.20 fixed per invocation and
~$0.005 per icon**. Neither pure model held.

**Batch 30 is the default.** Quality is flat from 10 to 30 and breaks three ways
at 60 — one entry silently dropped from the returned object, plus `abstract-092`
and `card-king-spades` described correctly at 10/20/30 and hallucinated at 60
("two humanoid torso silhouettes"; a heart-shaped pip). Smaller is not better
either: at batch 10 `bellows` acquired an invented association ("symbolizing
witchcraft or a witch's flight") and `butter-toast` came out garbled, both of
which batch 20 and 30 got right.

Images are a negligible share of that cost — 87 tokens each at 256×256, so ~2,600
tokens (~$0.008) against a $0.31 invocation. Under `cli`, **resolution is a
quality lever, not a cost lever**: the invocation is dominated by agent
scaffolding either way.

The curve omits retry cost, which rises with batch size.

#### The API transport inverts the shape of the curve

With the agent scaffolding gone, images become nearly the entire bill, and the
fixed per-invocation term largely disappears. At 512×512 and Sonnet 5's
introductory $2/$10 per MTok (through 2026-08-31; $3/$15 after):

| batch | input tokens/request | requests for 3,924 | total |
|---|---|---|---|
| 1 | ~1,100 | 3,924 | ~$12.87 |
| **30** | ~11,600 | 131 | **~$4.73** |
| 100 | ~37,000 | 40 | ~$4.63 |

**Batching still matters, but only up to a point.** One icon per request is 2.7×
costlier because a fixed ~740-token overhead is amortized over a single 361-token
image. Past ~30 the images already dominate and further batching buys almost
nothing — so batch 30, chosen on quality grounds under `cli`, is also near-optimal
under `api`. No reason to change it.

Rate limits are not a constraint: the whole job is ~1.5M input tokens against a
2,000,000 ITPM Start-tier limit.

## Open experiments

Anything that **changes the input to all 4,134 icons** must be settled before the
full generation: errors are deterministic, so getting one wrong means
regenerating rather than patching.

**Settled — 512×512 over 256×256.** Adopted. It was the lever most likely to fix
the `claw-hammer` class (thin geometry lost to a 2× downsample), and the cost was
acceptable in both transports. `--size` remains for re-running the comparison.

**Settled — no Batch API.** It halves token price, but turnaround is
asynchronous with a 24-hour ceiling, and the control flow inverts: submit 131
requests, poll, download JSONL, merge. That bypasses `runBatches` entirely, whose
retry / abort / merge-after-each-batch machinery is per-batch and sequential. The
saving is ~$2.30 per full regeneration, and realistic lifetime full runs number
1–3 — prompt iteration happens on 60-icon samples at ~$0.07, and an icon-set bump
only describes the new icons. ~200 lines of async machinery to save maybe $7, on
the use case it serves worst. Revisit only if a third full regeneration is queued.

**Settled — no off-the-shelf generation framework.** Curator, distilabel,
DataDreamer and similar tools were considered. The decision turns on scale, not
language or sunk cost: their value is orchestration, and at 131 requests, under
ten minutes and under $5 there is essentially nothing left to orchestrate.

**Open — Haiku versus Sonnet.** All measurements to date are Sonnet. The original
motivation was quota pressure under `cli`; with `api` costing ~$4.70 a full run,
a 3× cheaper model now saves ~$3, which does not justify the risk. This task is
fine-grained visual discrimination on small monochrome line art — where smaller
models degrade most — and Sonnet already misses 2–3%, concentrated in composite
icons and thin geometry. A model 3× cheaper and 3× wronger is a bad trade for a
permanent artifact whose errors can only be fixed by hand. If it is ever
revisited, decide it by measurement on the same 60 icons.

**Open — does thematic clustering degrade descriptions?** The seeded shuffle is
the only unmeasured element of the design and the lowest-value test, since
shuffling is free either way and a null result changes nothing. Test: the
thirteen `fire`–`fire-zone` icons described (a) inside an alphabetically
contiguous batch of 30 and (b) inside a batch of 30 whose other 17 come from
elsewhere in the collection. Compare the same thirteen across both.

## Testing

Structured so the units are testable: the transport sits behind an injectable
seam (`DescribeBatch`, passed into `runBatches`), and selection is a pure
exported function (`selectBatches({ all, existing, only, force, limit,
batchSize })`). Otherwise the tests have to mock `node:child_process` globally.
That seam is also what let the API transport be added without touching
`runBatches`, `selection`, `store`, `rasterize`, or `prompt`.

- **Rasterization:** a rendered icon is a non-empty PNG of the expected
  dimensions **and is not blank** (assert dark pixels are present via
  `sharp().stats()`) — the `currentColor` hazard makes the blank case real.
- **Shuffle:** seeded and deterministic; differs from alphabetical order.
- **Selection:** resume picks only missing icons; `--force` reselects all;
  `--only` restricts and implies force; `--limit` truncates before chunking; a
  resume packs survivors into full batches rather than preserving whole-collection
  boundaries.
- **Response parsing, `cli`:** the `--output-format json` envelope is unwrapped
  correctly; a success envelope carrying no `structured_output` is a failure.
- **Response filtering (shared):** a non-string value and a key naming no
  requested icon are each rejected, and surrounding whitespace is trimmed. Tested
  once against `pickRequested`, which both transports call.
- **Response parsing, `api`:** the JSON text block is read and `usage` is priced;
  the text blocks are joined past a leading thinking block; a `max_tokens`
  truncation, a refusal, a missing text block, a non-object body, and absent
  `usage` each throw, and each carries the batch's cost out on the error.
- **Pricing:** the alias and the concrete model id resolve to the same entry at
  the **exact** published rate, and the standard rate applies once the
  introductory period ends. Pinning the rate is what stops a zeroed price table
  from passing while the run prints $0.00 against real charges.
- **Request shape, `api`:** every image is preceded by a text block naming its
  file, the prompt closes the array, and the request carries the resolved model
  id and the response schema. Asserted through MSW rather than by mocking
  `fetch`.
- **Spend safety:** a missing key throws before any request is issued; a fatal
  status aborts the run without retrying; `--max-cost` stops the run.
- **Partial acceptance:** a batch with one bad entry writes the other 29.
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

- **Errors are deterministic, so re-running is not a repair.** Across four
  independent runs of the same 60 icons, six of the eight blind misses landed on
  the *same wrong object class every time* — `flamethrower` was "a rifle fitted
  with a bayonet" in all four, `bellows` a broom in all four — while the wording
  varied freely. Only two flipped, and both flips correlate with batch 60
  specifically rather than with resampling.

  Three consequences:
  1. **`--only <name>` at the same settings will likely reproduce the same wrong
     answer.** The spec's sanctioned repair path is weaker than it looks.
  2. **Self-consistency voting is not worth its cost.** Generating twice and
     diffing lights up on wording noise and stays silent on the stable errors —
     it is close to an inverted detector, at 2–3× the quota.
  3. **What helps is changing the input, not resampling it.** Adding the name is
     the demonstrated instance; resolution is the untested one.

  (Measured on the blind runs. The named run's remaining misses have not been
  tested for stability, though the mechanism should carry over — and
  `card-king-spades` failed identically in two of four blind runs, which is
  consistent.)
- **Manual edits do not survive `--force`, so they live in a separate file.**
  Descriptions are data and a human may correct one, but a full `--force` run
  overwrites the generated map and a flat map has nowhere to record provenance.
  `src/data/icon-descriptions-overrides.json` is merged over it at read time and
  never written by the script. This was originally deferred as YAGNI on the
  assumption that `--only` re-runs would serve as the repair path; the determinism
  finding above undermines that assumption, so the overrides file ships.
  `--validate` checks the **merged** map, since an override can be hand-written
  too long, and one supplying an icon the generated file lacks is not missing.
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
- **Expect ~2–3% of entries to be confidently wrong** — 1–2 clear misses in the
  60-icon named run, so **roughly 85–120 bad entries** across the collection.
  Domain priming makes them fluent rather than hedged, so they will not stand
  out. No mechanical check can see them; the mitigations are human.
  - The clear miss was `card-king-spades`, whose bottom pip (a spade rotated
    180°, per card convention) was called "a heart-shaped symbol". The shape was
    described accurately and identified wrongly — and note it *contradicted the
    filename* to do so, which is the anti-parroting evidence pointing the wrong
    way. Two of four blind runs made the same call.
  - The soft miss was `overdose`, "capsules of different sizes and colors" on a
    monochrome image — defensible, since each capsule is drawn two-tone.
- **The A/B sample was light on adversarial names.** Of the 60 icons, only
  `pick-of-destiny` had a name that actively misleads, and the model ignored it
  correctly. The sample contained no case where the name is *plausibly but
  wrongly* descriptive — precisely the input that would most threaten the
  name-informed decision. This is a limitation of the experiment, not of the
  pipeline, and it is the gap a follow-up should target.
- **The blind-versus-named margin was graded by a non-blind grader on 60
  icons.** Both limits cut against the measured 4× margin rather than for it, and
  the blind failures were systematic rather than marginal, but the result has not
  been independently replicated.
- **`IconDebugView` sampling has poor power for systematic faults.** If 1 batch
  in 50 goes bad, a 24-icon random sample catches it about a third of the time.
  It judges quality; it does not detect per-batch faults.
- **The 6.4MB icons chunk** is untouched here. Once curation lands, shipping only
  curated icons could cut it substantially — out of scope.
- **The picker enumerates 4,137 icons, the generator describes 4,134.**
  `IconPickerDialog` lists via `listIcons`, which includes three aliases
  (`eskimo`, `sattelite`, `star-sattelites` — two are preserved misspellings)
  that `Object.keys(collection.icons)` does not. All three are pure renames with
  no transform, so each renders pixel-identical to its parent.

  **The corpus stays at 4,134 and consumers resolve aliases at lookup.** Copying
  the parent's text into the corpus was considered and rejected: it keeps the
  pipeline strictly image → description, with one entry per thing that has
  artwork, rather than admitting derived duplicates that drift when a regenerated
  parent changes. Nothing consumes descriptions for search yet, so this is
  deferred to the fuzzy-search work, where alias handling is one case of the
  broader question of what a query matches against.
- **`--transport api` was smoke-tested but the corpus predates it.** The 210
  entries committed before it existed were generated through `cli`, where the
  agent reads PNGs off disk; `api` sends the same bytes inline with filename
  labels. Same images, same prompt, same schema, but not the same delivery path,
  and the equivalence is assumed rather than measured. Re-describing a handful of
  already-described icons with `--force --transport api` and diffing against the
  committed text would settle it for a few cents.
- Per-batch cost is logged as a running total, so a runaway run is obvious.
