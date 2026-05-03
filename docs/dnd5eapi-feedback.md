# dnd5eapi integration notes — suggested enhancements

Notes from building a magic-item import wizard against dnd5eapi. The items below surface structural fields that, if added upstream, would let consumers stop hand-parsing prose to recover information that's already logically present in the data.

Endpoints involved: `/api/2014/magic-items/{index}` and `/api/2024/magic-items/{index}`.

---

## 1. Structured base-item reference on weapon/armor magic items

**Pain:** Determining whether a magic weapon/armor applies to a specific base item or any item matching a category requires parsing `desc[0]` (2014) or the first line of `desc` (2024) with a regex — and even then, distinguishing "specific" (`Sun Blade` is always a longsword) from "any" (`Flame Tongue` works on any melee weapon) requires heuristics.

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
  // "any" | "specific"
  "template_kind": "specific"
}
```

A `base_equipment: null` + `template_kind: "any"` pair would let consumers build pickers ("which weapon do you want to apply this to?") without parsing prose.

---

## 2. Attunement parity between rulesets

**Pain:** The 2024 API exposes `attunement: boolean` as a top-level field. The 2014 API does not — attunement is only encoded in `desc[0]` prose, requiring consumers to regex-detect it:

```ts
const needsAttunement = /requires attunement/i.test(desc[0]);
```

This is fragile: phrasing variants like "requires attunement by a paladin" work, but any future wording change in the content repo would silently break detection.

Additionally, the 2024 API already exposes a `limited-to` string field for class-restricted attunement (e.g. `holy-avenger` has `"limited-to": "Paladin"`; `staff-of-power` has `"limited-to": "Sorcerer, Warlock, or Wizard"`). This is currently a prose string, which prevents machine-readable filtering.

**Suggested additions:**

```jsonc
{
  "attunement": true,
  // structured array replacing the prose "limited-to" string in 2024;
  // backfilled from desc[0] prose for 2014 records
  "attunement_classes": ["paladin"]   // empty array when no class restriction
}
```

This would:
1. Backfill `attunement: boolean` on 2014 records (currently absent).
2. Structure the existing 2024 `limited-to` prose string as a typed array for machine-readability.
3. Backfill the same `attunement_classes` field to 2014 records, where attunement constraints currently live only in `desc[0]` prose.

---

## 3. Drop the metadata header from the `desc` body

**Pain:** Both rulesets prepend `desc` (or `desc[0]`) with a line that restates information already available as structured fields — `equipment_category`, `rarity`, and `attunement`. Consumers must detect and strip this header to avoid displaying redundant information alongside the structured fields.

**Current shapes:**

- 2014: `desc[0]` is always `"<Type>[ (<base>)], <rarity>[, requires attunement[ by ...]]"`. Body starts at `desc[1]`.
- 2024: the first line of the `desc` string is `"<Type>[ (<base>)]"` followed by a newline. Body follows. Consumers strip through the first `\n` and trim.

**What we wish:** Either a separate `body` field containing only the prose description, or simply omitting the metadata line from `desc` / `desc[0]`. The metadata is already in `equipment_category`, `rarity`, and `attunement` — duplicating it in `desc` forces every consumer to strip it or display it twice.

---

## 4. Shape parity between rulesets

**Pain:** Several fields differ in type or presence between the 2014 and 2024 APIs, requiring branched consumer code:

| Field | 2014 shape | 2024 shape |
|---|---|---|
| `desc` | `string[]` (array) | `string` (single string) |
| `equipment_category` | singular object | singular object (consistent here) |
| `attunement` | absent | `boolean` |
| `limited-to` | absent | `string` (prose) |

The `desc` type flip is the most disruptive — it forces separate parsing paths for every string operation (join, slice, search).

**Suggested:** Align `desc` to `string` in both rulesets (joining 2014's array with `\n\n` at the API layer), and backfill the `attunement` boolean on 2014 records. Documenting these divergences explicitly in the API reference would also help consumers who discover the difference at runtime.

---

## 5. Cost guidance for magic items

**Pain:** Magic items have no cost field. This is canonically correct — the DMG uses rarity bands rather than fixed prices — but it creates a gap for consumers who want to display approximate value. More importantly, the absence isn't documented in the schema, so consumers must infer it from trial and error.

**Suggested:** Either document in the schema that `cost` is intentionally absent on magic items and why, or add a nullable `suggested_cost?: { quantity: number; unit: "gp" } | null` for the small number of items where a canonical price exists. At minimum, a schema comment or README note would prevent confusion.
