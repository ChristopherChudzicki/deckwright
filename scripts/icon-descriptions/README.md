# Icon descriptions

Generates a one-sentence description for each of the 4,134 icons in the `@iconify-json/game-icons` collection, by showing the rendered PNG to a Claude model.

Entry point: `npm run gen:icon-descriptions -- <flags>` (`scripts/gen-icon-descriptions.ts`). `--help` prints the flags; this file explains them.

The design doc — `docs/superpowers/specs/2026-07-25-icon-descriptions-design.md` — records how the decisions were reached. This file is what you need to run the thing; prefer it.

## Two corpora, and which is which

A run writes to a **workbench** corpus at `corpus/<model>.json` — one file per model, the default `--out`. Nothing a run does touches what ships. Those files are committed: they are paid output, and the audit that compares two models is only re-derivable if the arms it graded are in the history. Scratch belongs in `corpus/tmp/`, which is gitignored — probes, superseded runs, anything you would not mind losing.

What ships is `src/data/iconDescriptions/corpus.json`, read through `src/data/iconDescriptions/load.ts`, which merges `overrides.json` over it. It is a derived file: `npm run promote:icon-descriptions` assembles it from the workbench corpora and `corpus/choices.json`. No run writes it, and nothing is hand-edited into it.

The split exists because the shipped file is a flat name-to-description map: the app never needs to know who wrote a description. That is fatal for an experiment, since two models merged into one file are indistinguishable afterwards from either alone. Deriving the default path from `--model` makes that unrepresentable rather than merely refused. Provenance for what ships lives beside it in `choices.json` instead of inside it.

## Quick start

```sh
# Describe 10 undescribed icons on the subscription CLI. Costs no money.
# Lands in corpus/claude-sonnet-5.json, not in the shipped corpus.
npm run gen:icon-descriptions -- --limit 10

# Score the shipped corpus — regex heuristics for style words, associations
# that restate the subject, and entries echoing the icon name. Calls no model.
npm run gen:icon-descriptions -- --validate

# Fix a bad one by hand — never edit corpus.json.
$EDITOR src/data/iconDescriptions/overrides.json
```

Nothing needs a flag to be safe: the default transport spends subscription quota rather than money, the default selection skips every icon already described, and the default destination is a workbench file.

## How a run works

1. **Select.** Read the corpus at `--out`. `--only` wins outright: the named icons are described whether or not they already have entries, so **it implies `--force` for them and re-pays**. Otherwise subtract the corpus from the collection, then apply `--limit`. Either way, chunk into batches of `--batch-size` (30).
2. **Rasterize.** Render each icon to a 512px PNG under `.icon-cache/png/`, cached across runs. `.icon-cache/meta.json` records the icon-set version and render size; a change to either clears the rendered PNGs, since the cache key is the icon name and covers neither. Corpora and batch records are untouched.
3. **Describe.** Send each batch to the model, constraining the reply with a JSON schema — `--json-schema` under `cli`, `output_config` under `api` and `batch`. All three share one schema; see "Why the response is a list, not an object keyed by icon" below.
4. **Validate, then write.** Each entry is checked before it is merged. The corpus is written by rename, so a crash cannot leave it half-written.

Steps 1 and 4 are what make a run resumable: re-running after any failure picks up exactly the icons that have no entry yet. `.icon-cache/run.lock` prevents two runs from clobbering each other's merges.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--transport <cli\|api\|batch>` | `cli` | see below |
| `--model <name>` | `sonnet` | `sonnet` or `opus`, or the concrete id (`claude-sonnet-5`). Under `cli` any string is accepted and names its own corpus |
| `--out <path>` | `corpus/<model>.json` | which corpus to read for selection and write into. Resolved against your shell, not the script |
| `--limit <n>` | — | describe at most n icons |
| `--only <name>` | — | describe exactly these; repeatable. Implies `--force` for them, so a name that already has an entry is described again and billed again |
| `--force` | off | re-describe icons that already have entries |
| `--batch-size <n>` | 30 | icons per request |
| `--size <px>` | 512 | PNG render size |
| `--max-cost <usd>` | — | spend ceiling: aborts a running `cli`/`api` total, refuses a `batch` submit pre-flight. Caps nothing once a batch is away |
| `--dry-run` | — | print the selection and the estimate, then exit without sending |
| `--validate` | — | score a corpus; writes nothing. Defaults `--out` to the shipped corpus |
| `--fetch <batch-id>` | — | collect a submitted batch. Takes no other flags |
| `-h`, `--help` | — | print the flags |

