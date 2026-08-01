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

1. **Select.** Read the corpus at `--out`. `--only` wins outright: the named icons are described whether or not they already have entries, so **it implies `--force` for them and re-pays**. Otherwise subtract the corpus from the collection, then apply `--limit`.
2. **Rasterize.** Render each icon to a 512px PNG under `.icon-cache/png/`, cached across runs. `.icon-cache/meta.json` records the icon-set version and render size; a change to either clears the rendered PNGs, since the cache key is the icon name and covers neither. Corpora and batch records are untouched.
3. **Describe.** Send one request per icon, constraining the reply with a JSON schema — `--json-schema` under `cli`, `output_config` under `api` and `batch`. All three share one schema; see "Why the response is a list, not an object keyed by icon" below.
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
| `--cache-ttl <5m\|1h\|off>` | `1h` | how long the API caches the invariant instruction prefix. `api` and `batch` only — `cli` sends no prefix to cache |
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

`batch` is asynchronous: submitting writes a record to `.icon-cache/batches/` and exits. Collect it later with `--fetch <id>`. Results are retained **29 days** from submission. They come back in arbitrary order, so the tie between a result line and its icon has to be carried explicitly — `custom_id` does it; see below. Errored, canceled and expired requests are not billed.

A batch is capped at 100,000 requests **or 256 MB, whichever comes first**, and an oversized submit returns 413 `request_too_large`. A full arm is 4,134 requests carrying the whole 79 MB PNG cache — base64 inflated, plus the instruction prefix duplicated across every request — for a measured **114 MB** against a 256 MB cap. The request count is nowhere near its own limit; the bytes are the binding constraint, and raising `--size` above 512 px would eat the margin. Building that payload peaks around 650 MB of RSS, since every request holds its own base64 string until the whole array is serialized.

### One icon per request

This is not a tuning knob. There is no flag for it, and that is the point: the alternative makes a defect possible that nothing downstream can see.

Sending 30 images in one request makes name↔image correspondence the model's job. Opus got it wrong twice in 138 requests: partway through, it began labelling each description with the *following* icon's name, and continued to the end of the request. 36 icons were displaced. Every description was valid prose carrying a real icon name, so validation passed, the schema was satisfied, and the corpus absorbed it silently. Sonnet received byte-identical requests in the same order and was unaffected. A separate pair, `metal-hand`/`stone-bust`, came back holding each other's descriptions — a mutual swap, which a shift detector structurally cannot see.

At one icon per request the mapping is established by the request itself. `buildContent` pairs the image with the filename the harness asked for, and the reply's `name` field becomes a redundant channel that can be checked by string equality rather than scored — `extractMessage` fails a request whose reply names anything else. The failure stops being rare and becomes unrepresentable.

`custom_id` carries that guarantee across the batch transport's asynchrony. It must match `^[a-zA-Z0-9_-]{1,64}$`, which every icon name does — the longest is 33 characters — so the id a result line comes back under *is* the icon it belongs to, whatever order the lines arrive in. The record still lists the icons it submitted, for a different job: a short results body has no failure lines of its own to report, so `readResults` counts what came back against that manifest and names whatever never arrived.

What this costs: 4,134 requests instead of 138, and the instruction prefix sent 4,134 times instead of 138. Prompt caching is the answer to the second half — on the arm where it works.

### Prompt caching

The instruction block is invariant — 2,933 characters, **1,228 tokens**, identical on every request. At 30 icons per request the prefix was rounding error. At one it dominates, so getting that number right matters more than it looks.

**It is read off a bill, not off a tokenizer, and that took three tries.** Dividing the character count by 3.7 gave 793. The token-counting endpoint gave 948. The first live batch reported 18,420 cache-creation and 18,420 cache-read tokens over 30 requests — 15 writes and 15 reads of 1,228 each — and that is the figure the API charges for. Why `count_tokens` underreports by 280 is unexplained; the billed number governs, and a prompt change means re-deriving it the same way rather than re-measuring it.

Three runs have now confirmed it, and the arithmetic is exact rather than approximate. The full Sonnet arm billed 857,144 written and 4,219,408 read, which is **698 and 3,436 prefixes of 1,228** — summing to 4,134, the request count, with nothing left over. A two-icon `api` run wrote 1,228 and read 1,228. Any run's `written ÷ writes` re-derives the constant, which is why the cache line is worth reading even when the hit rate is fine.

So the API path leads with the instructions and marks them `cache_control`, rather than trailing them after the images as the first arms did. **Order is what makes caching possible at all**: the cache key is everything up to and including the marked block, so a single per-request byte ahead of it would change the key on every request and never hit. `ATTACHED_INSTRUCTIONS` is that prefix, and nothing about it may vary with the request.

