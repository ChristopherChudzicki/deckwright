# Handoff: spell card import

**Status:** spec only, no code yet.
**As of:** 2026-05-04
**Audience:** the next agent (or fresh-context me) picking this up.
**Predecessor:** PR #33 (`swap-to-open5e`) lands the bundled-JSON pipeline for magic items. Spell import reuses that pipeline.

---

## TL;DR

The site only imports magic items today. Add spell import:

1. Pull SRD spells from Open5e v2 `/v2/spells/?document__key=srd-{2014|2024}`.
2. Bundle them in the repo via the existing `npm run fetch:srd` pipeline (raw + slim + zod schema).
3. Map spells → `SpellCard` with header/footer tags following a canonical order.
4. Update `BrowseApiModal` so users pick **items vs spells** before searching.
5. Use the curated icon `magic-swirl` for every spell (real per-spell icon resolution is a separate follow-up).

The card schema is **already unified enough** — see "Schema notes" below — but `SpellCard` needs `headerTags` and `footerTags` added to its definition (currently item-only).

---

## State of the codebase post-PR #33

- Magic-item import works end-to-end via bundled JSON. `src/api/endpoints/magicItems.ts` dynamic-imports `src/data/srd-{2014,2024}-magicitems.json`. `src/api/mappers/magicItems.ts` produces `ItemCard` with header/footer tags + `iconKey` (auto-resolved).
- `scripts/fetch-srd.ts` is the freshness pipeline. Currently hardcoded to magic items — see "Suggested implementation" for the generalization.
- `src/data/srd-schema.ts` exports the magic-item zod schema. Spells will need a sibling schema there.
- `BrowseApiModal` is single-step (per item). Already exposes a 2014/2024 ToggleButtonGroup. The new ask is a **kind** picker (items / spells).
- The print-card separator is already a vertical bar (`|`) — committed in `d14acd0` on the same branch. **You don't need to change this.** The user's feature description mentions ` · ` only because they were quoting the original behavior.

---

## Open5e spell data: shape + critical quirks

Sample call:

```
curl 'https://api.open5e.com/v2/spells/?document__key=srd-2024&limit=2000'
```

Counts: **319 spells** in `srd-2014`, **339 spells** in `srd-2024`. Both fit the existing 2000-row limit guard in fetch-srd.

### Quirk 1: filter param differs from magic items

Magic items: `?document=srd-2024`.
Spells: `?document__key=srd-2024` (Django ORM-style lookup with the double-underscore).

Using `?document=srd-2024` against `/v2/spells/` does **not** filter — it returns spells from every document including third-party 5e content (a5e-ag, kobold-press, etc.). This trap will silently inflate your bundled JSON if you copy the magic-items URL pattern verbatim.

### Quirk 2: `casting_time` is a unit, not a quantity

Each spell has `casting_time` ∈ `{"action", "bonus-action", "reaction", "minute", "hour"}`. There's **no quantity field anywhere on the v2 record** (verified — no companion field, nothing useful in `casting_options`, nothing in `reaction_condition`). Open5e v2 effectively normalizes "1 X" away. Spells the official rules describe as multi-unit (Identify cast as ritual, etc.) come back as just `"minute"`.

For tag rendering, format as:

| `casting_time` | tag |
|---|---|
| `"action"` | `"1 action"` |
| `"bonus-action"` | `"1 bonus action"` |
| `"reaction"` | `"1 reaction"` |
| `"minute"` | `"1 minute"` |
| `"hour"` | `"1 hour"` |

If `ritual: true`, append ` (ritual)` → e.g. `"1 minute (ritual)"`. Accept the data limitation; don't try to recover the lost multiplier from `desc` text.

**Considered and rejected — Open5e v1 enrichment.** v1's spell records DO carry `casting_time` as a fully-formatted string (`"1 action"`, `"1 minute"`, etc.), so a v1 enrichment pass could in principle restore the quantities. But v1 only covers the 2014 SRD (`document_slug=wotc-srd`); there's no 2024 SRD content in v1. So v1 can't drive both rulesets, and a v1-for-2014-only fallback path would mean two divergent ingest flows. The user explicitly accepted the v2 limitation. Don't go down this road; if a small number of spells render badly enough to matter, an override map keyed by spell key is the cheaper escape hatch (no second API to integrate).

### Quirk 3: duration uses singular units

`duration` values: `"instantaneous"`, `"1 minute"`, `"10 minute"`, `"8 hour"`, `"24 hour"`, `"until dispelled"`, `""` (empty), `"special"`. Mapper should:
- Capitalize: `"instantaneous"` → `"Instantaneous"`.
- Pluralize quantified units: `"10 minute"` → `"10 minutes"`, `"8 hour"` → `"8 hours"`.
- Concentration: if `concentration: true`, prefix with `"Concentration, up to "`. So `duration="1 minute" + concentration=true` → `"Concentration, up to 1 minute"`. **Never split concentration into a separate tag.**

