# Mundane items — new browse content type

## Problem

The browse dialog currently exposes two SRD content types: magic items (sourced from Open5e `/v2/magicitems/`) and spells (Open5e `/v2/spells/`). Users browsing for cards have no way to pull non-magical items — weapons, armor, adventuring gear, tools, mounts, etc. — even though Open5e exposes them through a separate endpoint and they're a natural fit for the existing `<Card>` shape (header tags, markdown body, footer tags).

## Goal

Add a third content type, **Mundane Items**, sourced one-for-one from Open5e v2 `/items/` for both srd-2014 and srd-2024 rulesets. Surface it as a sidebar entry in the existing browse dialog. Each row converts to a card whose header tags carry the item's mechanical structure (damage, AC, properties, mastery), body carries the item's `desc`, and footer tags carry cost and weight. No db migration. No new card kind.

The tabs ↔ endpoints mapping is the spec's mental model: rarity-bearing items are magic and live in `/magicitems/`; rarity-less items are mundane and live in `/items/`. We adopt Open5e's categorization as authoritative even when individual entries (e.g., Airship, Ioun Stone) are arguably magical in flavor — they have no rarity, aren't on the DMG rarity tables, and Open5e places them in `/items/`, so the Mundane Items tab is where they appear.

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

| Tab | Source | srd-2024 | srd-2014 |
|---|---|---|---|
| Magic Items (existing) | `/v2/magicitems/?document=srd-{ruleset}` | 757 | 499 |
| Mundane Items (new) | `/v2/items/?document=srd-{ruleset}` | 203 | 237 |

The two endpoints are completely disjoint by key (verified empirically — zero shared slugs in either direction). No deduplication or merging is required. `/items/` does include eight srd-2024 entries categorized as `potion` / `wondrous-item` / `scroll` (Airship, Ioun Stone, Antitoxin, Case Map or Scroll, generic Potion of Healing, generic Spell Scroll, etc.); these surface in the Mundane Items tab — that's where Open5e puts them, and most lack a rarity field. The five srd-2014 analogues (rod, staff, wand placeholders; Signet Ring; Yew Wand) are handled the same way.

### Endpoint shape (relevant fields)

`GET /v2/items/?document=srd-{ruleset}` returns paginated entries shaped like:

```ts
{
  key: string;                      // e.g. "srd-2024_battleaxe"
  name: string;                     // e.g. "Battleaxe"
  desc: string;                     // markdown; often sparse for weapons/armor
  category: { name: string; key: string };
  weapon: null | {
    damage_dice: string;            // "1d8"
    damage_type: { name: string; key: string };
    properties: ReadonlyArray<{
      property: { name: string; type: string | null; desc: string };
      detail: string | null;        // e.g. "1d10" for Versatile
    }>;
    is_simple: boolean;
    is_martial: boolean;
    is_improvised: boolean;
    distance_unit: "feet";
    range?: number;                 // present on ranged weapons
    long_range?: number;
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
  weight_unit: "lb";
  cost: string;                     // decimal gold, e.g. "10.00", "0.05"
  document: { key: string; ... };
}
```

The Zod schema validates these shapes; `weapon` / `armor` populate only when applicable. Improvised weapons (Acid, Holy Water, Net, Oil, Torch) have `category.key === "weapon"` but `weapon: null` and a rich `desc` that explains usage — the mapper treats them as plain items.

### Card composition

Mirrors the existing `magicItemDetailToCard` mapper, with mundane-specific differences (no rarity, no attunement, cost present).

**Header tags** (in order):
1. `category.name` (e.g., `Weapon`, `Armor`, `Adventuring Gear`).
2. If `weapon` is non-null:
   - `Simple` or `Martial` (whichever flag is true).
   - `{damage_dice} {damage_type.name.toLowerCase()}` — e.g., `1d8 slashing`.
   - One tag per `properties[]` entry — `{property.name}{suffix}` where suffix is:
     - ` (Mastery)` if `property.type === "Mastery"`,
     - ` ({detail})` if `detail !== null` (e.g., `Versatile (1d10)`),
     - empty otherwise.
   - `Range {range}/{long_range} ft` when both fields are non-zero.
3. If `armor` is non-null:
   - `armor.category` capitalized (`Light` / `Medium` / `Heavy`).
   - AC string built using the same formula as the magic-items mapper:
     - `AC {ac_base}` plus ` + dex mod (max {ac_cap_dexmod})` if `ac_add_dexmod`, dropping the cap clause if `ac_cap_dexmod === null`.
   - `Stealth disadvantage` when `grants_stealth_disadvantage` is true.
   - `Str {strength_score_required}` when non-null.

**Body:** raw `desc`, rendered through the existing `renderBody` markdown pipeline. No changes to `Card.tsx` or `renderBody`. Sparse weapon/armor descs (`"A battleaxe."`) are accepted — header tags carry the mechanical content.

**Footer tags:**
- Cost, formatted as `{n} gp` / `{n} sp` / `{n} cp` — see "Cost formatting" below. Omitted when cost is `0`.
- `{weight} {weight_unit}` (e.g., `4 lb`) when `parseFloat(weight) > 0`.
- No rarity. No attunement.

**`kind`:** `"item"`. Same `ItemCard` shape as magic items. `Card.tsx`, icon resolution, print pipeline, deck UI all unchanged.

### Cost formatting

Open5e returns cost as a decimal-gold string. Convert to D&D coin denominations for readability:

| Decimal cost | Rendered tag |
|---|---|
| `0.00` (or `null`) | omitted |
| `< 0.10` | `{n} cp` (multiply by 100) |
| `0.10` – `0.99` | `{n} sp` (multiply by 10) |
| `>= 1.00` | `{n} gp` |

