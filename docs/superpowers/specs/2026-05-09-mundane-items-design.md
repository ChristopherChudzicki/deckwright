# Mundane items — new browse content type

## Problem

The browse dialog currently exposes two SRD content types: magic items (sourced from Open5e `/v2/magicitems/`) and spells (Open5e `/v2/spells/`). Users browsing for cards have no way to pull non-magical items — weapons, armor, adventuring gear, tools, mounts, etc. — even though Open5e exposes them through a separate endpoint and they're a natural fit for the existing `<Card>` shape (header tags, markdown body, footer tags).

## Goal

Add a third content type, **Mundane Items**, sourced one-for-one from Open5e v2 `/items/` for both srd-2014 and srd-2024 rulesets. Surface it as a sidebar entry in the existing browse dialog. Each row converts to a card whose header tags carry the item's mechanical structure (damage, AC, properties, mastery, range), body carries the item's `desc`, and footer tags carry cost and weight. No db migration. No new card kind.

The browse dialog exposes a single "Items" tab that merges entries from both `/v2/magicitems/` (rarity-bearing magic items) and `/v2/items/` (the SRD's umbrella item list, which also includes rarity-less magical entries that Open5e didn't denormalize — generic Potion of Healing, Spell Scroll, Potion of Giant Strength, etc.). Combining them avoids a confusing UX in which a user searching for "ioun stone" or "potion of healing" would have to know Open5e's classification quirks. Both endpoints feed one tab; each row carries enough origin context (its slug + which mapper to use) to produce a card with the correct shape regardless of source.

## Non-goals

- **No `/weapons/` or `/armor/` enrichment.** The `/items/` endpoint already includes `weapon` and `armor` sub-objects with full mechanical detail (damage_dice, properties, AC, strength req, stealth disadvantage). No second fetch needed.
- **No category filter chips, sub-tabs, or grouping.** Plain text search only, like the other tabs. The browse list shows category as the meta column, analogous to rarity for magic items.
- **No per-category icons.** Card icon resolution stays generic via `kind: "item"`.
- **No new card kind.** Both magic and mundane items use the existing `kind: "item"`. Once a card exists, the magic/mundane distinction isn't meaningful for rendering, printing, or editing — the data on the card is what differs.
- **No db migration.** `apiRef` schema is unchanged; the existing slug uniquely identifies the source (`/items/` and `/magicitems/` are key-disjoint, so no ambiguity).
- **No "refresh from source" or live refetch flow.** Cards are snapshots at save time, same as today.
- **No backfill or migration of existing magic-item cards.** Existing rows continue to work as-is.

## Approach

### Coverage

| Tab | Sources | srd-2024 | srd-2014 |
|---|---|---|---|
| Items | `/v2/magicitems/` + `/v2/items/` (`?document=srd-{ruleset}`) | 960 | 736 |

The two endpoints are completely disjoint by key (verified empirically — zero shared slugs in either direction). No deduplication or merging is required. `/items/` does include a handful of entries categorized as `potion` / `wondrous-item` / `scroll` / `ring` / `wand` etc.; these surface in the unified Items tab — that's where Open5e puts them, and they lack a rarity field. The full list:

- **srd-2024 (8):** `airship`, `antitoxin`, `case-map-or-scroll`, `ioun-stone`, `potion-of-giant-strength`, `potion-of-healing`, `potions-of-healing`, `spell-scroll`. The four `potion-*` / `spell-scroll` entries are generic parents whose individual variants (`Potion of Hill Giant Strength`, `Spell Scroll, 1st Level`, …) live in `/magicitems/`.
- **srd-2014 (5):** `rod`, `staff`, `wand` (generic parents; variants in `/magicitems/`); `signet-ring`, `yew-wand` (mundane items Open5e categorizes as ring/wand).

### Endpoint shape (relevant fields)

`GET /v2/items/?document=srd-{ruleset}` returns paginated entries shaped like:

