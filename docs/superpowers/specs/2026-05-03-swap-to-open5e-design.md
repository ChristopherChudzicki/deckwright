# Swap dnd5eapi → Open5e for magic-item import

**Status:** spec
**Branch:** `swap-to-open5e`
**Owner:** chris

## Why

Spell import is the next planned feature, and dnd5eapi (the API we use today) has no 2024 SRD spell data and no merged work toward it. A community-tracked PR exists on a contributor fork but is stalled upstream; a realistic ETA is 1–3 months at the current cadence.

Open5e v2 covers both rulesets across both content types we care about — magic items and spells — under a single provider, and exposes meaningfully richer structured data per item.

This branch makes the provider swap **for magic items only**, scoped narrowly so spell import can layer on cleanly afterward.

A secondary motivation: dnd5eapi returns one "template" entry for items with multiple bases (e.g., a single _Adamantine Armor_ entry whose description reads "any medium or heavy armor that isn't hide"). To cope with that, we built an entire enrichment subsystem — a second modal step (`EnrichmentStep`) that fetches a separate equipment list, asks the user to pick a base, and then renames the card and injects damage/AC/weight tags. Today's `magicItemDetailToCard` is doing five distinct jobs to support this: regex-parsing the description prose for "any X" hints, conditionally renaming the card to append the picked base, stripping a metadata header line out of the body, and injecting equipment-derived tags into header and footer. There's also a small editor-side notice (`templateNotice`) for when the user lands on a template card without going through enrichment.

Open5e pre-splits every variant into its own concrete entry (`Adamantine Armor (Breastplate)`, `Adamantine Armor (Chain Mail)`, `Adamantine Armor (Plate)`, etc., each with the correct stats baked in). The whole subsystem becomes dead code: the second modal step, the equipment endpoint, the `parseBaseHint` regex parser, the `composeName`/`stripBodyPrefix`/`detectAttunement2014` helpers, the equipment-to-tag mappers, the editor notice, and the related MSW handlers / hook / factories. This branch deletes them all.

## Coverage delta

| Provider          | 2014 items | 2024 items | 2014 spells | 2024 spells |
| ----------------- | ---------: | ---------: | ----------: | ----------: |
| dnd5eapi (today)  |        ~362 |       ~234 |         319 |       **0** |
| Open5e v2 (after) |        499 |        757 |         319 |         339 |

(2014 item count grows on Open5e because variants are split into separate entries; 2024 item count is genuinely larger because SRD 5.2 added content.)

## Scope

### In

- Repoint magic-item index + detail fetching from `dnd5eapi.co/api/{ruleset}/magic-items/...` to `api.open5e.com/v2/magicitems/?document=srd-{ruleset}`.
- Rewrite `mappers/magicItems.ts` to consume Open5e's shape. The mapper drops to a single function with no ruleset branch, no enrichment parameter, no name-composition, no body-prefix stripping, no equipment-tag injection.
- **Delete the entire enrichment subsystem.** Files removed in full:
  - `src/views/EnrichmentStep.tsx` + `EnrichmentStep.module.css` (and any test file)
  - `src/api/endpoints/equipment.ts` + `equipment.test.ts`
  - `src/api/mappers/equipment.ts` (+ test if present)
  - `src/api/mappers/baseHint.ts` + `baseHint.test.ts`
- **Refactor `src/views/BrowseApiModal.tsx`** to a single-step flow: drop the `Step` discriminated union, drop the conditional title, drop the `<EnrichmentStep>` render branch, drop the `parseBaseHint`/`isEnrichable` calls, drop `data-slug` focus-restore and the related `useEffect`/`useRef`. The modal becomes index → click → save → close, with no second step.
- **Delete the template-item editor notice:** `isTemplateItem` predicate in `EditorView.tsx`, the `templateNotice` JSX, and the `.templateNotice` CSS rule.
- Change tag separator from middle-dot ` · ` to ` | ` — five sites total: two CSS pseudo-elements (`Card.module.css`), two `.join`s (`DeckView.tsx`, `EditorView.tsx`), and one test fixture string (`EditorView.test.tsx`).
- Update `apiRef.system` schema literal from `"dnd5eapi"` to `"open5e"`. No data migration — confirmed acceptable since the app has no users beyond the developer.
- Update fixtures, factories, and MSW handlers (drop equipment routes; replace dnd5eapi magic-items routes with Open5e routes).
- Drop `useEquipmentIndex` from `src/api/hooks.ts` and its tests; rewrite the dnd5eapi-shaped factories in `src/api/factories.ts` for the Open5e shape.