`--out` is the one flag whose default depends on the mode: a run writes to the workbench, and `--validate` reads what ships. The model in `corpus/<model>.json` is the canonical id, so `--model opus` and `--model claude-opus-5` name the same file.

`--validate` and `--fetch` are exclusive modes and refuse conflicting flags rather than ignoring them. A flag left at its default is not a conflict — only one you actually passed.

Parsing, coercion, and `--help` come from `commander` (`cli.ts`). The exclusivity check is hand-written rather than commander's `.conflicts()`, which reports one offending pair at a time; here one message names them all.

## Transports

| | spends | latency | image delivery |
|---|---|---|---|
| `cli` | subscription quota | seconds | model reads PNGs off disk with the `Read` tool |
| `api` | tokens, full rate | seconds | PNG bytes inline in the request |
| `batch` | tokens, **50% off** | up to 24h | PNG bytes inline in the request |

**Iterate on `api`; run on `batch`.** `cli` bills no money, which makes it look like the obvious iteration transport, and it is not: a 60-icon run draws enough subscription quota to be felt, and prompt work means running that repeatedly. The same 60 icons over `api` cost cents. `cli` is worth keeping for a handful of icons, or when you have no key to hand, but it is not where prompt iteration belongs. `batch` halves the token price and is what a full run should use.

`batch` is asynchronous: submitting writes a record to `.icon-cache/batches/` and exits. Collect it later with `--fetch <id>`. Results are retained **29 days** from submission. Results come back in arbitrary order, which is why the record file — not the response — is the authority on which icon a description belongs to. Errored, canceled and expired requests are not billed.

A batch is capped at 100,000 requests **or 256 MB, whichever comes first**, and an oversized submit returns 413 `request_too_large`. A full arm is 138 requests carrying the whole 79 MB PNG cache, which base64 inflates to roughly 105 MB — comfortably inside the cap, but the margin is a factor of two, not a factor of ten. Raising `--size` above 512 px would eat it.

### Why the response is a list, not an object keyed by icon

The obvious shape for 30 descriptions is an object mapping each icon's name to its sentence. `RESPONSE_SCHEMA` instead asks for `{"descriptions": [{"name", "description"}, …]}`, and the reason is that the obvious shape cannot be constrained. Both halves of this were learned by paying for them.

Structured outputs compile **one grammar per distinct schema**, cached 24 hours and invalidated by any change to the schema's structure, against an organisation limit of **20 compilations per minute**. A schema keyed by icon name embeds the request's own data in its keys, so a 138-request arm carries 138 distinct schemas — dispatched far faster than 20 a minute. The first live batch described **1,080 of 4,134** icons and errored the other 102 requests with `Grammar compilation rate limit exceeded`. The concurrent Opus arm reached 1,770: the limit is org-wide, so two arms in flight compete for one budget.

Keeping the map shape and letting the schema name no icons is not expressible. It needs `additionalProperties` to be a type, and structured outputs reject that outright — *"For 'object' type, 'additionalProperties: object' is not supported. Please set 'additionalProperties' to false."*

Moving the names out of the keys and into values resolves both: one schema serves every request on every transport, so the grammar compiles once and the rest hit cache. Dropping the schema instead is not the cheaper option it looks like — a run with no `output_config` wrapped its reply in a markdown fence and lost **46 of 50** icons at `JSON.parse`, every one of them well formed and billed.

