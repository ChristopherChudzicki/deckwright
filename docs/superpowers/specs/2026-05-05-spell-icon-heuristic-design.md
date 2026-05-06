# Spell-icon heuristic + curated set expansion

## Problem

Both the curated icon set and the auto-pick heuristic predate spell support. As a
result:

1. Every imported spell renders with the same `magic-swirl` icon — the spell
   mapper hardcodes `iconKey: "magic-swirl"`, so `pickIconKey()` never runs on
   imported spells.
2. The curated set is item-flavored (weapons, armor, consumables). The "magical
   effects" section is sparse, so even when a user wants to override, the picker
   offers little for spell cards.
3. `pickIconKey`'s rules only know item terms. A custom spell card named
   "Mage Sword" would resolve to the broadsword icon; a spell named "Shield"
   would resolve to the shield item icon. Neither is right for spells.

## Goals

- Imported spells get a meaningful, school-aware icon by default — not the
  static magic-swirl placeholder.
- Custom (homebrew) spells get the same heuristic, working off whatever name +
  headerTags the user provides.
- The picker surfaces a respectable set of spell-flavored icons, comparable in
  depth to the existing item coverage.
- No behavior change for items.

## Non-goals

- Hand-curating per-SRD-spell icon mappings (e.g. "Fireball → fire-flower"
  keyed by slug). The user may layer this on later; this design's heuristic
  produces good-enough defaults for SRD and homebrew alike.
- Reorganizing the picker UI itself. Curated set grows; layout stays.

## Approach

**Two separate rule tables, dispatched on `card.kind`.** Spell rules and item
rules live next to each other in `iconRules.ts` but never mix. Spell rules are
applied as: name keywords first, school fallback second, dice fallback last.

The hardcoded `iconKey: "magic-swirl"` in the spell mapper is removed; imported
spells leave `iconKey` undefined and fall through to the heuristic via
`Card.tsx`'s existing `card.iconKey ?? pickIconKey(card)` line.

## Architecture

`src/cards/iconRules.ts` is restructured:

```ts
export const ITEM_RULES: readonly IconRule[] = [/* existing list, renamed */];
export const SPELL_NAME_RULES: readonly IconRule[] = [/* new */];
export const SCHOOL_ICONS: Record<SchoolName, string> = {/* 8 entries */};
export const FALLBACK_ICON_KEY = "perspective-dice-six-faces-random";

export function pickIconKey(card: RenderableCard): string {
  if (card.kind === "spell") return pickSpellIconKey(card);
  return pickItemIconKey(card);
}
```

`pickSpellIconKey(card)`:
1. Build `haystack = card.name + " " + card.headerTags.join(" ")`.
2. For each rule in `SPELL_NAME_RULES` (in order), test the pattern; return on
   first match.
3. Otherwise scan `card.headerTags`, lowercased, for a whole-word match against
   any of the 8 school names; return the matching `SCHOOL_ICONS[school]`.
4. Otherwise return `FALLBACK_ICON_KEY`.

`pickItemIconKey(card)` is the existing `pickIconKey` logic, unchanged.

The spell mapper at `src/api/mappers/spells.ts` no longer sets `iconKey`. The
existing test in `spells.test.ts` is updated: instead of asserting
`iconKey === "magic-swirl"`, it asserts `iconKey === undefined` (i.e. the
heuristic owns it).

`src/views/IconDebugView.tsx` gets a kind toggle so contributors can simulate
both rule paths. School matches and the dice fallback render in the same table
as existing item rules.

## Spell name keyword rules

Order is significant — first match wins. Patterns use case-insensitive `\b`
boundaries, same as item rules.