### Out (deferred to follow-ups)

- Spell import (next branch — rests on this work).
- Improving `iconRules.ts` to use Open5e's structured signal (`category.key`, `weapon.category`, `armor.category`). Tracked in [issue #32](https://github.com/ChristopherChudzicki/dnd-cards/issues/32). The existing regex-based `pickIconKey` continues to work unchanged on Open5e data — this section spells out why.
- Migrating any existing item rows in the database. They stay as-is; their `apiRef.system === "dnd5eapi"` is grandfathered out of validation by removing that literal entirely (re-imports replace anything users no longer trust).

## Detailed design

### 1. Client (`src/api/apiClient.ts`)

One line change: `BASE_URL` becomes `https://api.open5e.com`. The `apiGet<T>` helper, the 10s timeout, and the typed error shape all stay. The filename stays generic — we don't anticipate a second provider.

### 2. Endpoints (`src/api/endpoints/magicItems.ts`)

Rewritten against Open5e's v2 shape. Key changes:

- `Ruleset = "2014" | "2024"` is preserved as the public type. A private helper maps it to the Open5e document key: `"2014" → "srd-2014"`, `"2024" → "srd-2024"`.
- `fetchMagicItemIndex(ruleset)` issues `GET /v2/magicitems/?document=<doc>&limit=2000` and returns `MagicItemIndexEntry[]` shaped as `{ key: string; name: string }`. Open5e's `count` for SRD documents is well under 2000 today (757 for 2024), and `?limit=2000` returns the full set in a single response (`next: null`). The fetch asserts `count <= results.length` and throws a clear error if Open5e ever exceeds that — surfacing a real signal instead of silently dropping content.
- `fetchMagicItemDetail(ruleset, key)` issues `GET /v2/magicitems/${key}/` and returns a narrow `MagicItemDetail` modeling only the fields the mapper consumes:
  ```
  key, name, desc,
  category: { name },
  rarity:   { name },
  requires_attunement: boolean,
  attunement_detail:   string | null
  ```
  Other fields Open5e returns (`weapon`, `armor`, `size`, `weight`, `cost`, `casting_options`, `document`, etc.) are deliberately not modeled; they're for the future iconRules issue.
- The two ruleset-specific raw types (`MagicItemDetail2014Raw`, `MagicItemDetail2024Raw`) and the `MagicItemDetail` discriminated union collapse into a single shape. Net deletion: ~30 lines.

### 3. Mapper (`src/api/mappers/magicItems.ts`)

The current file is ~127 lines and exports a mapper with five helpers (`composeHeaderTags`, `composeFooterTags`, `composeName`, `stripBodyPrefix2014`, `stripBodyPrefix2024`, `detectAttunement2014`) plus the main `magicItemDetailToCard` that takes an optional `enrichment` argument. After this branch the file collapses to roughly 30 lines: one function, no helpers, no `enrichment` parameter, no `parseBaseHint` import, no `equipment` mapper imports.

```ts
const headerTags: string[] = [detail.category.name, detail.rarity.name.toLowerCase()];
if (detail.requires_attunement) {
  headerTags.push(
    detail.attunement_detail
      ? `requires attunement ${detail.attunement_detail}`
      : "requires attunement",
  );
}

return {
  ...common,
  headerTags,
  body: detail.desc,
  footerTags: [],
};
```

- `imageUrl` is always `undefined`. Open5e's `magicitems` endpoint exposes no image field; `Card` already falls back to the icon when `imageUrl` is absent. The `IMAGE_BASE` constant and the image-prefixing branch are deleted.
- `apiRef = { system: "open5e", slug: detail.key, ruleset }`. The `key` is Open5e's document-prefixed identifier (e.g., `srd-2024_adamantine-armor-breastplate`); we store it as-is.
- Five helpers that exist only to compensate for dnd5eapi quirks are all deleted:
  - `composeName` (renames "Flame Tongue" → "Flame Tongue (Trident)" after enrichment) — Open5e already returns concrete names.
  - `composeHeaderTags` / `composeFooterTags` (inject equipment-derived tags) — no enrichment, no injection.
  - `stripBodyPrefix2014` / `stripBodyPrefix2024` (strip the "Weapon (Any X)" header that dnd5eapi prepends to `desc`) — Open5e's `desc` is just the rules text.
  - `detectAttunement2014` (regex-sniffs the first paragraph because dnd5eapi 2014 has no boolean) — Open5e returns `requires_attunement` as a clean boolean for both rulesets.