The schema cannot join that prefix, however convenient it would be. Caching renders `tools` → `system` → `messages`, and `output_config` is in none of them.

#### Minimum cacheable length, and why the prefix size is load-bearing

A model ignores `cache_control` on a prefix shorter than its **minimum cacheable length** — silently, with no error and no warning, exactly as if the marker had never been sent. That minimum is per-model and not ordered by model size: **Opus 5 is 512 tokens, Sonnet 5 is 1024**. At 1,228 tokens this prefix clears both, with 204 tokens of headroom on the tighter one.

That headroom is the reason the prefix size is worth pinning rather than estimating. Under the discarded 948-token figure this arithmetic came out the other way, and a whole section of this file argued that the Sonnet arm could not cache and that its extra ~$3.50 was a cost to accept. **The full Sonnet run settled it: 83.1% hit rate.** The arm caches, and the conclusion drawn from the wrong measurement was wrong in both directions — it named a cost that does not exist and a limitation that does not apply.

`formatCacheUsage` exists so that outcome cannot read as silence: a run that asked for caching and cached nothing prints **`prompt cache: nothing cached — the prefix may be below this model's minimum cacheable length`**. On either arm that line is now a finding.

Shrinking the prompt is therefore not free in a way that is easy to miss. Cutting ~200 tokens of instructions would put the prefix back under Sonnet's floor and silently stop that arm caching, on top of whatever it does to the descriptions.

#### 5m versus 1h

Reads cost a tenth of an ordinary input token under either window, so the choice is only about the write: **1.25×** for the 5-minute window against **2×** for the hour.

The comparison that decides it is the two windows against *each other*, not each against no cache at all. Over R requests writing W times, 5m bills `0.1R + 1.15·W₅` and 1h bills `0.1R + 1.9·W₁`, both in units of prefix input tokens. **5m is cheaper only if it writes fewer than 1.65× as often as 1h does.** The payoff is lopsided: if both write once, `5m` saves about $0.003 on the Opus arm; if the 5-minute window lapses where the hour holds, it costs around $15. The default is `1h` for that reason, and it is what the docs recommend for batches.

**What a batch's writes are actually caused by, and how the rate scales.** Two measurements:

| run | requests | writes | hit rate |
|---|---|---|---|
| smoke, Opus | 30 | 15 | 50.0% |
| full arm, Sonnet | 4,134 | 698 | **83.1%** |

The smoke finished in nine minutes, so no window of either length was near expiring — **expiry is not what drives writes here.** How a batch is spread across cache nodes is the likeliest cause, each one needing warming before anything routed to it can hit.

That does not mean a fixed pool. A fixed pool would predict the same ~15 writes at any size and a 99.6% hit rate on a full arm; instead 138× the requests produced 47× the writes. Writes grow **sublinearly but not negligibly**, so plan a full run at 80-something percent rather than at the floor. Two points do not identify a law — re-read the line each run rather than extrapolating this one.

It also cuts against switching to `5m`: whatever warms those nodes, a node left untouched for six minutes during a multi-hour batch has to be rewritten under the short window and does not under the long one.

`off` sends no marker at all rather than a shorter one, because a marked block pays the write premium whether or not anything ever re-reads it. That premium is real: at a 50% hit rate `1h` costs slightly *more* than sending nothing, since break-even against no cache is a 52.6% hit rate. Reach for `off` deliberately, on a run short enough that the prefix will never be re-read.

**The hit rate is measured, not assumed.** Every run reports its cache line — after the run on `api`, after `--fetch` on `batch`. The docs put batch hit rates at 30–98% and call them best-effort, which is a range wide enough to be worth measuring rather than planning around. This is why `--dry-run` prints a *range* rather than a single estimate: the floor assumes every request after the first re-reads the prefix, the ceiling assumes each one writes it again at the ttl's premium. For a full Opus arm on `batch` those are **$7.33 and $31.44**, and neither is where a run lands — see "Cost". `--max-cost` refuses a `batch` submit against the ceiling, since a batch cannot be stopped once it is away.

### Why the response is a list, not an object keyed by icon

The obvious shape for a batch of descriptions is an object mapping each icon's name to its sentence. `RESPONSE_SCHEMA` instead asks for `{"descriptions": [{"name", "description"}, …]}`, and the reason is that the obvious shape cannot be constrained. Both halves of this were learned by paying for them.

