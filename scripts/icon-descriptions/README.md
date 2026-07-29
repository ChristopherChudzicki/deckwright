# Icon descriptions

Generates a one-sentence description for each of the 4,134 icons in the `@iconify-json/game-icons` collection, by showing the rendered PNG to a Claude model.

Entry point: `npm run gen:icon-descriptions -- <flags>` (`scripts/gen-icon-descriptions.ts`). `--help` prints the flags; this file explains them.

The design doc — `docs/superpowers/specs/2026-07-25-icon-descriptions-design.md` — records how the decisions were reached. This file is what you need to run the thing; prefer it.

## Two corpora, and which is which

A run writes to a **workbench** corpus at `corpus/<model>.json` — gitignored, one file per model, the default `--out`. Nothing a run does touches what ships.

What ships is `src/data/iconDescriptions/corpus.json`, read through `src/data/iconDescriptions/load.ts`, which merges `overrides.json` over it. A workbench corpus becomes the shipped one only when you copy it there, deliberately, after curating.

The split exists because the shipped file is a flat name-to-description map with no per-entry provenance. That is right for the app — which never needs to know who wrote a description — and fatal for an experiment, since two models merged into one file are indistinguishable afterwards from either alone. Deriving the default path from `--model` makes that unrepresentable rather than merely refused.

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

1. **Select.** Read the corpus at `--out`, subtract it from the collection, apply `--only` / `--limit`, chunk into batches of `--batch-size` (30).
2. **Rasterize.** Render each icon to a 512px PNG under `.icon-cache/png/`, cached across runs. `.icon-cache/meta.json` records the icon-set version and render size; a change to either wipes the cache wholesale, since the cache key is the icon name and covers neither.
3. **Describe.** Send each batch to the model under a JSON schema constraining the reply to a name-to-string map. The schema is byte-identical for every request — see "Why the schema names no icons" below.
4. **Validate, then write.** Each entry is checked before it is merged. The corpus is written by rename, so a crash cannot leave it half-written.

Steps 1 and 4 are what make a run resumable: re-running after any failure picks up exactly the icons that have no entry yet. `.icon-cache/run.lock` prevents two runs from clobbering each other's merges.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--transport <cli\|api\|batch>` | `cli` | see below |
| `--model <sonnet\|opus>` | `sonnet` | also accepts the concrete id (`claude-sonnet-5`) |
| `--out <path>` | `corpus/<model>.json` | which corpus to read for selection and write into. Resolved against your shell, not the script |
| `--limit <n>` | — | describe at most n icons |
| `--only <name>` | — | describe exactly these; repeatable |
| `--force` | off | re-describe icons that already have entries |
| `--batch-size <n>` | 30 | icons per request |
| `--size <px>` | 512 | PNG render size |
| `--max-cost <usd>` | — | spend ceiling |
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

### Why the schema names no icons

`responseSchema()` takes no arguments and returns the same object every time: `{ type: "object", additionalProperties: { type: "string" } }`. That is a constraint, not an oversight.

It used to name each requested icon as a required property with `additionalProperties: false`, which made a short or renamed reply a schema violation. The cost only showed up under `batch`. Structured outputs compile **one grammar per distinct schema**, against an organisation limit of **20 compilations per minute**, and a per-request schema means 138 distinct grammars dispatched far faster than that. The first live run described **1,080 of 4,134** icons and errored the other 102 requests with `Grammar compilation rate limit exceeded`. The concurrent Opus arm got 1,770 — the limit is org-wide, so two arms in flight compete for one budget.

Three things already cover what the strict schema was guarding:

- `pickRequested` drops any key that names no requested icon, and any non-string value.
- `validateEntry` gates every entry before it is merged.
- Selection reads the corpus, so an icon a reply omitted is simply still undescribed, and the next run picks it up — paying for those icons alone.