| #  | Pattern                                                                                | Icon          | Notes                                 |
|----|----------------------------------------------------------------------------------------|---------------|---------------------------------------|
| 1  | `fire`, `flame`, `flaming`, `burning`, `incendiary`, `fireball`, `combust`, `scorching`| `fire-flower` | curated                               |
| 2  | `lightning`, `thunder`, `thunderwave`, `shock(ing)?`, `call lightning`                 | `lightning-arc`| curated                              |
| 3  | `ice`, `cold`, `frost`, `freezing`, `cone of cold`, `snow`                             | `ice-cube`    | curated                               |
| 4  | `poison`, `venom`, `cloudkill`, `stinking cloud`, `acid`                               | `poison-cloud`| add to curated                        |
| 5  | `cure`, `heal`, `healing`, `mass healing`, `mending`, `spare the dying`, `revivify`, `regenerate`, `raise dead`, `resurrection` | `caduceus` | add to curated |
| 6  | `bless`, `prayer`, `sacred`, `divine`, `guidance`, `sanctuary`                         | `holy-symbol` | curated                               |
| 7  | `shield`, `ward`, `mage armor`, `protection from`, `aid`                               | `magic-shield`| curated                               |
| 8  | `fly`, `feather fall`, `levitate`, `jump`, `expeditious retreat`                       | `feathered-wing`| add to curated                      |
| 9  | `sleep`, `dream`                                                                       | `night-sleep` | add to curated                        |
| 10 | `charm`, `friends`, `suggestion`, `command`, `compulsion`, `dominate`, `hold person`, `hold monster` | `charm` | add to curated |
| 11 | `fear`, `frighten`, `cause fear`, `phantasmal terror`                                  | `evil-eyes`   | curated                               |
| 12 | `curse`, `bane`, `hex`, `bestow curse`, `crown of madness`                             | `cursed-star` | add to curated                        |
| 13 | `summon`, `conjure`, `find familiar`, `find steed`, `unseen servant`, `gate`, `planar` | `magic-portal`| curated; also Conjuration default     |
| 14 | `teleport`, `dimension door`, `misty step`, `word of recall`                           | `magic-portal`| reuses #13's icon                     |
| 15 | `light` (whole word), `daylight`, `sunbeam`, `sunburst`                                | `sun`         | curated; rule order ensures lightning matches first |
| 16 | `moon`, `moonbeam`                                                                     | `moon`        | curated                               |
| 17 | `detect`, `scrying`, `clairvoyance`, `true seeing`, `see invisibility`, `arcane eye`   | `evil-eyes`   | curated; reuses #11's icon            |

The exact regex source for each rule will be authored to be `\b`-bounded and
case-insensitive. Implementation may collapse adjacent alternations into one
rule per icon; the table is conceptual.

### Disambiguation note

Rule #15 (`light`) must not match `lightning`. Rule #2 fires first, so any
spell with "lightning" in its name resolves before rule #15 has a chance. This
is enforced by rule ordering, not by exclusion patterns.

## School fallback

When no name rule matches, scan `card.headerTags` lowercased for whole-word
matches against the 8 D&D schools. The spell mapper always emits the school in
a headerTag like `"3rd-level evocation"` or `"Evocation cantrip"`, so this is
reliable for imported spells. Custom spells without a school in headerTags
fall through to the dice fallback.

| School        | Icon                  | Status        |
|---------------|-----------------------|---------------|
| Abjuration    | `magic-shield`        | curated       |
| Conjuration   | `magic-portal`        | curated       |
| Divination    | `crystal-ball`        | curated       |
| Enchantment   | `charm`               | add to curated|
| Evocation     | `magic-swirl`         | curated       |
| Illusion      | `drama-masks`         | add to curated|
| Necromancy    | `skull-crossed-bones` | curated       |
| Transmutation | `transform`           | add to curated|

`magic-swirl` — formerly the spell mapper's hardcoded default (the "static
magic hand" that appeared on every imported spell) — is repurposed as the
Evocation school icon.

## Curated set expansion (~33 additions)

All keys verified to exist in `@iconify-json/game-icons`. Each new entry needs
a per-icon import in `resolveIcon.tsx` (so it renders synchronously without
pulling the full-set chunk) and an entry in `CURATED_ICONS`. The 8 icons
required by the heuristic are marked ★.