Structured outputs compile **one grammar per distinct schema**, cached 24 hours and invalidated by any change to the schema's structure, against an organisation limit of **20 compilations per minute**. A schema keyed by icon name embeds the request's own data in its keys, so a 138-request arm carries 138 distinct schemas — dispatched far faster than 20 a minute. The first live batch described **1,080 of 4,134** icons and errored the other 102 requests with `Grammar compilation rate limit exceeded`. The concurrent Opus arm reached 1,770: the limit is org-wide, so two arms in flight compete for one budget.

Keeping the map shape and letting the schema name no icons is not expressible. It needs `additionalProperties` to be a type, and structured outputs reject that outright — *"For 'object' type, 'additionalProperties: object' is not supported. Please set 'additionalProperties' to false."*

Moving the names out of the keys and into values resolves both: one schema serves every request on every transport, so the grammar compiles once and the rest hit cache. Dropping the schema instead is not the cheaper option it looks like — a run with no `output_config` wrapped its reply in a markdown fence and lost **46 of 50** icons at `JSON.parse`, every one of them well formed and billed.

What the schema does **not** guarantee is contents. Nothing in it stops the model naming an icon nobody asked for, and at 30 icons per request a shortfall was a real outcome to top up on the next run. At one icon per request there is no such middle ground: `pickDescription` looks for the one name the request was about, and `extractMessage` turns a miss into a failed request rather than an empty one. The reply either answers this icon or it answers nothing. A reply carrying no `descriptions` array at all fails the same way, so it cannot be banked as a silently paid-for nothing.

That check is deliberately narrow, because it is discarding paid work when it fires. The Sonnet arm lost two of 4,134 to it — `logging` came back named `logging.png` and `bolt-drop` came back named `olt-drop`, both with accurate descriptions. A trailing `.png` is now accepted, since it is the label the request itself puts ahead of the image and names the same icon. A dropped character is not: **455 pairs of real icon names are one deletion apart**, so tolerating that could take another icon's description. `olt-drop` stays a failure, and the resume path re-requests it for a fraction of a cent.

The list shape survives that collapse even though every list now arrives holding exactly one entry, because the schema is what has to stay identical across every request — see the grammar-compilation limit above. Keying it to the icon would put the request's own data back in the schema, which is the thing that cost 102 requests, and 4,134 requests would carry 4,134 distinct schemas where 138 already exceeded the limit.

The grammar-limit failures cost only latency, because errored requests are not billed. The fenced-reply failure was billed in full — the requests succeeded and it was the parse that rejected them. That asymmetry is the argument for the schema over the prompt: a violated prompt still charges you.

## Spend rails

A **rail** keeps a run from spending more than you meant it to. Not error handling — nothing is recovering from a failure. Four of the five act pre-flight, before anything is billed; rail 2 is the exception and aborts partway through a real spend. One asks rather than refuses.

1. **Bare `--force` on a paid transport asks for confirmation.** Re-describing every already-described icon is one keystroke from a scoped re-run, so it is worth a question — but it is a thing an operator may genuinely mean, and the answer is a number they can see on a bill afterwards. The prompt comes after the count and the estimate are printed and before any PNG is rendered, so the question carries the figures it is about. **With no TTY it refuses**: an unanswerable prompt fails closed, because readline resolves immediately on EOF and treating that as consent would approve a spend nobody saw.
2. **`--max-cost <usd>`** aborts a synchronous run partway once the running total reaches the ceiling.
3. **An estimate is printed before every paid run**, and under `batch` the run refuses to submit if its **ceiling** exceeds `--max-cost`. Compared against the worst case rather than the best, because a submitted batch cannot be stopped partway and a limit only the luckiest cache outcome fits under is not a limit. A batch is billed only when its results come back, so refusing to submit is the only guarantee available there.
4. **An uncollected batch blocks further runs against the same corpus.** Selection reads the corpus, which an in-flight batch has not written to yet, so running again re-describes and re-pays for the same icons. Scoped per corpus and checked on *every* transport, since the hazard belongs to the corpus.
5. **A corpus records the model that wrote it** (a `<corpus>.model` sidecar) and refuses a write from a different one.

Rails 1–3 guard money. Rails 4 and 5 guard something worse, and that is why they refuse instead of asking: a corpus holding two models' output is indistinguishable afterwards from one holding either, so "are you sure?" would be asking an operator to approve a result they cannot inspect later to find out whether they were right. Both are also trivially satisfiable — collect the batch, or name a different `--out`. Since `--out` now defaults to `corpus/<model>.json`, rail 5 should only ever fire on an explicit `--out` that names another model's file.