What the schema does **not** guarantee is completeness. `minItems` accepts only 0 and 1, so it cannot require one entry per requested icon, and a request may return fewer than it was asked for. `pickRequested` drops entries naming an unrequested icon and keeps the first of any duplicate. A shortfall is reported per batch as `+29, 1 missing` under `cli` and `api`, and by the `Described N of M` line under `--fetch`; either way the next run re-selects whatever the corpus still lacks. A reply carrying no `descriptions` array at all is a failure rather than an empty batch, so it cannot be banked as a silently paid-for nothing.

The grammar-limit failures cost only latency, because errored requests are not billed. The fenced-reply failure was billed in full — the requests succeeded and it was the parse that rejected them. That asymmetry is the argument for the schema over the prompt: a violated prompt still charges you.

## Spend rails

A **rail** keeps a run from spending more than you meant it to. Not error handling — nothing is recovering from a failure. Four of the five act pre-flight, before anything is billed; rail 2 is the exception and aborts partway through a real spend. One asks rather than refuses.

1. **Bare `--force` on a paid transport asks for confirmation.** Re-describing every already-described icon is one keystroke from a scoped re-run, so it is worth a question — but it is a thing an operator may genuinely mean, and the answer is a number they can see on a bill afterwards. The prompt comes after the count and the floor estimate are printed and before any PNG is rendered, so the question carries the figures it is about. **With no TTY it refuses**: an unanswerable prompt fails closed, because readline resolves immediately on EOF and treating that as consent would approve a spend nobody saw.
2. **`--max-cost <usd>`** aborts a synchronous run partway once the running total reaches the ceiling.
3. **A floor estimate is printed before every paid run**, and under `batch` the run refuses to submit if the estimate already exceeds `--max-cost`. A batch is billed only when its results come back, so refusing to submit is the only guarantee available there.
4. **An uncollected batch blocks further runs against the same corpus.** Selection reads the corpus, which an in-flight batch has not written to yet, so running again re-describes and re-pays for the same icons. Scoped per corpus and checked on *every* transport, since the hazard belongs to the corpus.
5. **A corpus records the model that wrote it** (a `<corpus>.model` sidecar) and refuses a write from a different one.

Rails 1–3 guard money. Rails 4 and 5 guard something worse, and that is why they refuse instead of asking: a corpus holding two models' output is indistinguishable afterwards from one holding either, so "are you sure?" would be asking an operator to approve a result they cannot inspect later to find out whether they were right. Both are also trivially satisfiable — collect the batch, or name a different `--out`. Since `--out` now defaults to `corpus/<model>.json`, rail 5 should only ever fire on an explicit `--out` that names another model's file.

**Dry run — `--dry-run`, on any transport.** Prints the selection and, on a paid transport, the floor estimate, then exits 0 before rendering a PNG or opening a connection. It is the only supported way to preview a run.

Do not preview a run by giving it a `--max-cost` you expect it to refuse. That was the old advice and it is a trap: the refusal is rail 3 comparing the ceiling against the estimate, so it only fires when the estimate is *larger*. A selection small enough to fit under the ceiling submits instead — which is how a command meant as a preview put a live batch in flight once the corpus was nearly full. Choosing a ceiling that refuses also requires already knowing the estimate, which is the thing a preview is for.

## Validation

`--validate` is pattern matching, not judgement. It calls no model and knows nothing about whether a description is *correct* — only whether it trips one of a handful of regexes. Checking a description against its icon is a separate job with no tooling in this repo; see "Comparing model outputs" below.

It merges overrides over the corpus and reports three tiers:

- **FAIL** — `validateEntry` rejected the entry (length, shape, refusal text). These can never be in the corpus; the run drops them before writing.
- **MISSING** — icons with no entry, plus the `--only` line that would close them.
- **WARN** — prose-quality residues. These do **not** block anything.

The warning tier is a **prompt-iteration metric first**, a triage list second. Three checks:

| check | what it catches |
|---|---|
| name echo | the description adds nothing beyond the icon's own name |
| style word | describes the drawing, not the subject (`stylized`, `silhouette`, `pictogram`…) |
| tautological association | closes on "…, symbolizing <the thing it just described>" |