- New affordance worth a test: `attunement_detail` (e.g., `"by a dwarf or paladin"`) is appended to the attunement tag when present. dnd5eapi didn't expose this.

Net change: ~100 lines deleted from this file alone.

### 4. Hooks (`src/api/hooks.ts`)

`useMagicItemIndex(ruleset)` and `useMagicItemDetail(ruleset, slug)` keep their signatures and TanStack Query keys (`["magic-items", ruleset, "index"]`, `["magic-items", ruleset, "detail", slug]`) and 24-hour `staleTime`/`gcTime`. **`useEquipmentIndex` is deleted entirely** along with its import and its tests in `src/api/hooks.test.tsx`.

### 5. Schema (`src/decks/schema.ts`)

```diff
 const apiRefSchema = z.object({
-  system: z.literal("dnd5eapi"),
+  system: z.literal("open5e"),
   slug: z.string(),
   ruleset: z.enum(["2014", "2024"]),
 });
```

The schema is only enforced in `parseDeckJson` (JSON import); database reads pass through `rowToCard` without validation. So the practical effect is that any deck JSON exported before this branch — if it contains items imported via the old API — fails re-import with a clear error. The developer's existing dev cards continue to render normally; only round-tripping through the export/import flow surfaces the literal change. Re-imports through the modal replace whatever the developer no longer trusts. Confirmed acceptable.

### 6. UI deltas

`src/views/EditorView.tsx`:

- Delete the `isTemplateItem` predicate.
- Delete the `templateNotice` render block.
- Update the counts-label join: `" · "` → `" | "`.

`src/views/EditorView.module.css`:

- Delete the `.templateNotice` rule.

`src/views/EditorView.test.tsx`:

- Delete tests asserting on `data-testid="template-notice"`.
- Update the counts-label fixture string from `"3 cards (4 per page) · 2 cards (2 per page)"` to `"3 cards (4 per page) | 2 cards (2 per page)"`.

`src/views/BrowseApiModal.tsx` — bigger refactor:

- Drop the `Step = { step: "pick" } | { step: "enrich"; ... }` union, the `step` state, and the conditional title.
- Drop the `<EnrichmentStep>` render branch and its imports (`EnrichmentStep`, `EquipmentDetail`, `parseBaseHint`, `BaseHint`, `MagicItemDetail` — only the type, the value import stays for `fetchMagicItemDetail`).
- Drop `isEnrichable`, `handleEnrichmentConfirm`, `handleEnrichmentCancel`.
- Drop the `lastPickedSlugRef` `useRef` and the `data-slug` focus-restore `useEffect`. They exist only to restore focus when the user backs out of the enrichment step; with no enrichment step, no need.
- Rename `entry.index` → `entry.key` everywhere (the React `key` prop, the lookup state, the call to `handlePick`). The `pickingSlug` state name stays — it just stores an Open5e key now.
- The remaining flow: load index → render rows → click → fetch detail → save card → close. The 2014/2024 ruleset toggle stays.

`src/views/DeckView.tsx`:

- Update the header-tag join: `" · "` → `" | "`.

`src/cards/Card.module.css`:

- Update the two `::before` pseudo-elements (`.headerTag + .headerTag::before`, `.footerTag + .footerTag::before`) from `content: " · ";` to `content: " | ";`.

The browse modal label, the 2014/2024 ruleset toggle, the search box, the editor form, the icon picker, the `Card` rendering, the routing, and the deck list all stay unchanged in shape and behavior.

### 7. Why icons keep working unchanged

`pickIconKey` in `src/cards/iconRules.ts` builds its haystack from `name + headerTags`. The mapper continues to put `category.name` as `headerTags[0]`, so the haystack shape is identical to today's. Open5e's category names happen to land favorably on the existing regex rules, in many cases more accurately than dnd5eapi did:

- "Ring of Protection" → category `"Ring"` → `\brings?\b` rule → `ring` ✓
- "Wand of Magic Missiles" → category `"Wand"` → `\b(?:rods?|wands?|staff|staves)\b` rule → `wizard-staff` ✓
- "Bag of Holding" → category `"Wondrous Item"` → no rule hits, name has no keyword → fallback `perspective-dice-six-faces-random` ✓ (unchanged from today)