**Dry run — `--dry-run`, on any transport.** Prints the selection and, on a paid transport, the estimate, then exits 0 before rendering a PNG or opening a connection. It is the only supported way to preview a run.

Do not preview a run by giving it a `--max-cost` you expect it to refuse. That was the old advice and it is a trap: the refusal is rail 3 comparing `--max-cost` against the estimate's upper end, so it only fires when the estimate is *larger*. A selection small enough to fit underneath submits instead — which is how a command meant as a preview put a live batch in flight once the corpus was nearly full. Choosing a ceiling that refuses also requires already knowing the estimate, which is the thing a preview is for.

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

Budget the calendar, not just the money. There are **up to three batch waits** below — smoke, full, residue — and each is up to 24 hours. The last one can be spent instead: a residue of a few dozen icons goes over `--transport api` in minutes for cents. Cost is under "Cost"; steps 0–2 are cents.

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

### 2. One small batch, end to end — 30 icons, 30 requests

Do not skip this because step 1 passed. `batch` fails in ways `api` does not, and the failures are only visible after you have paid for a day of latency: the first full submit on this branch errored 102 of its 138 requests against an org-wide grammar-compilation limit. Thirty requests exercise the entire path — schema compiles, `custom_id`s round-trip, PNGs inline under the 256 MB cap, record round-trips, parse accepts — and they are the only place the prefix cache can be observed before 4,134 requests are away.

**Smoke on Opus.** It is the arm that ships, and its 512-token minimum cacheable length is the one this prefix clears by the widest margin, so a cache failure there is unambiguous. Under $0.20.

```sh
npm run gen:icon-descriptions -- --transport batch --model opus --limit 30 --out corpus/tmp/smoke.json --dry-run
npm run gen:icon-descriptions -- --transport batch --model opus --limit 30 --out corpus/tmp/smoke.json
# then, once it ends:
npm run gen:icon-descriptions -- --fetch <smoke-batch-id>
```

**Pass condition: `Described 30 of 30`, with no `dropped` and no failure lines.** Anything less is a finding — read it before spending on step 4.

The `prompt cache:` line beneath it is the second thing to read, and it is close to a pass condition. A low hit rate on 30 requests does not predict one on 4,134 — see "5m versus 1h" for why the write count may barely move with scale — but `nothing cached` means the marker is not being honoured at all, and that is worth chasing before submitting 4,134 requests that would each pay the write premium.

It is also where the prefix size gets re-derived, which is the more valuable output. `written ÷ writes` is the billed token count of the prefix, and nothing else in the pipeline reports it. **2026-08-01, 30 requests on Opus at `1h`:** `Described 30 of 30`, $0.150 billed, 18,420 read and 18,420 written — 15 writes, 15 reads, **1,228 tokens per prefix**, a 50% hit rate. That is where `INSTRUCTION_TOKENS` comes from.

Into `corpus/tmp/` on purpose. A smoke test you may want to throw away does not belong in an arm, where clearing it would need `--force`, and a separate corpus keeps rail 4 from blocking the full submit. The cost is re-describing those same 30 icons in step 4, which the seeded shuffle guarantees are the first 30 either way.

### 3. Dry-run both arms — free

```sh
npm run gen:icon-descriptions -- --transport batch --model sonnet --dry-run
npm run gen:icon-descriptions -- --transport batch --model opus   --dry-run
```

Expect **4,134 requests, one icon each**, and these ranges at the default `1h`:

| arm | printed range | expect | billed |
|---|---|---|---|
| Sonnet | $2.93–$12.58 | ~$5 | **$5.046** on 2026-08-01 |
| Opus | $7.33–$31.44 | ~$12.70 | — |

Both arms run at `1h`. Read the ceiling as a bound rather than a forecast: it prices 4,134 write premiums, and the Sonnet arm wrote 698.

**`--max-cost` compares against the ceiling, so size it there and not against the expectation.** `--max-cost 20` refuses the Opus submit outright, even though that run should cost about $12.70 — which is a rail behaving correctly and an easy way to lose an afternoon. Have headroom above $31.44 available before submitting Opus, or submit without a ceiling and accept that nothing will stop it. This is the last free look.

### 4. Submit both

```sh
npm run gen:icon-descriptions -- --transport batch --model sonnet
npm run gen:icon-descriptions -- --transport batch --model opus
```

Rail 4 is scoped per corpus, so two arms writing to different files fly at once rather than being needlessly serialized. Keep `--cache-ttl` identical between step 3 and step 4 for each arm: the record freezes the ttl at submit and prices the collected results under it, so the estimate you approved and the bill you are shown measure the same request.

### 5. Collect — hours later