Read the **rate** across prompt revisions, not the count as a defect list. The tautology check deliberately over-flags icons where naming the referent *is* the description (`sri-lanka`).

### Baseline

Measured over the 418 entries in `corpus/pilot-2026-07-26.json`, generated before 2026-07-27 under the previous prompt:

| check | hits | rate |
|---|---|---|
| style word | 38 | 9.1% |
| tautological association | 47 | 11.2% |
| name echo | 0 | 0% |

Composition, which is what the current prompt is aimed at: `stylized` 25 / `silhouette*` 13; `symbolizing*` 26 / `representing` 11 / `evoking` 9 / `symbol of` 1.

These are regexes, so comparing a revision against them carries **zero grading noise**. Scoring a new prompt still requires generating under it — cheap, not free.

### 2026-07-27 pilot

`corpus/pilot.json` — 60 icons under the prompt as of `d8d7aec`. Every one of those 60 is also in the baseline corpus, so this is a **paired** comparison: same icons, same transport, only the instructions differ.

**These numbers are one commit behind the committed prompt.** `0a03644` landed afterwards and changed four words — "Omit it when it only restates the subject" became "Omit the association when…", because the pronoun's antecedent sat four lines away. It was judged not worth a re-measurement, and that judgement is the only thing standing between this table and the prompt actually in `prompt.ts`. A prompt edit with any semantic content is a different matter: re-pilot it.

| check | old prompt | current prompt | fixed | introduced |
|---|---|---|---|---|
| style word | 9/60 | **3/60** | 7 | 1 |
| tautological association | 7/60 | **0/60** | 7 | 0 |
| name echo | 0/60 | 0/60 | 0 | 0 |

McNemar exact, two-sided: tautology **p = 0.016**, style **p = 0.07**. The tautology result is solid; the style result is suggestive at this n.

`stylized` — 66% of the baseline style residue — went from 6.0% of entries to **0 of 60**, which is what the "how abstract or simplified it is" clause was added to do. The three surviving hits are largely detector false positives: `aries` reads *"the zodiac glyph for the sign Aries"*, where `glyph` is the correct technical noun, and the other two describe featureless human figures as `person silhouettes`. Tightening the prompt further would be arguing with the regex rather than with the descriptions.

## The prompt

`prompt.ts`. It is the highest-stakes file here: the corpus carries no marker separating entries written under one wording from another, so **changing it means regenerating everything**. `invoke.test.ts` pins the full text in both transport wordings, and the `attached` variant is pinned as a diff against `on-disk` so an attached-only clause cannot drift in unnoticed. Edit the prompt and the pin together.

**The one finding that governs how to edit it:** the model reproduces an example's wording when it meets that example's icon. Every counter-example used to name a real icon, and all five came back carrying the exact clause the list forbade, with only "conventionally" spliced in — five for five. So:

- **Counter-examples name no subject.** They are patterns with the subject blanked (`"A <tool>, symbolizing <the activity that tool performs>."`). Their verbs vary too, because once the subject is blank the verb is the only concrete thing left to read as the rule's scope.
- **The style rule is described, never demonstrated.** Its forbidden vocabulary is generic rather than icon-bound, so a pattern cannot hide it. The old wording illustrated the rule *with* "depicted in bold silhouette", and `silhouette` then appeared in 8 entries.

The positive exemplars still name real icons, and they echo by the same mechanism. Mostly this is fine — `bat-wing` and `sparkles` came back as faithful echoes. But it is not uniformly benign: `berry-bush` came back *worse* than its own exemplar, having gained a style word. Their icons are not excluded from the residue counts above.

**The name is a hint; the image is authoritative.** This rule is deliberately not loosened for the 36 place-outline icons (0.87%) where the name carries information the shape does not — amending a rule governing 4,134 icons to fix roughly a dozen trades a contained problem for an uncontained one, and `overrides.json` exists for the residue.

