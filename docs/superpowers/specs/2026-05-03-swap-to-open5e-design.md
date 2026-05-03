# Swap dnd5eapi → Open5e for magic-item import

**Status:** spec
**Branch:** `swap-to-open5e`
**Owner:** chris

## Why

Spell import is the next planned feature, and dnd5eapi (the API we use today) has no 2024 SRD spell data and no merged work toward it. A community-tracked PR exists on a contributor fork but is stalled upstream; a realistic ETA is 1–3 months at the current cadence.

Open5e v2 covers both rulesets across both content types we care about — magic items and spells — under a single provider, and exposes meaningfully richer structured data per item.

This branch makes the provider swap **for magic items only**, scoped narrowly so spell import can layer on cleanly afterward.

A secondary motivation: dnd5eapi returns one "template" entry for items with multiple bases (e.g., a single _Adamantine Armor_ entry whose description reads "any medium or heavy armor that isn't hide"). Today we detect that prose pattern with a regex and surface a `<TemplateNotice>` telling the user to manually rename and rewrite the item. Open5e pre-splits every variant into its own concrete entry (`Adamantine Armor (Breastplate)`, `Adamantine Armor (Chain Mail)`, `Adamantine Armor (Plate)`, etc., each with the correct stats baked in). That whole code path goes away — the heuristic, the notice JSX, and the CSS rule.

## Coverage delta

| Provider          | 2014 items | 2024 items | 2014 spells | 2024 spells |
| ----------------- | ---------: | ---------: | ----------: | ----------: |
| dnd5eapi (today)  |        ~362 |       ~234 |         319 |       **0** |
| Open5e v2 (after) |        499 |        757 |         319 |         339 |

(2014 item count grows on Open5e because variants are split into separate entries; 2024 item count is genuinely larger because SRD 5.2 added content.)

## Scope

### In

- Repoint magic-item index + detail fetching from `dnd5eapi.co/api/{ruleset}/magic-items/...` to `api.open5e.com/v2/magicitems/?document=srd-{ruleset}`.
- Rewrite `mappers/magicItems.ts` to consume Open5e's shape; drop the 2014/2024 ruleset branching that exists only because dnd5eapi's two endpoints return differently-shaped payloads.
- Delete the template-item code path in full: `isTemplateItem` predicate, `templateNotice` JSX in `EditorView`, and the `.templateNotice` CSS rule.
- Change tag separator from middle-dot ` · ` to ` | ` — five sites total: two CSS pseudo-elements (`Card.module.css`), two `.join`s (`DeckView.tsx`, `EditorView.tsx`), and one test fixture string (`EditorView.test.tsx`).
- Update `apiRef.system` schema literal from `"dnd5eapi"` to `"open5e"`. No data migration — confirmed acceptable since the app has no users beyond the developer.
- Update tests, fixtures, and MSW handlers to match.

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

Single mapper, no ruleset branch:

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
- The `detectAttunement2014` helper (which regex-sniffed the first description paragraph because the dnd5eapi 2014 endpoint had no boolean field) is deleted — Open5e returns `requires_attunement` as a clean boolean for both rulesets.
- New affordance worth a test: `attunement_detail` (e.g., `"by a dwarf or paladin"`) is appended to the attunement tag when present. dnd5eapi didn't expose this.

Net deletion in this file: ~20 lines.

### 4. Hooks (`src/api/hooks.ts`)

Internals shift to import the new types; signatures and TanStack Query keys are unchanged. `useMagicItemIndex(ruleset)` and `useMagicItemDetail(ruleset, slug)` continue to use `["magic-items", ruleset, "index"]` and `["magic-items", ruleset, "detail", slug]` keys with a 24-hour `staleTime`/`gcTime`.

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

`src/views/BrowseApiModal.tsx`:

- Rename `entry.index` → `entry.key` everywhere (the React `key` prop, the lookup state, the call to `handlePick`). The `pickingSlug` state name stays — it just stores an Open5e key now.

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

Mapper unit tests (`src/api/mappers/magicItems.test.ts` — create if missing): cover the four shapes the mapper now handles.

- Plain item, no attunement → `headerTags = [category, rarity]`, no attunement tag.
- `requires_attunement: true`, `attunement_detail: null` → adds `"requires attunement"`.
- `requires_attunement: true` + non-null `attunement_detail` → adds `"requires attunement by a dwarf or paladin"`.
- `apiRef.system === "open5e"`, `apiRef.slug === detail.key`, `apiRef.ruleset` matches the input.

Endpoint tests adjust to assert the new URL (`/v2/magicitems/?document=srd-2024&limit=2000`) and that `fetchMagicItemIndex` throws when `count > results.length`.

MSW handlers swap dnd5eapi routes for Open5e routes; fixture JSON updates to the new shape. The request method, response type, and error model are unchanged, so handler structure is mechanical.

`BrowseApiModal.test.tsx`: fixture/handler updates only. The component contract (renders rows, search filters, click triggers detail+save+navigate) doesn't change.

`Card.test.tsx`: any string-equality assertion using ` · ` updates to ` | `.

## Risks & open questions

**Open5e index size.** 757 items in 2024 vs ~234 today. The existing client-side filter handles it (the modal already loads everything and filters in-memory). If list rendering becomes laggy on slow devices we can add virtualization later — out of scope here.

**Provider reliability.** Both APIs are community-run. We already code defensively (10s timeout, network-error handling, Retry button in the modal). No new failure modes.

**Open5e response time.** Anecdotally similar to dnd5eapi during spec investigation. Daily caching keeps cold-fetch impact bounded.

**Slug stability.** Open5e keys (e.g., `srd-2024_adamantine-armor-breastplate`) are document-prefixed and appear stable across the v2 API surface. We store the key verbatim in `apiRef.slug`; if Open5e ever rekeys, re-imports recover.

## Out of scope (recap)

- Spell import — next branch.
- Improving icon resolution with Open5e's structured fields — [issue #32](https://github.com/ChristopherChudzicki/dnd-cards/issues/32).
- Migrating existing dev cards.