### Quirk 4: components are split into booleans

The spell object exposes `verbal`, `somatic`, `material` (booleans) plus `material_specified` (string). Build the tag from these:

- Pieces: `["V"?, "S"?, "M (...)"?]` joined with `", "`.
- If `material: true` and `material_specified` is non-empty: `"M (a tiny ball of bat guano and sulfur)"`. If `material_specified` is empty (ambiguous in the data): just `"M"`.

### Other relevant fields

- `level` (number, 0 = cantrip)
- `school.name` (string, capitalized) — combine with level: `"3rd-level evocation"` or `"Divination cantrip"` (note: school is **lowercase** for leveled spells, **capitalized** before "cantrip" because it leads the tag).
- `range_text` (string, e.g. `"60 feet"`, `"Self"`, `"Touch"`) — use verbatim.
- `classes` (array of `{name, key}`) — extract names, sort alphabetically (or preserve API order?), join with `", "` → `"Sorcerer, Wizard"`.
- `desc` (string) — main description.
- `higher_level` (string) — "At Higher Levels" text. May be empty.

---

## Schema notes

The user asked: **do we need any schema variation between item and spell besides `kind`?** Short answer: no, but a small change is needed.

Today (`src/decks/schema.ts`):
- `itemCardSchema` extends `baseCardSchema` with `kind: "item"`, `headerTags`, `footerTags`.
- `spellCardSchema` extends `baseCardSchema` with `kind: "spell"` only — **no `headerTags`/`footerTags`**.
- `abilityCardSchema` same shape as spell.

Action: hoist `headerTags` and `footerTags` into `baseCardSchema` (or into spell + ability explicitly). Users can already type tags via the editor — the spell/ability discriminants don't expose those fields, so this is a strict expansion. Run `npm run gen:schema` and write a new migration that drops + re-adds the `cards_payload_valid` CHECK with the regenerated schema. Pattern: see `supabase/migrations/20260504113000_swap_apiref_system_to_open5e.sql` for the exact drop → re-add structure.

Existing rows are unaffected — they won't have `headerTags`/`footerTags` and the schema makes those default to `[]`. No backfill needed.

---

## Mapper output (canonical tag order)

**Header (in order):**

1. **Level + school**: `"3rd-level evocation"` (level ≥ 1) or `"Divination cantrip"` (level 0). Lowercase the school for leveled spells; capitalize the school for cantrips since it starts the tag.
2. **Casting time**: per the table above. Append `" (ritual)"` if `ritual: true`.
3. **Range**: `range_text` verbatim.
4. **Duration**: per Quirk 3, with concentration prefix bundled in.

**Footer (in order):**

1. **Components**: `"V, S, M (...)"`. Empty entries dropped.
2. **Classes**: `"Sorcerer, Wizard"` (comma-separated names).

### Body

`desc` verbatim, plus a trailing block for `higher_level` when non-empty:

```
${desc}

***At Higher Levels.*** ${higher_level}
```

(Match whatever inline-emphasis convention `desc` itself uses — it's plain text in Open5e, so the `***...***` markers are a deliberate visual cue. If the body renderer doesn't support them, just use `"At Higher Levels. "` plain.)

### Examples (lifted from the user's spec — use as fixtures)

**Fireball**
- Header: `["3rd-level evocation", "1 action", "150 feet", "Instantaneous"]`
- Footer: `["V, S, M (a tiny ball of bat guano and sulfur)", "Sorcerer, Wizard"]`

**Guidance** (concentration cantrip)
- Header: `["Divination cantrip", "1 action", "Touch", "Concentration, up to 1 minute"]`
- Footer: `["V, S", "Cleric, Druid"]`

---

## UI changes

### `BrowseApiModal` — kind picker

Add a `ToggleButtonGroup` (above or beside the existing 2014/2024 group) that switches between **Items** and **Spells**. Selection drives:
- Which hook runs (`useMagicItemIndex` vs new `useSpellIndex`).
- Which mapper runs on pick (`magicItemDetailToCard` vs new `spellDetailToCard`).

Keep the search field, ruleset toggle, and row layout common to both kinds.

The `EditorView.tsx` import-hint button currently says **"Browse Items"**. Change it to **"Browse Catalog"** (or similar) since the modal now covers both.

### SRD-only notice in the modal

Add a notice somewhere prominent in `BrowseApiModal` (under the ToggleButtonGroups, before the search field) saying we only have SRD content. Use the same text/link style as the existing import-hint in `EditorView.tsx:124-138` — that's an inline message linking to the Wikipedia SRD article. Reuse those wording cues.