```sh
npm run gen:icon-descriptions -- --fetch <sonnet-batch-id>
npm run gen:icon-descriptions -- --fetch <opus-batch-id>
```

`--fetch` takes no other flags; the record carries the corpus and the model. A batch that has not ended yet prints its status and exits 0 — re-run later. Results are retained 29 days from submission.

### 6. Close the residue

**Expect one.** Under 30 icons per request a residue arrived silently, as short replies with *zero* failed requests — 4,124 and 4,123 of 4,134, 0.24%. One icon per request converts that class into visible failures: a reply that does not name this icon fails the request, so whatever is missing is missing loudly, in `--fetch`'s `Described N of M` line and its failure lines. What has *not* changed is the remedy.

Re-run the step-4 command verbatim: selection subtracts what the corpus already holds, so it picks up only the missing icons. Collect it, and repeat until step 7 reports 0 missing. A residue small enough to describe synchronously is worth `--transport api` instead — a second 24-hour wait to describe a dozen icons is the batch discount buying nothing.

**2026-08-01, Sonnet:** the residue was 2 icons, both of them the name-echo failure described under the schema above rather than anything missing from the reply. `--transport api` closed them in seconds for $0.008.

### 7. Score each arm — free

```sh
npm run gen:icon-descriptions -- --validate --out corpus/claude-sonnet-5.json
npm run gen:icon-descriptions -- --validate --out corpus/claude-opus-5.json
```

FAIL and MISSING block; WARN does not. This is regex pattern matching and says nothing about whether a description is *correct* — that is steps 8 and 9.

### 8. Audit a random sample against the artwork — free

Draw a random sample, open the PNGs, and read each description against its icon. This is the measurement that decides whether an arm is good enough to ship, and it costs nothing. See "Auditing the shipped corpus" below for how to draw the sample and what to count as an error.

Do this **before** reaching for any automated check. An earlier version of this pipeline included a cross-arm pass that asked a model to flag icons where the two arms disagreed; it was abandoned. "Two arms, and each method sees what the other cannot" below explains why, and it is the more useful half of the finding.

### 9. Curate — free, and the only step with judgement in it

Work the audit's findings against the image. **Read "Two arms, and each method sees what the other cannot" and "Comparing model outputs" below first** — agreement between the arms is not evidence about the image, and an unpaired comparison at n≈30 is noise. Each finding resolves three ways: the shipped arm is right and nothing changes; the other arm is right, which is an entry in `choices.json`; or both are wrong, which is a hand-written entry in `overrides.json`.

The output is `corpus/choices.json`, which records which model won:

```json
{ "default": "claude-opus-5", "choices": { "fireball": "claude-sonnet-5" } }
```

`default` is mandatory and `choices` lists only the icons that go the other way, so the file cannot be incomplete — an icon nobody graded still resolves to a model. Listing all 4,134 icons would say the same thing at 4,134 times the length and bury the real decisions among entries that merely restate the default.

### 10. Promote — free

```sh
npm run promote:icon-descriptions -- --reference claude-sonnet-5
```

Promotion refuses rather than drops: an icon whose winning model never described it, a choice naming an icon no arm has, and an entry failing the validators in `entries.ts` each abort the write with nothing partial left behind. A run can re-describe what it drops; here the inputs are fixed, so a drop would quietly ship fewer icons than the arms hold.

`--reference` names a second arm and is **required** — omitting it exits 2 rather than promoting unchecked. It buys the alignment gate: scored against an arm that described the same icons in the same order, a description sitting on the wrong icon resembles the reference text of the icon before it more than its own, and a contiguous run of those aborts the write and names every icon in it. Nothing about a single arm reveals that, because the names are all present and the prose is all valid. The thresholds are constants at the top of `alignment.ts`.

The gate was built for a failure one icon per request has retired — a model losing track, mid-request, of which of 30 images it was on. It is kept for two reasons that outlive it. The corpora on disk today were generated at 30 icons per request and are still what promotion reads, so it remains the only check standing between that data and the shipped file. And the correspondence it audits did not go away, it changed owner: the harness now asserts it, through `custom_id` and the echoed filename, and the gate is the one check that would notice the harness getting it wrong. A collection path that shifted descriptions by one icon would look exactly like the model doing it.

The reference must describe at least 90% of what is being promoted. A missing file reads as an empty corpus, so without that floor a mistyped `--reference` would skip every icon and report a clean corpus — the check would pass by having nothing to say.

`--skip-alignment-check` promotes without a reference and says so in the log. It exists for a genuinely single-arm situation, which is now a thing to avoid rather than a supported mode.