Strip trailing `.00` for whole numbers (`10 gp`, not `10.00 gp`). Show one decimal place where needed (`4 sp`, `5 cp`).

### Internal id rename

The existing magic-items content type registers itself with `id: "items"` even though its label is already `"Magic Items"`. Adding a new content type whose label is "Mundane Items" calls for renaming the existing entry's id to align with its label and file naming (`magicItems.ts`, `magicItemDetailToCard`, etc.).

| What | Before | After |
|---|---|---|
| `src/api/content-types/items.ts` `id` | `"items"` | `"magic-items"` |
| File path (optional cleanup) | `src/api/content-types/items.ts` | `src/api/content-types/magic-items.ts` |
| Exported symbol (optional cleanup) | `itemsContentType` | `magicItemsContentType` |
| Label (no change) | `"Magic Items"` | `"Magic Items"` |

The id is used only as a React Aria tab key inside `BrowseApiModal.tsx` (no persistence, no URL state, no db reference). The user-facing change is zero. The new mundane content type registers with `id: "mundane-items"`.

### Files added

| File | Purpose |
|---|---|
| `src/api/endpoints/mundaneItems.ts` | `fetchMundaneItemsIndex(ruleset)` — loads `src/data/srd-{ruleset}-mundane-items.json`. Mirrors `endpoints/magicItems.ts`. |
| `src/api/mappers/mundaneItems.ts` | `mundaneItemDetailToCard(detail)` — produces an `ItemCard`. |
| `src/api/content-types/mundane-items.ts` | `mundaneItemsContentType` (id `mundane-items`, label "Mundane Items"). |
| `src/data/srd-2014-mundane-items.json` | Bundled fetch output (committed, like the existing magic-item / spell bundles). |
| `src/data/srd-2024-mundane-items.json` | Bundled fetch output. |

### Files modified

| File | Change |
|---|---|
| `src/data/srd-schema.ts` | Add `mundaneItemSchema` (Zod) and `mundaneItemDetailSchema`. |
| `scripts/fetch-srd.ts` | Add a `mundane-items` resource entry with endpoint URL, schema, and output filenames per ruleset. |
| `src/api/hooks.ts` | Add `useMundaneItemsIndex(ruleset)` (TanStack Query wrap of `fetchMundaneItemsIndex`). |
| `src/api/content-types/index.ts` | Register `mundaneItemsContentType` between `itemsContentType` and `spellsContentType`. |
| `src/api/content-types/items.ts` | One-line `id` change (`"items"` → `"magic-items"`). Optional file/symbol rename (see above). |
| `src/test/factories.ts` (or local factory file) | Add `mundaneItemDetailFactory`. |

### Files left alone

`src/cards/Card.tsx`, `src/cards/renderBody.ts`, `src/cards/resolveIcon.tsx`, the print pipeline (`src/views/PrintView.tsx`, print CSS), router, decks code, Supabase migrations, RLS policies. All untouched.

## Tests

Mirror the existing magic-item test structure.

`src/api/mappers/mundaneItems.test.ts`:
- Plain gear (e.g., Rope): category header tag, desc body, cost + weight footer tags.
- Real weapon (Battleaxe): `Weapon`, `Martial`, `1d8 slashing`, properties tags including a Mastery suffix and a Versatile detail.
- Ranged weapon (Longbow): `Range 150/600 ft` tag.
- Improvised weapon (Acid): `Weapon` only — no martial/simple/damage tags, since `weapon` is null.
- Light armor with stealth + cap (e.g., Studded Leather): `Light`, AC string with `+ dex mod`, no stealth/str tags.
- Heavy armor with stealth + str (Chain Mail): `Heavy`, `AC 16`, `Stealth disadvantage`, `Str 13`.
- Cost formatting: 25 gp, 4 sp, 5 cp, free (omitted).
- Zero-weight item (e.g., Bell): weight tag elided.

`src/api/endpoints/mundaneItems.test.ts`:
- Bundled JSON parses for both rulesets.
- Counts within an order of magnitude of the spec's table (sanity check, not exact).

`src/views/BrowseApiModal.test.tsx`:
- Extend existing tests to cover the new tab: switch to "Mundane Items", filter results, click a row, assert the saved card has the expected `headerTags` / `footerTags`.
- Sidebar order: assert tabs render in `[Magic Items, Mundane Items, Spells]` order.

## Risks and follow-ups

- **Sparse mundane weapon/armor descs.** Battleaxe's body is literally `"A battleaxe."`. Header tags carry the mechanical content; body is intentionally thin. Users wanting richer prose can edit the card after saving. If many users find this jarring, a follow-up could synthesize a body from the structured fields (e.g., a "Properties: …" line). Out of scope here.
- **Open5e categorization quirks.** A handful of items per ruleset are arguably mis-categorized by Open5e (Airship as wondrous-item, Antitoxin as potion, Signet Ring as ring). The "rarity → magic, no rarity → mundane" rule is the user-visible contract; the mundane tab includes whatever Open5e chose to put in `/items/`. We don't curate.
- **Future `/weapons/` and `/armor/` integration.** If we ever want a richer body composition for these categories, the dedicated endpoints are available; we already proved `/items/` carries the same structured fields, so it's a body-composition decision rather than a fetch decision.
- **Future `apiRef.contentType` field.** Not needed today (slugs are disjoint between endpoints), but if a "refresh from source" feature ever lands, the cheap path is to add an optional `contentType: "items" | "magicitems" | "spells"` to `apiRef` so cards know which endpoint to refetch from. Out of scope here.