**Do not reintroduce a schema that varies per request.** `transport.test.ts` pins the shape and `invoke-api.test.ts` pins that two different icon sets produce the same schema.

Errored requests are not billed, so the failed run cost nothing beyond what succeeded. It is still 138 requests of latency and a re-submit.

## Spend rails

A **rail** keeps a run from spending more than you meant it to. Not error handling — nothing is recovering from a failure. Four of the five act pre-flight, before anything is billed; rail 2 is the exception and aborts partway through a real spend. One asks rather than refuses.

1. **Bare `--force` on a paid transport asks for confirmation.** Re-describing every already-described icon is one keystroke from a scoped re-run, so it is worth a question — but it is a thing an operator may genuinely mean, and the answer is a number they can see on a bill afterwards. The prompt comes after the count and the floor estimate are printed and before any PNG is rendered, so the question carries the figures it is about. **With no TTY it refuses**: an unanswerable prompt fails closed, because readline resolves immediately on EOF and treating that as consent would approve a spend nobody saw.
2. **`--max-cost <usd>`** aborts a synchronous run partway once the running total reaches the ceiling.
3. **A floor estimate is printed before every paid run**, and under `batch` the run refuses to submit if the estimate already exceeds `--max-cost`. A batch is billed only when its results come back, so refusing to submit is the only guarantee available there.
4. **An uncollected batch blocks further runs against the same corpus.** Selection reads the corpus, which an in-flight batch has not written to yet, so running again re-describes and re-pays for the same icons. Scoped per corpus and checked on *every* transport, since the hazard belongs to the corpus.
5. **A corpus records the model that wrote it** (a `<corpus>.model` sidecar) and refuses a write from a different one.

Rails 1–3 guard money. Rails 4 and 5 guard something worse, and that is why they refuse instead of asking: a corpus holding two models' output is indistinguishable afterwards from one holding either, so "are you sure?" would be asking an operator to approve a result they cannot inspect later to find out whether they were right. Both are also trivially satisfiable — collect the batch, or name a different `--out`. Since `--out` now defaults to `corpus/<model>.json`, rail 5 should only ever fire on an explicit `--out` that names another model's file.

**Dry run — `--transport batch` only.** `--transport batch --max-cost 0.01` prints the selection and the estimate and exits 2 before rendering anything or calling anything, because rail 3 refuses to submit above the ceiling. **The same flags under `api` are not a dry run**: there the ceiling is a running total (rail 2), so a run whose estimate fits under it describes the icons and bills for them. Under `cli` there is no price and no ceiling at all.

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

**The name is a hint; the image is authoritative.** This rule is deliberately not loosened for the 36 place-outline icons (0.87%) where the name carries information the shape does not. Of the four described so far, `egypt` and `sri-lanka` name their country correctly and `corsica` and `colombia` do not — amending a rule governing 4,134 icons to fix roughly a dozen trades a contained problem for an uncontained one. Those go in `overrides.json`.

## Generating two models and comparing them

Two independently generated corpora, cross-checked, is how a wrong description gets caught without a human looking at 4,134 icons.

Each arm writes to its own workbench file without being told to, since `--out` defaults to `corpus/<model>.json`.

```sh
# 1. Dry run each arm. Prints selection + estimate, spends nothing, exits 2.
npm run gen:icon-descriptions -- --transport batch --model sonnet --max-cost 0.01
npm run gen:icon-descriptions -- --transport batch --model opus   --max-cost 0.01

# 2. Submit both. Different corpora, so rail 4 lets them fly at once.
npm run gen:icon-descriptions -- --transport batch --model sonnet
npm run gen:icon-descriptions -- --transport batch --model opus

# 3. Collect, hours later. --fetch takes no --out; the record carries it.
npm run gen:icon-descriptions -- --fetch <sonnet-batch-id>
npm run gen:icon-descriptions -- --fetch <opus-batch-id>

# 4. Score each arm.
npm run gen:icon-descriptions -- --validate --out corpus/claude-sonnet-5.json
npm run gen:icon-descriptions -- --validate --out corpus/claude-opus-5.json
```

