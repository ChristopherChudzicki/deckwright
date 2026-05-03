# Header Tags Implementation Plan

> Continuation of `2026-05-02-footer-tags.md`. Same patterns; this plan is compact because the patterns are established. Continues on the `footer-tags` branch (not merged yet — single branch will be merged together).

**Goal:** Replace `ItemCard.typeLine: string` with `headerTags: string[]`. Wire `TagInput` (the existing primitive) into the editor for the new field. Render the array with the same separate-spans + CSS-driven `·` separator pattern that footer tags use. Restructure the header layout so the icon floats right and the title + tags flow around it (per user request).

**User decisions:**
- One branch (continues `footer-tags`).
- Comma-splitting in migration is OK (data volume is low).
- Icon should float so tags can wrap around it.

---

## File map

**Modify:**
- `src/cards/types.ts` — `typeLine: string` → `headerTags: string[]`
- `src/decks/schema.ts` — Zod, with `.default([])` (matches footer-tags pattern)
- `src/cards/factories.ts` — produce `headerTags` array
- `src/test/factories.ts` — `makeItemPayload` adds `headerTags: []` (or trivial)
- `src/api/mappers/magicItems.ts` — produce `headerTags: [category, rarity, ...attunement]` from API response
- `src/cards/iconRules.ts` — `pickIconKey` reads `card.headerTags.join(" ")` instead of `card.typeLine`
- `src/cards/iconRules.test.ts` — update fixtures to use `headerTags` arrays
- `src/cards/Card.tsx` — render `headerTags` per the same pattern as `footerTags`. Move the icon DOM **into the header** so it can float; remove the `padding-right` reservation on `.title`.
- `src/cards/Card.module.css` — `.image`/`.fallbackIcon` go from `position: absolute` to `float: right`; new `.headerTags` + `.headerTag` rules (italic style, mirroring old `.typeLine`); add CSS `::before` separator for `.headerTag`
- `src/cards/Card.test.tsx` — update assertions (`card.typeLine` → per-tag check)
- `src/cards/measurer.ts` — scaffold mirrors new DOM (icon + header-tags spans inside header)
- `src/cards/measurer.test.ts` — update assertions
- `src/cards/ItemEditor.tsx` — replace the type-line `Input` with `TagInput`, similar pattern to footer-tags wiring
- `src/cards/ItemEditor.test.tsx` — update typing tests
- `src/views/EditorView.tsx` — stub uses `headerTags: []`; pristine check uses `.length === 0`
- `src/decks/schema.test.ts` — hand-built objects need `headerTags`
- `e2e/fixtures.ts` — `SeedItem.typeLine?` → `headerTags?: string[]`; `longItem` updated
- `e2e/print-pagination.spec.ts` — update assertion
- `supabase/schemas/card-payload.json` — regenerated

**Create:**
- `supabase/migrations/<ts>_rename_typeline_to_headertags.sql` — drops constraint, splits existing `typeLine` on `,` and `·`, writes as `headerTags` array, drops the old key, re-adds constraint.

---

## Notes / gotchas

- **Migration regex:** `\s*[,·]\s*` (split on both `,` and `·`). Comma is fine for `typeLine` data — typical values are `"Wondrous item, uncommon"`. Per user, low data volume; lossy edge cases (`"Wand, rare (requires attunement by a spellcaster)"` → `["Wand", "rare (requires attunement by a spellcaster)"]`) are acceptable.

- **API mapper change:** `magicItemDetailToCard` currently composes `"${category}, ${rarity.toLowerCase()}"` (+ optional `(requires attunement)`). New behavior: produce `[category, rarity.toLowerCase()]` plus `["requires attunement"]` if `attunement` is true. Drops the parenthesized form for new imports — cleaner chips.

- **iconRules:** `pickIconKey` reads `card.typeLine` for keyword matching. Replace with `card.headerTags.join(" ")` so the same matcher works against the joined string.

- **Layout refactor:** Move `<img>` / `<div className={fallbackIcon}>` from a card-level child to inside `<div className={header}>`. CSS: drop `position: absolute; top/right` from `.image` and `.fallbackIcon`. Add `float: right; margin-left: 0.4em`. Drop `.title { padding-right }`. Title and `headerTags` wrap around the floated icon naturally. Header height grows to contain the float (or use `overflow: hidden` on `.header` if needed; spot-check rendering before deciding).

- **Print sensitivity:** `Card.module.css` is sensitive (per CLAUDE.md). The float refactor changes the icon's effective top from `0.2em` (relative to card edge) to wherever the header starts (`1.15em` card padding from top). Slightly lower position. Acceptable per user's "ideally tags flow around it."

- **Zod default in JSON Schema vs. migration heredoc:** same harmless divergence as footer-tags work — `default` is informational, no validation impact.

---

## Tasks

1. **Types + Zod + factories + JSON Schema regen** — single subagent. Includes `iconRules.ts` consumer update + `magicItems.ts` mapper update because they directly construct `ItemCard`s.
2. **Card.tsx + Card.module.css** (headerTags render + icon float) — single subagent. Tests in `Card.test.tsx`.
3. **measurer.ts + measurer.test.ts** — single subagent.
4. **ItemEditor.tsx + ItemEditor.test.tsx** — single subagent.
5. **EditorView stub + pristine** — inline.
6. **SQL migration** — single subagent, rigorous review (parallel to footer-tags Task 8).
7. **e2e fixtures + spec** — inline.
8. **Final verification** — lint, build, test, schema-check, manual smoke.

---

## Self-review notes

- iconRules: keyword-matching against the joined string preserves existing behavior. The icon-rule fixtures use `typeLine` strings like `"Weapon, rare"` — switching to `headerTags: ["Weapon", "rare"]` joins to `"Weapon rare"` (no comma) — so any rule that matches against `"Weapon"` still matches.
- The header layout refactor will change the header's CSS layout primitive (block with float instead of flex with absolute icon). Need to verify the divider + body still render correctly. Print preview in dev should make this obvious.