In the event the rule cost nothing on the arm that ships. Opus names the place in all four of the icons this section was written about — `colombia`, `corsica`, `egypt`, `sri-lanka` — reading the outline and supplying the name the shape alone does not carry. Sonnet manages only `sri-lanka`, calling `corsica` "a jagged, layered cloak or cape shape". It is the sharpest single illustration of why the Opus arm ships.

## Runbook: empty corpus to shipped corpus

Two independently generated corpora, cross-checked, is how a wrong description gets caught without a human looking at 4,134 icons. This is the whole pipeline on `batch`, which is what a full run should use.

Budget the calendar, not just the money. There are **three batch waits** below — smoke, full, shortfall — and each is up to 24 hours. Cost is under "Cost"; steps 0–2 are cents.

Each arm writes to its own workbench file without being told to, since `--out` defaults to `corpus/<model>.json`.

### 0. Preflight — free

```sh
ls .icon-cache/batches/       # a record with no collectedAt is a batch you still owe a --fetch
```

`ANTHROPIC_API_KEY` must be exported; the run refuses before rendering if it is not. **Freeze the prompt here.** The corpus carries no marker separating entries written under one wording from another, so editing `prompt.ts` after step 4 costs a full regeneration.

### 1. Pilot the prompt — 60 icons

A revised prompt that has never been run is the single largest uncertainty in this pipeline.

```sh
npm run gen:icon-descriptions -- --out corpus/tmp/pilot.json --limit 60
npm run gen:icon-descriptions -- --validate --out corpus/tmp/pilot.json
```

Pilot on whichever transport produced the baseline you are scoring against, since `cli` and `api` send different image-source wording and you want the instructions to be the only thing that moved. The recorded baseline under "Validation" above is `cli` — hence the default transport here, and the one place `cli` beats `api`. Scoring against anything else, add `--transport api`. Either way the selection is a seeded shuffle, so the same `--limit` reaches the same icons and the comparison comes out paired for free. If you record the numbers, move the file to `corpus/pilot-<date>.json` and commit it — a measurement is only re-derivable if the text it graded is in the history.

### 2. One small batch, end to end — 30 icons, one request

Do not skip this because step 1 passed. `batch` fails in ways `api` does not, and the failures are only visible after you have paid for a day of latency: the first full submit on this branch errored 102 of its 138 requests against an org-wide grammar-compilation limit. One request exercises the entire path — schema compiles, PNGs inline under the 256 MB cap, record round-trips, parse accepts.

```sh
npm run gen:icon-descriptions -- --transport batch --model sonnet --limit 30 --out corpus/tmp/smoke.json --dry-run
npm run gen:icon-descriptions -- --transport batch --model sonnet --limit 30 --out corpus/tmp/smoke.json
# then, once it ends:
npm run gen:icon-descriptions -- --fetch <smoke-batch-id>
```

**Pass condition: `Described 30 of 30`, with no `dropped` and no failure lines.** Anything less is a finding — read it before spending on step 4.

Into `corpus/tmp/` on purpose. A smoke test you may want to throw away does not belong in an arm, where clearing it would need `--force`, and a separate corpus keeps rail 4 from blocking the full submit. The cost is re-describing those same 30 icons in step 4, which the seeded shuffle guarantees are the first 30 either way.

### 3. Dry-run both arms — free

```sh
npm run gen:icon-descriptions -- --transport batch --model sonnet --dry-run
npm run gen:icon-descriptions -- --transport batch --model opus   --dry-run
```

Check the count and the floor estimate against what you expect. This is the last free look.

### 4. Submit both

```sh
npm run gen:icon-descriptions -- --transport batch --model sonnet
npm run gen:icon-descriptions -- --transport batch --model opus
```

Rail 4 is scoped per corpus, so two arms writing to different files fly at once rather than being needlessly serialized.

### 5. Collect — hours later

```sh
npm run gen:icon-descriptions -- --fetch <sonnet-batch-id>
npm run gen:icon-descriptions -- --fetch <opus-batch-id>
```

`--fetch` takes no other flags; the record carries the corpus and the model. A batch that has not ended yet prints its status and exits 0 — re-run later. Results are retained 29 days from submission.

### 6. Close the shortfall