`promote.test.ts` asserts the committed corpus is exactly what the committed arms and choices produce. That is what makes it a derived artifact rather than a file that happens to be checked in — an edit made straight to `corpus.json` fails the suite.

`overrides.json` is a different thing: a description **neither** model produced, written by hand. It merges over the corpus at read time in `load.ts` and is never baked in. `choices.json` picks between the models; `overrides.json` overrules both.

### 11. Gate, then commit

```sh
npm run gen:icon-descriptions -- --validate   # no --out: scores what ships. Exit 0 is the gate
npm test
```

Commit both arms **and their `.model` sidecars**, `choices.json`, and `corpus.json`. The sidecars are what rail 5 reads, so an arm without one is a corpus any model may later be merged into. `.icon-cache/` and `corpus/tmp/` are gitignored and stay that way.

### Two arms, and each method sees what the other cannot

**Run at least two models.** The alignment gate in step 10 is a cross-arm check and cannot run without a second arm.

That gate is no longer the load-bearing thing it was. It exists because a model could lose track of which image it was describing partway through a 30-image request; at one icon per request the harness owns that mapping and the model cannot make that mistake. What the gate still audits is the harness itself — see step 10 — which is a cheap check to keep and not a thing to organise the pipeline around. **The reason to run two arms is now quality, not correctness**: cross-arm disagreement is how `computer-fan`'s "round frame with a screw hole at each corner" was caught against Sonnet's "square housing".

Neither available method is sufficient alone, and their blind spots are complements.

**A random audit against the artwork** is unconditioned on the arms agreeing, so it is the only method that catches **both models wrong the same way** — the failure a shared prompt makes likeliest, since a prompt-induced error shows up as agreement and agreement is the confidence signal. It costs nothing but reading time. Its weakness is statistical power: a 20-icon sample expects 0.18 errors against a 0.9% defect rate, so it can miss a real defect entirely and did.

**A cross-arm check** is blind to correlated error by construction, but it is the only thing that catches **one arm diverging mechanically** — and that is not hypothetical. It is what found the displacement described in the known gaps below, 36 icons a random audit of 29 had already passed over.

So: run the random audit for judgement about the artwork, and the alignment gate for mechanical divergence. Curation still needs **image + name + both texts**, never the two texts alone.

A separate cross-arm *flag* pass — an LLM judging whether the arms disagree — was built and removed. It worked as specified: a seeded 50-icon sample flagged 13 icons at ~$0.054, extrapolating to ~1,000 icons and ~$4.50, corroborating the out-of-band n=100 audit's 23% error rate by a different method. It went because it cost $4.45 to answer a question a deterministic lexical comparison answers for free and more precisely — the gate in `alignment.ts` found both displaced runs exactly, with no model call and no false positives. Its verdict files were never committed, so the 13-of-50 figure is an out-of-band measurement like the n=100 audit: an indication, not something this repo can re-derive.

## Comparing model outputs — read this before running any comparison

Two independent LLM audits of the **identical** text on 30 icons agreed on only **67%** of grades. Every unpaired comparison at n≈30 is noise.

Compare **paired**: same auditor, same image, both candidates unlabelled, order randomised, one pass. That is what made a measured Opus-over-Sonnet result 43–16 (p=0.0006) trustworthy.

The regex counters above are the exception — deterministic, zero grading noise.

## Auditing the shipped corpus

The cheapest useful measurement in this pipeline: draw a random sample of icons, open the PNGs under `.icon-cache/png/`, and read each description against its artwork. It costs no tokens. Unlike any cross-arm check it is unconditioned on the two arms disagreeing, so it is the only method here that can catch both models being wrong the same way.

It is not, however, without a blind spot — it has a *statistical* one. Read the power calculation below before quoting a clean sample as evidence of a clean corpus.

Grade against what the corpus is *for*. It backs fuzzy search in the icon picker, so the failure that matters is **naming the wrong object** — that is what makes an icon unfindable or surfaces the wrong one. A miscount or a wrong orientation on a correctly identified subject costs nothing on either axis, and should be recorded as a detail error rather than inflating the headline rate.

**2026-07-29, n=20, seeded random draw over the shipped corpus.** 20 of 20 substantively correct; **zero wrong-object errors**; one cosmetic blemish (`medal-skull` reads "a horned-less skull"). With no errors observed the true rate is under roughly 15% at 95% confidence — this rules out a bad corpus, not a flawless one. A second, deliberately adversarial sample of 9 icons drawn from the cross-arm pass's *conflicts* found exactly one shipped error, `kitchen-knives` ("two broad chef's knives and two slender blades … all pointing to the upper right" — there are three knives, and one points down-left). Both samples were graded by a single reader, which the 67% finding above says to discount accordingly.