dnd5eapi categorized many magical-but-not-weapon-or-armor items under coarse `"Wondrous items"`, masking signal that Open5e exposes directly. So if anything, more items will resolve to specific icons under Open5e — without a single line of `iconRules.ts` changing. The future improvement (issue #32) is about going further by using the structured fields directly.

### 8. Tests + MSW

**Factories (`src/api/factories.ts` + `factories.test.ts`).** The current file exports `magicItemIndexEntryFactory`, `magicItemIndexFactory`, `magicItemDetail2014Factory`, `magicItemDetail2024Factory` — all built on dnd5eapi shape. After this branch:

- The two ruleset-specific detail factories collapse to one `magicItemDetailFactory` matching Open5e's `MagicItemDetail` (the narrow type defined in §2).
- `magicItemIndexEntryFactory` shifts to `{ key, name }` — drops `url`.
- `magicItemIndexFactory` keeps the same `{ count, results }` shape (matches Open5e's response wrapper); the transient `size` parameter stays.
- Factory tests (`factories.test.ts`) drop assertions on dnd5eapi-only fields (`equipment_category.url`, `image`, `variants`, `variant`, the 2014 `desc[]` shape).

**Mapper unit tests (`src/api/mappers/magicItems.test.ts`).** The file exists today; rewrite the cases to cover the new mapper:

- Plain item, no attunement → `headerTags = [category, rarity]`, no attunement tag.
- `requires_attunement: true`, `attunement_detail: null` → adds `"requires attunement"`.
- `requires_attunement: true` + `attunement_detail: "by a dwarf or paladin"` → adds `"requires attunement by a dwarf or paladin"` (new affordance).
- `apiRef.system === "open5e"`, `apiRef.slug === detail.key`, `apiRef.ruleset` matches the input.
- Body equals `detail.desc` verbatim — no header-line stripping.

**Endpoint tests (`src/api/endpoints/magicItems.test.ts`).** Adjust to assert the new URL (`/v2/magicitems/?document=srd-2024&limit=2000`) and that `fetchMagicItemIndex` throws when `count > results.length`.

**MSW handlers (`src/test/msw.ts`).**

- Replace `magicItemIndexHandler` and `magicItemDetailHandler` to point at `https://api.open5e.com/v2/magicitems/...` and serve Open5e shape.
- **Delete `equipmentIndexHandler` and `equipmentDetailHandler`** — no equipment endpoint exists post-migration.
- The Supabase handlers are unchanged.

**Hook tests (`src/api/hooks.test.tsx`).** Drop tests for `useEquipmentIndex`. Update tests for `useMagicItemIndex`/`useMagicItemDetail` to use the new MSW handlers.

**`BrowseApiModal.test.tsx`.** Drop tests covering the enrichment flow (the second-step UI, the title transition, the focus-restore, the `EnrichmentStep` interactions). Update the remaining tests to use `entry.key` and the new MSW fixtures. The single-step contract (renders rows, search filters, click triggers detail+save+navigate) is what's left.

**`Card.test.tsx` and any other tests.** Any string-equality assertion using ` · ` updates to ` | `.

**Files whose tests are deleted entirely:** `src/api/endpoints/equipment.test.ts`, `src/api/mappers/baseHint.test.ts` (and any `equipment.test.ts` mapper file or `EnrichmentStep.test.tsx` if present).

## Risks & open questions

**Open5e index size.** 757 items in 2024 vs ~234 today. The existing client-side filter handles it (the modal already loads everything and filters in-memory). If list rendering becomes laggy on slow devices we can add virtualization later — out of scope here.

**Provider reliability.** Both APIs are community-run. We already code defensively (10s timeout, network-error handling, Retry button in the modal). No new failure modes.

**Open5e response time.** Anecdotally similar to dnd5eapi during spec investigation. Daily caching keeps cold-fetch impact bounded.

**Slug stability.** Open5e keys (e.g., `srd-2024_adamantine-armor-breastplate`) are document-prefixed and appear stable across the v2 API surface. We store the key verbatim in `apiRef.slug`; if Open5e ever rekeys, re-imports recover.

## Out of scope (recap)

- Spell import — next branch.
- Improving icon resolution with Open5e's structured fields — [issue #32](https://github.com/ChristopherChudzicki/dnd-cards/issues/32).
- Migrating existing dev cards.