**Expect one.** The schema cannot require completeness, so a request may return fewer icons than it was asked for and both arms came back short with *zero* failed requests — 4,124 and 4,123 of 4,134, a 0.24% residue. Re-run the step-4 command verbatim: selection subtracts what the corpus already holds, so it picks up only the missing icons in one small request. Collect it, and repeat until step 7 reports 0 missing.

### 7. Score each arm — free

```sh
npm run gen:icon-descriptions -- --validate --out corpus/claude-sonnet-5.json
npm run gen:icon-descriptions -- --validate --out corpus/claude-opus-5.json
```

FAIL and MISSING block; WARN does not. This is regex pattern matching and says nothing about whether a description is *correct* — that is steps 8 and 9.

### 8. Flag the disagreements — ~$4.50

**Read the known gaps before running this — it has unfixed defects, and the audit below is the cheaper measurement.**

```sh
npm run flag:icon-descriptions -- --dry-run    # selection + estimate, sends nothing
npm run flag:icon-descriptions -- --limit 50   # one chunk first, about $0.05
npm run flag:icon-descriptions -- --max-cost 5 # the rest, under a ceiling
```

| Flag | Default | Meaning |
|---|---|---|
| `--model <name>` | `sonnet` | which model judges |
| `--effort <low\|medium\|high\|xhigh\|max>` | `medium` | how hard the judge thinks; see below |
| `--chunk <n>` | 50 | icons per request |
| `--limit <n>` | — | judge at most n unjudged icons |
| `--out <path>` | `corpus/flags.json` | where the verdicts land, and what a re-run reads to skip |
| `--max-cost <usd>` | — | stop once the running total reaches this. Not honoured on a failed chunk — see known gaps |
| `--force` | off | re-judge icons that already have a verdict |
| `--dry-run` | — | print the selection and the estimate, then exit without sending |

Asks a model, per icon, whether the two arms disagree about what the artwork depicts (`conflict`) and whether the shipped description contradicts the icon's name (`nameConflict`). It sends **no images** — it is a text pass over descriptions already paid for, which is why it costs a fraction of a generation arm. The judge is not told which arm is which, and is not asked which is better.

It flags; it does not resolve. Neither text is authoritative and the judge cannot see the artwork, so its output is a queue for step 9, never an input to promotion. `corpus/flags.json` holds one entry per judged icon, written per chunk so an abort keeps what it paid for and a re-run skips it; a clean icon stores as `{}`, so everything with content in it wants a human.

Expect to flag around a quarter of the collection. Measured over a seeded 50-icon sample: 13 flagged at `--effort medium`, ~$0.054, which extrapolates to **~1,000 icons and ~$4.50** for the full run. That independently corroborates the out-of-band n=100 audit's 23% error rate by a different method — and it means step 9 is a long queue, not a short one.

`--effort` trades cost against recall, but less than it looks: `high` and `medium` flagged 13 each and agreed on only **10** of them, each catching three the other missed. That is the same ~70% agreement as the two-auditor finding below, so treat the marginal flags as noise and the overlap as the real signal. `low` costs a third less and missed two substantive conflicts. `medium` is the default for that reason, not because it dominates.

### 9. Curate — free, and the only step with judgement in it

Work `corpus/flags.json` against the image. **Read "What the cross-check cannot catch" and "Comparing model outputs" below first** — agreement between the arms is not evidence about the image, and an unpaired comparison at n≈30 is noise. Each flag resolves three ways: the shipped arm is right and nothing changes; the other arm is right, which is an entry in `choices.json`; or both are wrong, which is a hand-written entry in `overrides.json`.

The output is `corpus/choices.json`, which records which model won:

```json
{ "default": "claude-opus-5", "choices": { "fireball": "claude-sonnet-5" } }
```

`default` is mandatory and `choices` lists only the icons that go the other way, so the file cannot be incomplete — an icon nobody graded still resolves to a model. Listing all 4,134 icons would say the same thing at 4,134 times the length and bury the real decisions among entries that merely restate the default.

### 10. Promote — free