Suggested copy: "Only SRD spells and items are available here. See the [SRD](https://en.wikipedia.org/wiki/System_Reference_Document) for what's covered."

### Icon

For now, every imported spell gets `iconKey: "magic-swirl"` (already in `src/cards/curatedIcons.ts`). Don't try to write `pickIconKey` rules for spells — that's a separate effort tracked under issue #32.

---

## Already in place — don't redo

- **Separator change** (`·` → `|`) — committed in `d14acd0` on this branch. Both `Card.module.css` `.headerTag::before` and `.footerTag::before` use `" | "`.
- **Bundled-data pipeline** — `scripts/fetch-srd.ts`, `src/data/srd-schema.ts`, dynamic-import endpoints, `setQueryData`-driven tests.
- **Per-ruleset chunk splitting** — Vite already does this; spells will get the same treatment automatically.

---

## Out of scope

- Per-spell icon resolution (issue #32). Use `magic-swirl` for all spells.
- Differentiating spell vs item in the deck view (mixed list is fine for now).
- Brief preview info in the browse modal (title-only is fine).
- Migrating any existing spell rows in prod — there are none yet.
- LLM-generated spell summaries — same future-work as items.

---

## Suggested implementation order

The pipeline is the same shape as items, so keep that scaffolding parallel. Steps:

1. **Add `headerTags` + `footerTags` to `spellCardSchema`** in `src/decks/schema.ts`. Update `SpellCard` in `src/cards/types.ts`. Run `npm run gen:schema`. Write a new migration in `supabase/migrations/` that drops + re-adds `cards_payload_valid` with the regenerated schema. Apply locally.
2. **Add the spell zod schema** to `src/data/srd-schema.ts`. Export `SpellItem` type via `z.infer`.
3. **Generalize `scripts/fetch-srd.ts`** to handle two resource types, OR keep it focused and add a sibling `scripts/fetch-srd-spells.ts` — author's call. The user has been fine with both styles. If keeping a single script, factor the per-resource logic into a small config map.
4. **Run `npm run fetch:srd`** to populate `data/srd-{2014,2024}-spells.raw.json` and `src/data/srd-{2014,2024}-spells.json`.
5. **Add endpoint + hook + mapper** in `src/api/endpoints/spells.ts`, `src/api/hooks.ts` (extend with `useSpellIndex`), `src/api/mappers/spells.ts`.
6. **Refactor `BrowseApiModal`** to add a kind picker, route to the right hook/mapper, and surface the SRD notice.
7. **Tests**: spell mapper unit tests covering each tag-order edge case (cantrip vs leveled, ritual, concentration, every casting_time unit, missing material_specified, missing higher_level). Endpoint shape tests against the bundled JSON. Browse modal tests using `setQueryData` (one fixture per kind).
8. **Update `EditorView.tsx`** import-hint copy ("Browse Items" → "Browse Catalog" or similar).

Don't add spell-specific tests to magic-item files — keep the boundary clean.

---

## Pointers

- This handoff: `docs/superpowers/handoff/2026-05-04-spell-import.md`
- Predecessor handoff (item bundling): `docs/superpowers/handoff/2026-05-04-swap-to-open5e-bundled-srd.md`
- Prior spec (item migration): `docs/superpowers/specs/2026-05-03-swap-to-open5e-design.md`
- Recently merged: PR #33 (the bundled-data work). Commit history of interest:
  - `d9dacfa` — main bundle swap
  - `97f19b3` — apiref-system migration (the pattern your CHECK migration should mirror)
  - `d5f2f58` — armor AC tag with dex-mod info (mapper pattern reference)
- Open5e API: https://api.open5e.com/v2/spells/
- Curated icon list: `src/cards/curatedIcons.ts`. `magic-swirl` is already there.
- iconRules issue (deferred): https://github.com/ChristopherChudzicki/dnd-cards/issues/32

## Project conventions reminder

From `CLAUDE.md`:

- `npm test`, `npm run dev`, `npm run build` are pre-approved. Ask before `npm install`. `npm run fetch:srd` is a network call — fine to run, but be aware it overwrites bundled JSON.
- Don't push or create PRs without explicit instruction.
- No comments unless WHY is non-obvious.
- Tests: `getByRole(...)`. Factories pass no values they don't assert on.
- Biome authoritative — accept its reformatting.
- DB changes go through `supabase/migrations`; never edit live tables.
- Address review nits inline in the same task — don't accumulate cleanup.

## How to pick up

```bash
cd /Users/cchudzicki/dev/dnd-cards
git checkout main && git pull        # PR #33 should be merged by the time you read this
git checkout -b spell-import
npm install
npx vitest run --dir src             # green baseline
```

Then read this doc, the user's feature description (above), and the predecessor handoff for the bundled-JSON pipeline. Dispatch an implementer subagent with the spec or write directly per your judgment.