```ts
{
  key: string;                      // e.g. "srd-2024_battleaxe"
  name: string;                     // e.g. "Battleaxe"
  desc: string;                     // markdown; often sparse for weapons/armor
  category: { name: string; key: string };
  size: { name: string; key: string };
  weapon: null | {
    damage_dice: string;            // "1d8"
    damage_type: { name: string; key: string };
    properties: ReadonlyArray<{
      property: { name: string; type: string | null; desc: string };
      detail: string | null;        // e.g. "1d10" for Versatile, "Range 150/600; Arrow" for Ammunition
    }>;
    is_simple: boolean;
    is_martial: boolean;
    is_improvised: boolean;
    distance_unit: "feet";
  };
  armor: null | {
    category: "light" | "medium" | "heavy";
    ac_base: number;
    ac_display: string;
    ac_add_dexmod: boolean;
    ac_cap_dexmod: number | null;
    grants_stealth_disadvantage: boolean;
    strength_score_required: number | null;
  };
  weight: string;                   // decimal string, e.g. "4.000"
  weight_unit: "lb";                // always "lb" empirically; mirror existing magic-items: z.string()
  cost: string;                     // decimal gold; always present (string, never null), 0.00 means free
  document: { key: string; ... };
}
```

A few empirical facts the schema and mapper depend on:

- `weapon` and `armor` populate only when applicable (else `null`). Improvised weapons (Acid, Holy Water, Net, Oil, Torch) have `category.key === "weapon"` but `weapon: null` and a rich `desc` that explains usage — the mapper treats them as plain items.
- For real weapons (`weapon` non-null), exactly one of `is_simple` / `is_martial` is `true` across both rulesets. `is_improvised` is always `false` for these and is ignored by the mapper. (We do not emit a tag from these flags except `Simple` / `Martial`.)
- **Range is encoded in `properties[].detail` strings, not as separate fields.** Ammunition / Thrown properties carry detail like `"Range 150/600; Arrow"` (2024) or `"range 150/600"` (2014, lowercase). The mapper does not parse these; the property tag rule (below) surfaces them via the `(detail)` suffix as part of the parent property tag (e.g., `Ammunition (Range 150/600; Arrow)`).
- `armor.category` takes only the values `light` / `medium` / `heavy` empirically. Schema may use `z.enum([...])`.
- `cost` is always a non-null string; `0.00` means free. Schema: `z.string()`.
- `desc` may be sparse (`"A battleaxe."`) but is always a non-empty string in the SRD. The body renders it as-is.

The Zod schema (`mundaneItemSchema`) declares only the fields above and lets Zod strip the rest, mirroring the existing magic-items schema.

### Card composition