```sh
npm run promote:icon-descriptions
```

Promotion refuses rather than drops: an icon whose winning model never described it, a choice naming an icon no arm has, and an entry failing the validators in `entries.ts` each abort the write with nothing partial left behind. A run can re-describe what it drops; here the inputs are fixed, so a drop would quietly ship fewer icons than the arms hold.

`promote.test.ts` asserts the committed corpus is exactly what the committed arms and choices produce. That is what makes it a derived artifact rather than a file that happens to be checked in — an edit made straight to `corpus.json` fails the suite.

`overrides.json` is a different thing: a description **neither** model produced, written by hand. It merges over the corpus at read time in `load.ts` and is never baked in. `choices.json` picks between the models; `overrides.json` overrules both.

### 11. Gate, then commit

```sh
npm run gen:icon-descriptions -- --validate   # no --out: scores what ships. Exit 0 is the gate
npm test
```

Commit both arms **and their `.model` sidecars**, `choices.json`, `flags.json`, and `corpus.json`. The sidecars are what rail 5 reads, so an arm without one is a corpus any model may later be merged into. `flags.json` is committed because curation is incremental and the queue is worth resuming across sessions. `.icon-cache/` and `corpus/tmp/` are gitignored and stay that way.

### What the cross-check cannot catch

Both arms share one prompt, so a failure the *prompt* induces shows up as **agreement** — and agreement is the confidence signal. Any cross-arm method is structurally blind to the case where both models are wrong the same way, which is the case a shared prompt makes likeliest. Curation must therefore see **image + name + both texts**, never the two texts alone.

The fix is not a better cross-check. It is to audit a **random** sample against the artwork, which is unconditioned on agreement and so has no blind spot — see "Auditing the shipped corpus" below. That pass is free and catches the class the flag pass cannot; run it first.

## Comparing model outputs — read this before running any comparison

Two independent LLM audits of the **identical** text on 30 icons agreed on only **67%** of grades. Every unpaired comparison at n≈30 is noise.

Compare **paired**: same auditor, same image, both candidates unlabelled, order randomised, one pass. That is what made a measured Opus-over-Sonnet result 43–16 (p=0.0006) trustworthy.

The regex counters above are the exception — deterministic, zero grading noise.

## Auditing the shipped corpus

The cheapest useful measurement in this pipeline, and the only one with no blind spot: draw a random sample of icons, open the PNGs under `.icon-cache/png/`, and read each description against its artwork. It costs no tokens. Unlike the flag pass it is unconditioned on the two arms disagreeing, so it is the only method here that can catch both models being wrong the same way.

Grade against what the corpus is *for*. It backs fuzzy search in the icon picker, so the failure that matters is **naming the wrong object** — that is what makes an icon unfindable or surfaces the wrong one. A miscount or a wrong orientation on a correctly identified subject costs nothing on either axis, and should be recorded as a detail error rather than inflating the headline rate.

**2026-07-29, n=20, seeded random draw over the shipped corpus.** 20 of 20 substantively correct; **zero wrong-object errors**; one cosmetic blemish (`medal-skull` reads "a horned-less skull"). With no errors observed the true rate is under roughly 15% at 95% confidence — this rules out a bad corpus, not a flawless one. A second, deliberately adversarial sample of 9 icons drawn from the flag pass's *conflicts* found exactly one shipped error, `kitchen-knives` ("two broad chef's knives and two slender blades … all pointing to the upper right" — there are three knives, and one points down-left). Both samples were graded by a single reader, which the 67% finding above says to discount accordingly.

Across all 29 icons checked there was no wrong-object error. That, not the cross-arm pass, is the evidence the Opus arm ships on.

## Cost

A full run of both arms is estimated at **$8.48** — $2.42 Sonnet + $6.06 Opus. That is a **floor**: image and text tokens only, nothing for thinking tokens.

A separate projection from measured per-icon spend gives **$9.56**. The two are different methods; do not quote them as one number. Sonnet's introductory rate lapses **2026-08-31**, after which the floor is roughly $9.69.