**Those 29 icons contained no wrong-object error, and the corpus contained at least 36.** The alignment gate later found two runs of displaced descriptions the sampling had simply missed. This is the lesson worth keeping from the whole exercise: at a 0.9% defect rate a 20-icon sample expects 0.18 errors, so observing zero was never evidence of a clean corpus — it was the expected result either way. "Rules out a bad corpus, not a flawless one" was the right caveat and still understated how little the sample could see.

A random audit measures whether the *model* understands the artwork. It is close to useless for finding a *mechanical* defect that touches under 1% of entries. Use the alignment gate for that, and do not let a clean sample stand in for a check that would actually have found the problem.

## Cost

A full run of both arms on `batch` at the default `1h`, before Sonnet's introductory rate lapses:

| arm | `--dry-run` prints | at the measured 83.1% | with `--cache-ttl off` |
|---|---|---|---|
| Sonnet | $2.93–$12.58 | $4.56 | $7.50 |
| Opus | $7.33–$31.44 | $11.40 | $18.75 |
| both | $10.26–$44.02 | $15.96 | $26.25 |

Every figure counts image and text tokens only, and nothing for thinking tokens, so even the ceiling is not a hard ceiling. Budget about **25 output tokens per request** for thinking on top — measured at 23.6 on the Sonnet arm and 24.8 on the Opus smoke. All the token figures come from `estimateCost`, so `--dry-run` is the authority and this table is a copy; if the two disagree, the code is right.

**The Sonnet arm billed $5.046 against a $4.56 model** — the gap is the thinking. Take that as the calibration: the middle column plus thinking is the number to plan against, and it is nowhere near either end of the printed range.

The width of that range is entirely the prefix cache: the low end assumes every request after the first re-reads the instructions, the high end assumes each one writes them again at 2×. Neither happens. What makes the middle column worth computing rather than splitting the difference is that **the cache only pays above a 52.6% hit rate** — below that, `1h` costs more than sending no marker at all. The 30-request smoke came in at 50.0% and was on the wrong side of it. A full arm is not, but that is a fact about full arms and not about the flag.

Sonnet's introductory rate lapses **2026-08-31**, after which that arm goes to $4.40–$18.86, or about $6.84 at the measured rate. `resolveModel` switches on the date on its own; nothing needs updating on the day.

For scale, the same corpus at 30 icons per request and no caching would be about **$9.07** today — Sonnet $2.59, Opus $6.48. One icon per request is not free, and the cache is what decides how unfree: a well-cached pair of arms lands slightly above that, a never-cached pair at roughly triple. What the money buys is a defect class becoming unrepresentable.

Prices live in `invoke-api.ts` and only models whose rates were confirmed against the pricing page belong there — a guessed rate would report a run's spend as fact while being wrong about it.

## Known gaps