Mirrors the existing `magicItemDetailToCard` mapper. Differences from magic items: no rarity tag (mundane items don't have rarity); no attunement tag (mundane items aren't attunable); cost tag present (mundane items always have a published list price, while 5e magic items typically don't have meaningful prices — GMs set them when it matters — so the magic-items mapper stays unchanged).

**Header tags** (in order):
1. `category.name` (e.g., `Weapon`, `Armor`, `Adventuring Gear`).
2. If `weapon` is non-null:
   - `Simple` or `Martial` (whichever of `is_simple` / `is_martial` is `true`).
   - `{damage_dice} {damage_type.name.toLowerCase()}` — e.g., `1d8 slashing`.
   - One tag per `properties[]` entry — `{property.name}{suffix}` where suffix is:
     - ` (Mastery)` if `property.type === "Mastery"`,
     - ` ({detail})` if `detail !== null` (e.g., `Versatile (1d10)`, `Ammunition (Range 150/600; Arrow)`, `Thrown (Range 20/60)`),
     - empty otherwise.

   Range information for ranged and thrown weapons rides along inside the property tag's `(detail)` suffix; no separate range tag.
3. If `armor` is non-null:
   - `armor.category` capitalized (`Light` / `Medium` / `Heavy`).
   - AC string built using the same formula as the magic-items mapper:
     - `AC {ac_base}` plus ` + dex mod (max {ac_cap_dexmod})` if `ac_add_dexmod`, dropping the cap clause if `ac_cap_dexmod === null`.
   - `Stealth disadvantage` when `grants_stealth_disadvantage` is true.
   - `Str {strength_score_required}` when non-null.

**Body:** raw `desc`, rendered through the existing `renderBody` markdown pipeline. No changes to `Card.tsx` or `renderBody`. Sparse weapon/armor descs (`"A battleaxe."`) are accepted — header tags carry the mechanical content.

**Footer tags** (in order):
- Cost, formatted as one of `{n} cp` / `{n} sp` / `{n} gp` per the table below. Omitted when `cost === "0.00"`.
- `{weight} {weight_unit}` (e.g., `4 lb`) when `parseFloat(weight) > 0`. Omitted otherwise.
- No rarity. No attunement.

**`kind`:** `"item"`. Same `ItemCard` shape as magic items. `Card.tsx`, icon resolution, print pipeline, deck UI all unchanged.

### Cost formatting

Open5e returns cost as a non-null decimal-gold string (`"10.00"`, `"0.05"`, `"0.00"`). Render to D&D coin denominations using whole-number quantities — every SRD cost expressed as gp/sp/cp lands on an integer:

| Decimal cost (gp) | Tag |
|---|---|
| `"0.00"` | omitted |
| `< 0.10` | `{round(gp × 100)} cp` (e.g., `"0.05"` → `5 cp`, `"0.02"` → `2 cp`) |
| `>= 0.10` and `< 1.00` | `{round(gp × 10)} sp` (e.g., `"0.10"` → `1 sp`, `"0.40"` → `4 sp`, `"0.50"` → `5 sp`) |
| `>= 1.00` | `{integer gp} gp` (e.g., `"1.00"` → `1 gp`, `"10.00"` → `10 gp`, `"400.00"` → `400 gp`) |

All real SRD costs across both rulesets fall on integer cp / sp / gp values; the mapper does not need to render fractional denominations.

### Internal: unified `items.ts` content type

Earlier in the branch, the existing `content-types/items.ts` module was renamed to
`content-types/magic-items.ts` to make room for a sibling `content-types/mundane-items.ts`.
The unified design supersedes that split: a single `content-types/items.ts` module calls
both `useMagicItemIndex` and `useMundaneItemIndex`, merges and sorts the rows
alphabetically, and routes each row through the appropriate mapper at click time.
The two intermediate sibling modules (`magic-items.ts`, `mundane-items.ts`) are
deleted; only the unified `items.ts` remains.

### Files added

| File | Purpose |
|---|---|
| `src/api/endpoints/mundaneItems.ts` | `fetchMundaneItemsIndex(ruleset)` — loads `src/data/srd-{ruleset}-mundane-items.json`. Mirrors `endpoints/magicItems.ts`. |
| `src/api/mappers/mundaneItems.ts` | `mundaneItemDetailToCard(detail)` — produces an `ItemCard`. |
| `src/api/content-types/items.ts` | `itemsContentType` (id `items`, label "Items") — unified module calling both `useMagicItemIndex` and `useMundaneItemIndex`, replacing the former `magic-items.ts` and `mundane-items.ts` siblings. |
| `src/data/srd-2014-mundane-items.json` | Bundled fetch output (committed, like the existing magic-item / spell bundles). |
| `src/data/srd-2024-mundane-items.json` | Bundled fetch output. |

### Files modified

| File | Change |
|---|---|
| `src/data/srd-schema.ts` | Add `mundaneItemSchema` (Zod) and `mundaneItemDetailSchema`. |
| `scripts/fetch-srd.ts` | Add a `mundane-items` resource entry with endpoint URL, schema, and output filenames per ruleset. |
| `src/api/hooks.ts` | Add `useMundaneItemIndex(ruleset)` (TanStack Query wrap; mirror existing `useMagicItemIndex` naming). |
| `src/api/content-types/index.ts` | Update imports to use unified `itemsContentType` from `./items`. Registry array becomes `[itemsContentType, spellsContentType]`. |
| `src/api/factories.ts` | Add `mundaneItemDetailFactory`, `mundaneItemIndexEntryFactory`, `mundaneItemIndexFactory` for parity with the three existing magic-item factories. |

### Files left alone

`src/cards/Card.tsx`, `src/cards/renderBody.ts`, `src/cards/resolveIcon.tsx`, the print pipeline (`src/views/PrintView.tsx`, print CSS), router, decks code, Supabase migrations, RLS policies. All untouched.

## Tests

Mirror the existing magic-item test structure.

`src/api/mappers/mundaneItems.test.ts`:
- Plain gear (e.g., Rope, srd-2024): category header tag, desc body, weight footer tag.
- Real weapon (Battleaxe, **srd-2024**): `Weapon`, `Martial`, `1d8 slashing`, property tags including `Topple (Mastery)` and `Versatile (1d10)`. (srd-2014 Battleaxe lacks the Mastery property; tests that assert Mastery must use the srd-2024 fixture.)
- Ranged weapon (Longbow, srd-2024): properties include `Ammunition (Range 150/600; Arrow)` as a single tag — no separate range tag.
- Thrown weapon (Dagger or Javelin, srd-2024): `Thrown (Range 20/60)` etc. surfaces the same way as Ammunition.
- "Improvised" / consumable category-weapon (Acid, srd-2024): `Weapon` only (the literal category tag) — no martial/simple/damage/property tags because `weapon` is `null`. Body carries the rich desc.
- Light armor with stealth + cap (e.g., Studded Leather): `Light`, AC string with `+ dex mod`, no stealth/str tags.
- Heavy armor with stealth + str (Chain Mail): `Heavy`, `AC 16`, `Stealth disadvantage`, `Str 13`.
- Zero-weight item (e.g., Bell): weight tag elided; cost tag still emitted.
- Cost formatting:
  - `"10.00"` → `10 gp` (Battleaxe).
  - `"0.50"` → `5 sp` (Blanket).
  - `"0.05"` → `5 cp` (Blowgun Needle).
  - `"0.00"` → cost tag elided.

`src/api/endpoints/mundaneItems.test.ts`:
- Bundled JSON parses against `mundaneItemSchema` for both rulesets.
- Sanity floor: each ruleset's bundle has at least 150 entries (catches partial-page bundling failures; actual counts are 203 / 237).

`src/views/BrowseApiModal.test.tsx`:
- Update the tab-presence assertion: the sidebar list stays at `["Items", "Spells"]` (the existing "Items" tab is reused; no third tab is added).
- New: click a mundane item row from the Items tab and assert the saved card carries the expected `headerTags` / `footerTags` shape (e.g., a Battleaxe save persists `Weapon` / `Martial` / `1d8 slashing` / property tags / `4 lb`).
- Add a test that the unified Items tab merges magic and mundane sources alphabetically (a magic item and a mundane item are both visible, ordered by name).
- The unified tab inherits the existing loading / empty / error / Retry behavior via `TypePanel`; the mapping-level tests above are sufficient and we do not duplicate the panel-state assertions per content type.

## Risks and follow-ups

- **Sparse mundane weapon/armor descs.** Battleaxe's body is literally `"A battleaxe."`. Header tags carry the mechanical content; body is intentionally thin. Users wanting richer prose can edit the card after saving. A planned follow-up is build-time LLM summarization of bodies (some are too long to fit a card and need shrinking; mundane bodies could go the other way and get fleshed out, with structured-field tag extraction as a side benefit).
- **Range info lives in property `(detail)` strings.** Header tags read `Ammunition (Range 150/600; Arrow)` rather than a clean `Range 150/600 ft` tag. Verbose but factually correct. The same future LLM extraction step could promote range to its own tag.
- **Open5e categorization quirks.** A handful of items per ruleset (8 in srd-2024, 5 in srd-2014, enumerated in Coverage) are arguably mis-categorized by Open5e (e.g., Ioun Stone, generic Potion of Healing entries). The unified Items tab incorporates these transparently — users see all items in one place without needing to know Open5e's classification.
- **Future `/weapons/` and `/armor/` integration.** If we ever want a richer body composition for these categories, the dedicated endpoints are available; we already proved `/items/` carries the same structured fields, so it's a body-composition decision rather than a fetch decision.
- **Future `apiRef.contentType` field.** Not needed today (slugs are disjoint between endpoints), but if a "refresh from source" feature ever lands, the cheap path is to add an optional `contentType: "items" | "magicitems" | "spells"` to `apiRef` so cards know which endpoint to refetch from. Out of scope here.