**Schools — defaults + alternates:**

```
charm              ★  Enchantment default
drama-masks        ★  Illusion default
transform          ★  Transmutation default
love-mystery          Enchantment alt
imprisoned            Enchantment alt (hold/restrain)
frog-prince           Transmutation alt
morph-ball            Transmutation alt
spectre               Illusion alt
theater-curtains      Illusion alt
ghost                 Necromancy / Illusion alt
grim-reaper           Necromancy alt
all-seeing-eye        Divination alt
eye-of-horus          Divination alt
```

**Damage / element types** (current set is sparse here — only `fire-flower`,
`lightning-arc`, `ice-cube`, `snowflake-1`, `tornado`):

```
frozen-orb            cold variant
fire-spell-cast       fire variant
bolt-spell-cast       lightning variant
ice-spell-cast        frost variant
thunder-struck        thunder
arcing-bolt           chain lightning
poison-cloud       ★  poison / cloudkill
sunbeams              radiant
death-juice           necrotic
plasma-bolt           force
```

**Healing, divine, buffs, debuffs** (currently ~zero spell-flavored entries):

```
caduceus           ★  heal / cure
healing               cure alt
healing-shield        protective heal alt
prayer                bless / pray alt
angel-wings           divine / holy alt
night-sleep        ★  sleep
cursed-star        ★  curse / hex / bane
feathered-wing     ★  fly / levitate
wingfoot              haste / speed
enrage                rage / wrath
```

Curated set total grows from ~95 to ~128, proportionate to the existing item
coverage.

## Tests

- **`iconRules.test.ts`** — extended with spell cases:
  - Imported-spell shape (name + school in headerTags) routes correctly
    (`Fireball` → `fire-flower`; `Charm Person` → `charm`; `Misty Step` → `magic-portal`).
  - School-only fallback fires when name doesn't match any rule (`Mage Hand`,
    a Conjuration spell with no name keyword → `magic-portal`).
  - Custom spell with no school in headerTags falls through to dice.
  - Item-rule keyword does not leak into spells: a spell named "Spirit Hammer"
    does **not** pick `warhammer`.
  - Existing item rule cases still pass unchanged.
- **`curatedIcons.test.ts`** — extended:
  - Existing assertion (every curated key exists in `@iconify-json/game-icons`)
    stays.
  - New assertion: every icon referenced by `ITEM_RULES`, `SPELL_NAME_RULES`,
    `SCHOOL_ICONS`, and `FALLBACK_ICON_KEY` appears in `CURATED_ICONS`.
- **`spells.test.ts`** — the existing `iconKey === "magic-swirl"` assertion
  becomes `iconKey === undefined`, plus a sibling test that the in-card render
  path resolves a school-appropriate icon for a sample spell.
- **`Card.test.tsx`** — no change expected; existing snapshot/render tests
  cover the `card.iconKey ?? pickIconKey(card)` path.
- **`IconDebugView.test.tsx`** — extended for the kind toggle.

## Risks / things to watch

- **Persisted decks** — existing user decks already have `iconKey: "magic-swirl"`
  saved on imported spells. Those stay rendered with `magic-swirl` (the saved
  override wins over the heuristic, which is correct behavior). No migration
  needed; spells re-imported in the future will pick up the new heuristic.
- **Rule ordering footguns** — adding a new spell-name rule out of order could
  let `light` match before `lightning`. The rule table is short and ordered;
  tests cover the common collisions, but reviewers should think about ordering
  before merging future additions.
- **Cross-kind contamination** — explicitly avoided by `kind`-based dispatch.
  Tests pin this behavior so a future "merge into one table" refactor would
  trip if it broke the invariant.
- **Picker visual review** — once the curated set grows, eyeball the picker
  with a spell card selected to confirm the additions look coherent in the
  grid (no broken renders, sensible visual weight).