- **Opus displaced 36 descriptions by one, in two of its 138 requests.** Partway through a request it stopped tracking which image went with which name and labelled every remaining description with the *following* icon's name — `xylophone` got the necktie, `yin-yang` got the xylophone, `amphora` got the yin-yang. Both runs began mid-request and continued to its end: 26 icons from index 3304 and 10 from 3950. Sonnet received byte-identical requests in the same order and was unaffected, and `invoke-api.ts` pairs each image with its own filename from one array, so this is the model losing the thread rather than a pipeline defect. Nothing in the pipeline could see it — the names were all present and the prose was all valid — which is why the alignment gate in step 10 exists. Re-describing the affected icons with `--only` was the fix; `choices.json` was not, because it would pin good-but-displaced Opus text to Sonnet permanently. **One icon per request is what closes this for good**; the gate found it, the transport now prevents it. It is a gap rather than history because both corpus arms on disk were generated under the old grouping and have not been regenerated.
- **`metal-hand` and `stone-bust` came back holding each other's descriptions**, at adjacent request indices in the same Opus request. A mutual swap is invisible to the shift detector by construction: it asks whether description *k* resembles reference *k−1*, and a swap presents as a run of length 1, below the run-length floor. A detector for it was designed and measured — 1 hit across 4,134 at margin 0.05, zero false positives — and deliberately not built, because one icon per request retires the whole class. The two icons are pinned in `choices.json` instead. Anyone reintroducing grouping needs that detector as well as the gate.
- **The n=100 paired audit was measured out of band.** The claim that no icon had both models wrong (23 had at least one error; in 21 of those the other model was accurate) has no artifact in this repo and cannot be re-derived from it. Given the 67% self-agreement finding, treat it as an indication, not a result. It is no longer the only evidence for the Opus pick — see "Auditing the shipped corpus".
- **`choices.json` ships the Opus arm wholesale, and that is a decision rather than a placeholder.** It says `default: claude-opus-5` with no exceptions. The grounds: 9 adjudicated cross-arm conflicts going 7–1 to Opus with one wash, and Opus naming the place in all four place-outline icons where Sonnet manages one. The 20-icon random audit is weaker evidence than it looked — see "Auditing the shipped corpus" — and the displacement above is a point against Opus that Sonnet does not share, though it is a mechanical failure rather than a comprehension one. What has *not* been done is a systematic pass over all 4,134; `choices` stays empty until some icon earns an exception.
- **The cross-arm flag pass was removed, not kept as dead code.** It ran only at 50-icon scale, its verdict files were gitignored, and it had unfixed defects — `--max-cost` skipped on a failed chunk, no consecutive-failure brake, and a verdict parser that type-checked only `name`, so a reply with non-boolean fields banked every icon as clean permanently. None of that is why it went: conditioning on disagreement cannot see correlated error, which is the failure a shared prompt makes likeliest. Anyone rebuilding it should make `runRequests` generic and reuse it rather than copying it, and should read "Two arms, and each method sees what the other cannot" first.
- **`count_tokens` underreported the prefix by 280 tokens and nobody knows why.** It said 948; the batch billed 1,228. The gap is not a rounding artifact — it is 23% of the number, it flipped the Sonnet caching conclusion, and it means the token-counting endpoint is not a substitute for a billed measurement when the answer has to be right. Anything here that turns on prefix size should be re-derived from a real run's `written ÷ writes`, not re-measured.
- **Why writes scale the way they do is unexplained.** 15 writes at 30 requests, 698 at 4,134 — sublinear, but far from the fixed count a simple pool of cache nodes would give. Both numbers are single observations on single batches, and nothing here predicts the Opus arm's rate. Plan against ~83%, read the cache line, and update the table rather than the model.
- **The reply's `name` field is a vestige carrying a smaller job than it was built for.** At 30 icons per request it was the key. Now `custom_id` is, and the echo only audits *that* — it cannot catch a wrong image, since the PNG and its label come from one variable. Designed fresh, the schema would probably carry no name at all: one less thing to get wrong, and a shorter prefix. Removing it means editing the prompt, which means regenerating both arms, so it stays.
- **Rail 5 does not apply to the shipped corpus, by design.** It refuses a run that would mix two models in one file — which is exactly what promotion does on purpose. The shipped corpus carries no `.model` sidecar and should not: it is not a run target, and a run that wrote to it would be overwritten wholesale by the next `promote` anyway.
- **`IconDebugView` is the only review surface**, and it shows only the rule icons it happens to have descriptions for, silently, in one column. Curation needs a row per rule icon with an explicit empty state and more than one description column.
- **The rails' wiring has no tests.** Their mechanisms do: rail 1's fail-closed in `confirm.test.ts`, rail 2's ceiling in `run.test.ts`, rail 4's outstanding-batch check in `batch.test.ts`, rail 5's model guard in `store.test.ts`. What is untested is the top-level code in `gen-icon-descriptions.ts` that decides when each fires, because it only runs as a script. Extracting an args→plan function would reach it.

## Files

| | |
|---|---|
| `../gen-icon-descriptions.ts` | entry point: rails, mode dispatch |
| `../promote-icon-descriptions.ts` | entry point: arms + choices → the shipped corpus |
| `cli.ts` | flag definitions, coercion, mode exclusivity, corpus path defaults |
| `confirm.ts` | y/N prompt; false when there is no TTY |
| `prompt.ts` | the prompt. See above before editing |
| `selection.ts` | corpus → which icons to describe |
| `rasterize.ts` | icon → cached PNG |
| `invoke.ts` | `cli` transport |
| `invoke-api.ts` | `api` transport, model pricing, cost estimates |
| `batch.ts` | `batch` transport: submit, record, collect |
| `run.ts` | per-icon request loop, retries, running cost, cache totals, `--max-cost` abort |
| `store.ts` | corpus read/merge/write, model sidecar |
| `promote.ts` | `choices.json` → which model's description each icon ships |
| `alignment.ts` | cross-arm displacement gate: is a description on the right icon at all |
| `transport.ts` | shared types, `requestFailure`, response schema, cache-usage reporting |
| `../../src/data/iconDescriptions/entries.ts` | validators + override merge — shared with the app |
