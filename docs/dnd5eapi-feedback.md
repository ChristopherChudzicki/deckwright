# dnd5eapi integration notes — suggested enhancements

Notes from building a magic-item import wizard against dnd5eapi. The items below surface structural fields that, if added upstream, would let consumers stop hand-parsing prose to recover information that's already logically present in the data.

Endpoints involved: `/api/2014/magic-items/{index}` and `/api/2024/magic-items/{index}`.

---

## 1. Structured base-item reference on weapon/armor magic items

**Pain:** Determining whether a magic weapon/armor applies to a specific base item or any item matching a category requires parsing `desc[0]` (2014) or the first line of `desc` (2024) with a regex — and even then, distinguishing "specific" (`Sun Blade` is always a longsword) from "any" (`Flame Tongue` works on any melee weapon) from "options" (`Dwarven Plate 2024` lists `"Half Plate Armor or Plate Armor"`) requires further heuristics.

**What we currently parse:**

```
// 2014 desc[0]:  "Weapon (longsword), rare (requires attunement)"  → specific
// 2014 desc[0]:  "Weapon (any sword), legendary (requires attunement by a paladin)" → any
// 2024 desc[0]:  "Weapon (Any Melee Weapon)"  → any
// 2024 desc[0]:  "Weapon (Longsword), Rare"   → specific
```

**What we wish was structured:**

```jsonc
{
  // null when the item works on any matching base (Flame Tongue, Holy Avenger)
  "base_equipment": { "index": "longsword", "url": "/api/equipment/longsword" },
  // "any" | "specific" | "options"
  "template_kind": "specific"
}
```

A `base_equipment: null` + `template_kind: "any"` pair would let consumers build pickers ("which weapon do you want to apply this to?") without parsing prose. `"options"` would cover multi-choice cases like Dwarven Plate 2024.

---

## 2. Attunement parity between rulesets

**Pain:** The 2024 API exposes `attunement: boolean` as a top-level field. The 2014 API does not — attunement is only encoded in `desc[0]` prose, requiring consumers to regex-detect it:

```ts
const needsAttunement = /requires attunement/i.test(desc[0]);
```

This is fragile: phrasing variants like "requires attunement by a paladin" work, but any future wording change in the content repo would silently break detection.

**Suggested addition to 2014 records:**

```jsonc
{
  "attunement": true,
  "attunement_classes": ["paladin"]   // empty array when no class restriction
}
```

`attunement_classes` would also be useful for 2024 records where prose currently says "requires attunement by a paladin or cleric" — that restriction is currently only in the body text.

---

## 3. Drop the metadata header from the `desc` body

**Pain:** Both rulesets prepend `desc` (or `desc[0]`) with a line that restates information already available as structured fields — `equipment_category`, `rarity`, and `attunement`. Consumers must detect and strip this header to avoid displaying redundant information alongside the structured fields.

**Current shapes:**

- 2014: `desc[0]` is always `"<Type>[ (<base>)], <rarity>[, requires attunement[ by ...]]"`. Body starts at `desc[1]`.
- 2024: the first line of the `desc` string is `"<Type>[ (<base>)]"` followed by two trailing spaces (Markdown hard-break) and `\n`. Body follows.

**What we wish:** Either a separate `body` field containing only the prose description, or simply omitting the metadata line from `desc` / `desc[0]`. The metadata is already in `equipment_category`, `rarity`, and `attunement` — duplicating it in `desc` forces every consumer to strip it or display it twice.

---

## 4. Subtype field on non-weapon/armor magic items

**Pain:** `equipment_category.name` is coarse for wondrous items and similar — it says `"Wondrous Items"` regardless of whether the item is a Wand, Rod, Staff, Ring, Potion, or Scroll. The narrower subtype only appears inside `desc[0]` (e.g. `"Wand, very rare"` or `"Ring, rare (requires attunement)"`).

**Examples:**

```
// All of these share equipment_category = "Wondrous Items" in 2014:
desc[0]: "Wand of Fireballs — Wand, rare (requires attunement by a spellcaster)"
desc[0]: "Ring of Feather Falling — Ring, rare (requires attunement)"
desc[0]: "Bag of Holding — Wondrous item, uncommon"
```

**Suggested addition:**

```jsonc
{ "subtype": "wand" }   // "wand" | "rod" | "staff" | "ring" | "potion" | "scroll" | null
```

This would allow icon selection, category filtering, and display grouping without prose parsing.

---

## 5. Shape parity between rulesets

**Pain:** Several fields differ in type or presence between the 2014 and 2024 APIs, requiring branched consumer code:

| Field | 2014 shape | 2024 shape |
|---|---|---|
| `desc` | `string[]` (array) | `string` (single string) |
| `equipment_category` | singular object | singular object (consistent here) |
| `attunement` | absent | `boolean` |

The `desc` type flip is the most disruptive — it forces separate parsing paths for every string operation (join, slice, search).

**Suggested:** Align `desc` to `string` in both rulesets (joining 2014's array with `\n\n` at the API layer), and backfill the `attunement` boolean on 2014 records. Documenting these divergences explicitly in the API reference would also help consumers who discover the difference at runtime.

---

## 6. Cost guidance for magic items

**Pain:** Magic items have no cost field. This is canonically correct — the DMG uses rarity bands rather than fixed prices — but it creates a gap for consumers who want to display approximate value. More importantly, the absence isn't documented in the schema, so consumers must infer it from trial and error.

**Suggested:** Either document in the schema that `cost` is intentionally absent on magic items and why, or add a nullable `suggested_cost?: { quantity: number; unit: "gp" } | null` for the small number of items where a canonical price exists. At minimum, a schema comment or README note would prevent confusion.