Then curate: diff the two corpora, and review the disagreements against the image. Copy the winner to `src/data/iconDescriptions/corpus.json` — the promotion is a deliberate act, not something a run does — and leave its `.model` sidecar behind rather than committing it.

Where the loser won on a particular icon, that description goes in `overrides.json`, which merges over the corpus at read time. That is the curation output, and it is why the shipped corpus needs no per-entry provenance: a picked description belongs to the curator, not to the model that drafted it.

**Pilot the prompt before spending on step 2.** A revised prompt that has never been run is the single largest uncertainty in this pipeline, and a prompt change after a run costs a full regeneration:

```sh
npm run gen:icon-descriptions -- --out corpus/pilot.json --limit 60
npm run gen:icon-descriptions -- --validate --out corpus/pilot.json
```

Pilot on whichever transport produced the baseline you are scoring against, since `cli` and `api` send different image-source wording and you want the instructions to be the only thing that moved. The recorded baseline under "Validation" above is `cli`, which is the one reason to reach for `cli` over `api` here. Either way the selection is a seeded shuffle, so the same `--limit` reaches the same icons and the comparison comes out paired for free.

### What the cross-check cannot catch

Both arms share one prompt. A failure the *prompt* induces shows up as **agreement**, and agreement is the confidence signal. `colombia` — where both models describe the shape correctly and neither names the country — is a quiet failure that looks like consensus. `corsica`, where they disagree, is a loud one that the pass will surface. Curation must therefore see **image + name + both texts**, never the two texts alone.

## Comparing model outputs — read this before running any comparison

Two independent LLM audits of the **identical** text on 30 icons agreed on only **67%** of grades. Every unpaired comparison at n≈30 is noise.

Compare **paired**: same auditor, same image, both candidates unlabelled, order randomised, one pass. That is what made a measured Opus-over-Sonnet result 43–16 (p=0.0006) trustworthy.

The regex counters above are the exception — deterministic, zero grading noise.

## Cost

A full run of both arms is estimated at **$8.48** — $2.42 Sonnet + $6.06 Opus. That is a **floor**: image and text tokens only, nothing for thinking tokens.

A separate projection from measured per-icon spend gives **$9.56**. The two are different methods; do not quote them as one number. Sonnet's introductory rate lapses **2026-08-31**, after which the floor is roughly $9.69.

Prices live in `invoke-api.ts` and only models whose rates were confirmed against the pricing page belong there — a guessed rate would report a run's spend as fact while being wrong about it.

## Known gaps

- **The n=100 paired audit was measured out of band.** The claim that no icon had both models wrong (23 had at least one error; in 21 of those the other model was accurate) has no artifact in this repo and cannot be re-derived from it. Given the 67% self-agreement finding, treat it as an indication, not a result.
- **Rail 5 is inert on the shipped corpus.** `<corpus>.model` sidecars are gitignored and not carried across on promotion, so `src/data/iconDescriptions/corpus.json` carries no model stamp and the first write to it is accepted whatever the model. Exposure is one run, and now only reachable by pointing `--out` at the shipped corpus on purpose.
- **`IconDebugView` is the only review surface**, and it shows only the rule icons it happens to have descriptions for, silently, in one column. Curation needs a row per rule icon with an explicit empty state and more than one description column.
- **The rails themselves have no tests.** `cli.ts` covers parsing, coercion, and mode exclusivity, but the five rails still live in `gen-icon-descriptions.ts` top-level code that only runs as a script. Extracting an args→plan function would reach them.

## Files

| | |
|---|---|
| `../gen-icon-descriptions.ts` | entry point: rails, mode dispatch |
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
| `transport.ts` | shared types, `batchFailure`, response schema |
| `../../src/data/iconDescriptions/entries.ts` | validators + override merge — shared with the app |