The cross-arm flag pass (step 8) would add **~$4.45** on top, from a measured chunk rather than a projection, rising to roughly **$6.67** once Sonnet's introductory rate lapses on 2026-08-31. It reads text the arms already produced and sends no images, so its cost is dominated by the judge's thinking tokens, not by the corpus. It has not been run at full scale, and the random audit below is the cheaper way to reach the same question.

Prices live in `invoke-api.ts` and only models whose rates were confirmed against the pricing page belong there — a guessed rate would report a run's spend as fact while being wrong about it.

## Known gaps

- **The n=100 paired audit was measured out of band.** The claim that no icon had both models wrong (23 had at least one error; in 21 of those the other model was accurate) has no artifact in this repo and cannot be re-derived from it. Given the 67% self-agreement finding, treat it as an indication, not a result. It is no longer the only evidence for the Opus pick — see "Auditing the shipped corpus".
- **`choices.json` ships the Opus arm wholesale, and that is a decision rather than a placeholder.** It says `default: claude-opus-5` with no exceptions. The grounds are in-repo now: a 20-icon random audit with no wrong-object errors, 9 adjudicated cross-arm conflicts going 7–1 to Opus with one wash, and Opus naming the place in all four place-outline icons where Sonnet manages one. What has *not* been done is a systematic pass over all 4,134; `choices` stays empty until some icon earns an exception.
- **The cross-arm flag pass has known defects and was never run at full scale.** `--max-cost` is skipped for a failed chunk (`flag-icon-descriptions.ts` continues past the ceiling check), there is no consecutive-failure brake like `run.ts`'s, and `pickVerdicts` type-checks only `name` — so a reply whose verdict fields are not booleans banks every icon as clean, permanently, since resumption keys on presence. Reuse `runBatches` rather than patching the copy. Nothing in the shipping path calls this code; it survives as the instrument that measured the disagreement rate.
- **Rail 5 does not apply to the shipped corpus, by design.** It refuses a run that would mix two models in one file — which is exactly what promotion does on purpose. The shipped corpus carries no `.model` sidecar and should not: it is not a run target, and a run that wrote to it would be overwritten wholesale by the next `promote` anyway.
- **`IconDebugView` is the only review surface**, and it shows only the rule icons it happens to have descriptions for, silently, in one column. Curation needs a row per rule icon with an explicit empty state and more than one description column.
- **The rails' wiring has no tests.** Their mechanisms do: rail 1's fail-closed in `confirm.test.ts`, rail 2's ceiling in `run.test.ts`, rail 4's outstanding-batch check in `batch.test.ts`, rail 5's model guard in `store.test.ts`. What is untested is the top-level code in `gen-icon-descriptions.ts` that decides when each fires, because it only runs as a script. Extracting an args→plan function would reach it.

## Files

| | |
|---|---|
| `../gen-icon-descriptions.ts` | entry point: rails, mode dispatch |
| `../promote-icon-descriptions.ts` | entry point: arms + choices → the shipped corpus |
| `../flag-icon-descriptions.ts` | entry point: both arms → a queue of suspect icons |
| `cli.ts` | flag definitions, coercion, mode exclusivity, corpus path defaults |
| `confirm.ts` | y/N prompt; false when there is no TTY |
| `prompt.ts` | the prompt. See above before editing |
| `selection.ts` | corpus → what to describe, batched |
| `rasterize.ts` | icon → cached PNG |
| `invoke.ts` | `cli` transport |
| `invoke-api.ts` | `api` transport, model pricing, cost estimates |
| `batch.ts` | `batch` transport: submit, record, collect |
| `run.ts` | batch loop, retries, running cost, `--max-cost` abort |
| `store.ts` | corpus read/merge/write, model sidecar |
| `promote.ts` | `choices.json` → which model's description each icon ships |
| `flag.ts` | cross-arm conflict pass: prompt, schema, verdict parsing |
| `transport.ts` | shared types, `batchFailure`, response schema |
| `../../src/data/iconDescriptions/entries.ts` | validators + override merge — shared with the app |
