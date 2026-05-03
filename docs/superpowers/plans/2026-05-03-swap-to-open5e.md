# Swap dnd5eapi → Open5e Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the magic-item import flow off dnd5eapi onto Open5e v2, deleting the entire enrichment subsystem (regex template detection, second-step "pick base equipment" wizard, equipment endpoint, body-prefix stripping, equipment-tag injection) that exists only because dnd5eapi returns "any X" template entries. Open5e returns concrete variants, so all of it becomes dead code.

**Architecture:** Phase 1 strips the enrichment subsystem while staying on dnd5eapi (suite stays green at every commit). Phase 2 swaps the API layer atomically (one coordinated commit; the type cascade through endpoints → factories → mapper → MSW → consumers can't be split without leaving the suite broken in between). Phase 3 changes the tag separator across five sites. Phase 4 is manual smoke verification.

**Tech Stack:** React 18, TypeScript, Vitest + React Testing Library, MSW, Fishery + faker. Spec lives at `docs/superpowers/specs/2026-05-03-swap-to-open5e-design.md`.

---

## File map

**Files deleted entirely (Phase 1, Task 3):**
- `src/views/EnrichmentStep.tsx`
- `src/views/EnrichmentStep.module.css`
- `src/views/EnrichmentStep.test.tsx`
- `src/api/endpoints/equipment.ts`
- `src/api/endpoints/equipment.test.ts`
- `src/api/mappers/equipment.ts`
- `src/api/mappers/equipment.test.ts` (if it exists — check before deleting)
- `src/api/mappers/baseHint.ts`
- `src/api/mappers/baseHint.test.ts`

**Files heavily modified:**
- `src/views/BrowseApiModal.tsx` — drops the second-step state machine
- `src/views/BrowseApiModal.test.tsx` — drops 5 enrichment-flow tests
- `src/api/mappers/magicItems.ts` — collapses from ~127 lines to ~30 lines
- `src/api/mappers/magicItems.test.ts` — drops `composeName` and `enrichment` describe blocks
- `src/api/endpoints/magicItems.ts` — rewritten for Open5e shape
- `src/api/endpoints/magicItems.test.ts` — new URLs and shape
- `src/api/factories.ts` — rewritten for Open5e shape
- `src/api/factories.test.ts` — updated assertions
- `src/test/msw.ts` — drops equipment handlers; magic-items handlers shift to Open5e

**Files lightly modified:**
- `src/api/apiClient.ts` — `BASE_URL` only
- `src/api/apiClient.test.ts` — assertion URL only
- `src/api/hooks.ts` — drops `useEquipmentIndex` only
- `src/decks/schema.ts` — `apiRef.system` literal only
- `src/decks/schema.test.ts` — three `"dnd5eapi"` references only
- `src/views/EditorView.tsx` — drops template predicate + notice + separator update
- `src/views/EditorView.module.css` — drops `.templateNotice` rule
- `src/views/EditorView.test.tsx` — drops 2 template-notice tests + separator update
- `src/views/DeckView.tsx` — separator update only
- `src/cards/Card.module.css` — separator update in two pseudos

---

## Phase 1: Tear down the enrichment subsystem

The enrichment flow is a self-contained subsystem: BrowseApiModal's second step is the only consumer of `EnrichmentStep`, which is the only consumer of the `equipment` endpoint and `baseHint` parser. Removing them in dependency order leaves the suite green at every commit, while we're still talking to dnd5eapi.

### Task 1: Strip enrichment branch from BrowseApiModal

**Files:**
- Modify: `src/views/BrowseApiModal.tsx`
- Modify: `src/views/BrowseApiModal.test.tsx`

- [ ] **Step 1: Delete enrichment-flow tests in `BrowseApiModal.test.tsx`**

Remove these five tests entirely (they cover behavior we're deleting):
- `"specific weapon advances to enrichment"` (lines 156–181)
- `"'any X' template advances to enrichment with no auto-select"` (lines 183–209)
- `"Skip from enrichment saves the card without enrichment"` (lines 211–240)
- `"Back from enrichment returns to picker"` (lines 242–263)
- `"Back from enrichment returns focus to the previously picked row"` (lines 265–285)

Also remove `equipmentIndexHandler` from the import line (top of file) — it's no longer referenced.

- [ ] **Step 2: Run remaining tests; expect them to pass**

```bash
npm test -- BrowseApiModal
```
Expected: 7 tests pass (the original 12 minus the 5 we deleted).

- [ ] **Step 3: Rewrite `BrowseApiModal.tsx` as a single-step modal**

Replace the entire file contents with:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import { fetchMagicItemDetail, type Ruleset } from "../api/endpoints/magicItems";
import { useMagicItemIndex } from "../api/hooks";
import { magicItemDetailToCard } from "../api/mappers/magicItems";
import { DAY_MS } from "../api/timing";
import { useSaveCard } from "../decks/mutations";
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { LoadingState } from "../lib/ui/LoadingState";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import styles from "./BrowseApiModal.module.css";

type Props = {
  deckId: string;
  onClose: () => void;
  onSelected: (cardId: string) => void;
};

export function BrowseApiModal({ deckId, onClose, onSelected }: Props) {
  const [ruleset, setRuleset] = useState<Ruleset>("2024");
  const [query, setQuery] = useState("");
  const [pickingSlug, setPickingSlug] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const index = useMagicItemIndex(ruleset);
  const queryClient = useQueryClient();
  const saveCard = useSaveCard();

  const filtered = useMemo(() => {
    const all = index.data?.results ?? [];
    if (query.trim() === "") return all;
    const q = query.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [index.data, query]);

  const handlePick = async (slug: string) => {
    if (pickingSlug !== null) return;
    setPickingSlug(slug);
    setPickError(null);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ["magic-items", ruleset, "detail", slug],
        queryFn: () => fetchMagicItemDetail(ruleset, slug),
        staleTime: DAY_MS,
      });
      const card = magicItemDetailToCard(detail);
      await saveCard.mutateAsync({ card, deckId, isNew: true });
      onSelected(card.id);
    } catch (err) {
      setPickError(
        err instanceof Error ? err.message : "Couldn't add this card. Please try again.",
      );
    } finally {
      setPickingSlug(null);
    }
  };

  return (
    <DialogShell
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label="Browse magic items"
      size="md"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <>
          <DialogHeader title="Browse magic items" onClose={onClose}>
            <ToggleButtonGroup
              aria-label="Magic items ruleset"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[ruleset]}
              onSelectionChange={(keys) => {
                const next = Array.from(keys)[0];
                if (next === "2014" || next === "2024") setRuleset(next);
              }}
            >
              <ToggleButton id="2014">2014</ToggleButton>
              <ToggleButton id="2024">2024</ToggleButton>
            </ToggleButtonGroup>
          </DialogHeader>

          <div className={styles.searchRow}>
            <TextField aria-label="Search magic items" className={styles.searchField}>
              <Input
                type="search"
                placeholder="Search magic items…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </TextField>
          </div>

          <div className={styles.results}>
            {index.isLoading && <LoadingState />}
            {index.isError && (
              <div className={styles.state} role="alert">
                Couldn't load the magic-items list.
                <div className={styles.errorActions}>
                  <Button variant="secondary" size="sm" onPress={() => index.refetch()}>
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {index.isSuccess && filtered.length === 0 && (
              <div className={styles.state}>No items match your search.</div>
            )}
            {pickError && (
              <div className={styles.state} role="alert">
                {pickError}
              </div>
            )}
            {index.isSuccess &&
              filtered.map((entry) => (
                <button
                  key={entry.index}
                  type="button"
                  className={styles.row}
                  onClick={() => handlePick(entry.index)}
                  disabled={pickingSlug !== null}
                >
                  <span className={styles.rowName}>{entry.name}</span>
                  {pickingSlug === entry.index && (
                    <span className={styles.rowMeta}>Loading…</span>
                  )}
                </button>
              ))}
          </div>
        </>
      )}
    </DialogShell>
  );
}
```

Note that this still uses `entry.index` (dnd5eapi shape) — the rename to `entry.key` happens in Phase 2 alongside the API swap.

- [ ] **Step 4: Run tests; expect pass**

```bash
npm test -- BrowseApiModal
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/views/BrowseApiModal.tsx src/views/BrowseApiModal.test.tsx
git commit -m "$(cat <<'EOF'
refactor: collapse BrowseApiModal to a single-step picker

The enrichment second step was needed only because dnd5eapi returns
"any X" template entries that need a base equipment pick. Open5e returns
concrete variants, so the second step becomes dead code. Removing it
here in advance of the API swap; the second step's enabling code paths
(EnrichmentStep, equipment endpoint, baseHint parser) get deleted in a
follow-up commit once nothing imports them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Strip enrichment parameter from `magicItemDetailToCard`

**Files:**
- Modify: `src/api/mappers/magicItems.ts`
- Modify: `src/api/mappers/magicItems.test.ts`

- [ ] **Step 1: Delete enrichment + composeName tests**

In `src/api/mappers/magicItems.test.ts`, delete these two top-level `describe` blocks entirely:
- `describe("magicItemDetailToCard — enrichment", ...)` (lines 106–155)
- `describe("magicItemDetailToCard — composeName", ...)` (lines 157–226)

Also remove the now-unused imports at the top:
- `EquipmentDetail` from `../endpoints/equipment`
- `MagicItemDetail2014`, `MagicItemDetail2024` from `../endpoints/magicItems` (only the types used inside the deleted blocks; if the same names are still used elsewhere in the file, keep them)

- [ ] **Step 2: Rewrite the mapper to drop enrichment, preserving the existing non-enrichment behavior**

The current `composeHeaderTags(category, attunement, enrichment)` puts `[category, ...maybeInsert, ...maybeAttunement]` into header tags, and `composeFooterTags(rarity, enrichment)` puts `[rarity, ...maybeInsert]` into footer tags. After dropping enrichment, that becomes: header = `[category, "requires attunement"?]`, footer = `[rarity]`.

Replace the entire `src/api/mappers/magicItems.ts` with:

```ts
import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MagicItemDetail } from "../endpoints/magicItems";

const IMAGE_BASE = "https://www.dnd5eapi.co";

const detectAttunement2014 = (firstLine: string | undefined): boolean =>
  firstLine !== undefined && /requires attunement/i.test(firstLine);

// dnd5eapi 2024 magic-item desc is a single string whose first line is
// a metadata header like "Weapon (Any Melee Weapon)" followed by two
// trailing spaces (Markdown hard-break) and a newline, then the body.
const TYPE_PREFIX_2024 = /^(Weapon|Armor|Wondrous Item|Wand|Rod|Staff|Ring|Potion|Scroll)\b/i;

const stripBodyPrefix2024 = (desc: string): string => {
  const idx = desc.indexOf("\n");
  if (idx < 0) return desc;
  const head = desc.slice(0, idx).trim();
  if (!TYPE_PREFIX_2024.test(head)) return desc;
  return desc.slice(idx + 1).trim();
};

const stripBodyPrefix2014 = (desc: string[]): string => desc.slice(1).join("\n\n");

export const magicItemDetailToCard = (detail: MagicItemDetail): ItemCard => {
  const now = nowIso();
  const common = {
    id: newId(),
    kind: "item" as const,
    source: "api" as const,
    apiRef: {
      system: "dnd5eapi" as const,
      slug: detail.index,
      ruleset: detail.ruleset,
    },
    imageUrl: detail.image ? `${IMAGE_BASE}${detail.image}` : undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (detail.ruleset === "2024") {
    const headerTags: string[] = [detail.equipment_category.name];
    if (detail.attunement) headerTags.push("requires attunement");
    return {
      ...common,
      name: detail.name,
      headerTags,
      body: stripBodyPrefix2024(detail.desc),
      footerTags: [detail.rarity.name.toLowerCase()],
    };
  }

  const headerTags: string[] = [detail.equipment_category.name];
  if (detectAttunement2014(detail.desc[0])) headerTags.push("requires attunement");
  return {
    ...common,
    name: detail.name,
    headerTags,
    body: stripBodyPrefix2014(detail.desc),
    footerTags: [detail.rarity.name.toLowerCase()],
  };
};
```

`composeName`, `composeHeaderTags`, `composeFooterTags`, and the `enrichment` parameter are gone. The `stripBodyPrefix*` and `detectAttunement2014` helpers stay because they handle real dnd5eapi quirks — they get deleted in Phase 2 when we move off dnd5eapi.

- [ ] **Step 3: Run mapper tests; expect pass**

```bash
npm test -- mappers/magicItems
```
Expected: All tests in the two remaining `describe` blocks (`— 2024` and `— 2014`) pass.

- [ ] **Step 4: Run full suite to catch any incidental consumer breakage**

```bash
npm test
```
Expected: All pass. (BrowseApiModal already calls `magicItemDetailToCard(detail)` with no second argument from Task 1.)

- [ ] **Step 5: Commit**

```bash
git add src/api/mappers/magicItems.ts src/api/mappers/magicItems.test.ts
git commit -m "$(cat <<'EOF'
refactor: drop enrichment parameter from magicItemDetailToCard

Removes the enrichment-related code paths (composeName, equipment-tag
injection, baseHint parsing) from the mapper. The dnd5eapi-specific
quirks (body-prefix stripping, 2014 attunement-from-prose detection)
stay for now — they get deleted with the API swap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Delete now-orphaned files

After Task 2, nothing imports `EnrichmentStep`, `equipment` endpoint/mapper, `baseHint` parser, or `useEquipmentIndex`. Time to delete.

**Files:**
- Delete: `src/views/EnrichmentStep.tsx`
- Delete: `src/views/EnrichmentStep.module.css`
- Delete: `src/views/EnrichmentStep.test.tsx`
- Delete: `src/api/endpoints/equipment.ts`
- Delete: `src/api/endpoints/equipment.test.ts`
- Delete: `src/api/mappers/equipment.ts`
- Delete: `src/api/mappers/equipment.test.ts` (only if it exists)
- Delete: `src/api/mappers/baseHint.ts`
- Delete: `src/api/mappers/baseHint.test.ts`
- Modify: `src/api/hooks.ts` (drop `useEquipmentIndex`)
- Modify: `src/test/msw.ts` (drop equipment handlers)

- [ ] **Step 1: Delete the enrichment view files**

```bash
rm src/views/EnrichmentStep.tsx src/views/EnrichmentStep.module.css src/views/EnrichmentStep.test.tsx
```

- [ ] **Step 2: Delete equipment endpoint + mapper + baseHint**

```bash
rm src/api/endpoints/equipment.ts src/api/endpoints/equipment.test.ts
rm src/api/mappers/baseHint.ts src/api/mappers/baseHint.test.ts
rm src/api/mappers/equipment.ts
# Only remove this if it exists — likely doesn't:
[ -f src/api/mappers/equipment.test.ts ] && rm src/api/mappers/equipment.test.ts
```

- [ ] **Step 3: Drop `useEquipmentIndex` from `src/api/hooks.ts`**

Replace the file contents with:

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchMagicItemDetail, fetchMagicItemIndex, type Ruleset } from "./endpoints/magicItems";

const DAY_MS = 24 * 60 * 60 * 1000;

export const useMagicItemIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["magic-items", ruleset, "index"],
    queryFn: () => fetchMagicItemIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

export const useMagicItemDetail = (ruleset: Ruleset, slug: string | null) =>
  useQuery({
    enabled: slug !== null,
    queryKey: ["magic-items", ruleset, "detail", slug],
    queryFn: () => fetchMagicItemDetail(ruleset, slug as string),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });
```

(Drops the `fetchEquipmentIndex` import and the `useEquipmentIndex` hook.)

- [ ] **Step 4: Drop equipment handlers from `src/test/msw.ts`**

Remove these two exported handler factories (lines 72–78 in the current file):

```ts
export const equipmentIndexHandler = ...
export const equipmentDetailHandler = ...
```

Also remove their type imports from the top of the file:

```ts
import type { EquipmentDetail, EquipmentIndex } from "../api/endpoints/equipment";
```

- [ ] **Step 5: Run typecheck + full suite**

```bash
npm run build
npm test
```
Expected: build succeeds (no dangling imports), all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete orphaned enrichment subsystem

After the previous two commits, EnrichmentStep, the equipment endpoint
and mapper, the baseHint parser, useEquipmentIndex, and the equipment
MSW handlers have no remaining consumers. Delete them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Swap the API to Open5e

The type cascade — `endpoints/magicItems.ts` defines types; `factories.ts`, `mappers/magicItems.ts`, `BrowseApiModal.tsx`, `msw.ts`, and several test files consume them — can't be split into commits where the suite passes in between. Phase 2 is one coordinated commit. The subbullets are sequencing within that commit, not separate commits.

### Task 4: API layer swap (single commit)

**Files (all modified together):**
- `src/api/apiClient.ts`
- `src/api/apiClient.test.ts`
- `src/api/endpoints/magicItems.ts`
- `src/api/endpoints/magicItems.test.ts`
- `src/api/mappers/magicItems.ts`
- `src/api/mappers/magicItems.test.ts`
- `src/api/factories.ts`
- `src/api/factories.test.ts`
- `src/api/hooks.test.tsx`
- `src/test/msw.ts`
- `src/views/BrowseApiModal.tsx`
- `src/views/BrowseApiModal.test.tsx`
- `src/decks/schema.ts`
- `src/decks/schema.test.ts`

- [ ] **Step 1: Repoint `src/api/apiClient.ts`**

```ts
const BASE_URL = "https://api.open5e.com";
const TIMEOUT_MS = 10_000;
// ...rest of file unchanged
```

- [ ] **Step 2: Update `src/api/apiClient.test.ts`**

In the `"calls the dnd5eapi base URL"` test (line 12), rename it and update the asserted URL:

```ts
test("calls the Open5e base URL", async () => {
  // ... rest of setup unchanged
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.open5e.com/v2/magicitems/test",
    expect.anything(),
  );
});
```

(Update the path used for the test fetch to match — likely `apiGet("/v2/magicitems/test")`.)

- [ ] **Step 3: Rewrite `src/api/endpoints/magicItems.ts`**

Replace the file with:

```ts
import { apiGet } from "../apiClient";

export type Ruleset = "2014" | "2024";

const documentKey = (ruleset: Ruleset): string => (ruleset === "2024" ? "srd-2024" : "srd-2014");

export type MagicItemIndexEntry = {
  key: string;
  name: string;
};

export type MagicItemIndex = {
  count: number;
  results: MagicItemIndexEntry[];
};

export type MagicItemDetail = {
  key: string;
  name: string;
  desc: string;
  category: { name: string };
  rarity: { name: string };
  requires_attunement: boolean;
  attunement_detail: string | null;
  ruleset: Ruleset;
};

type Open5ePage<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type RawMagicItem = {
  key: string;
  name: string;
  desc: string;
  category: { name: string };
  rarity: { name: string };
  requires_attunement: boolean;
  attunement_detail: string | null;
};

const FETCH_LIMIT = 2000;

export const fetchMagicItemIndex = async (ruleset: Ruleset): Promise<MagicItemIndex> => {
  const path = `/v2/magicitems/?document=${documentKey(ruleset)}&limit=${FETCH_LIMIT}`;
  const page = await apiGet<Open5ePage<RawMagicItem>>(path);
  if (page.count > page.results.length) {
    throw new Error(
      `fetchMagicItemIndex: SRD ${ruleset} has ${page.count} magic items, exceeding the ${FETCH_LIMIT}-row limit. Pagination needs to be added.`,
    );
  }
  return {
    count: page.count,
    results: page.results.map(({ key, name }) => ({ key, name })),
  };
};

export const fetchMagicItemDetail = async (
  ruleset: Ruleset,
  key: string,
): Promise<MagicItemDetail> => {
  const raw = await apiGet<RawMagicItem>(`/v2/magicitems/${key}/`);
  return { ...raw, ruleset };
};
```

- [ ] **Step 4: Rewrite `src/api/endpoints/magicItems.test.ts`**

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchMagicItemDetail, fetchMagicItemIndex } from "./magicItems";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchMagicItemIndex", () => {
  test("hits Open5e magicitems with srd-2024 filter when ruleset is 2024", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchMagicItemIndex("2024");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.open5e.com/v2/magicitems/?document=srd-2024&limit=2000",
      expect.anything(),
    );
  });

  test("hits Open5e magicitems with srd-2014 filter when ruleset is 2014", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchMagicItemIndex("2014");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.open5e.com/v2/magicitems/?document=srd-2014&limit=2000",
      expect.anything(),
    );
  });

  test("throws when the SRD has more items than the fetch limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 3000, next: "x", previous: null, results: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchMagicItemIndex("2024")).rejects.toThrow(/exceeding the 2000-row limit/);
  });

  test("returns only key+name from each result", async () => {
    const raw = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          key: "srd-2024_bag-of-holding",
          name: "Bag of Holding",
          desc: "...",
          category: { name: "Wondrous Item" },
          rarity: { name: "Uncommon" },
          requires_attunement: false,
          attunement_detail: null,
        },
      ],
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(raw), { status: 200 })) as typeof fetch;

    const result = await fetchMagicItemIndex("2024");

    expect(result.results).toEqual([{ key: "srd-2024_bag-of-holding", name: "Bag of Holding" }]);
  });
});

describe("fetchMagicItemDetail", () => {
  test("hits the right path and tags response with ruleset", async () => {
    const raw = {
      key: "srd-2024_bag-of-holding",
      name: "Bag of Holding",
      desc: "A big bag.",
      category: { name: "Wondrous Item" },
      rarity: { name: "Uncommon" },
      requires_attunement: false,
      attunement_detail: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(raw), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchMagicItemDetail("2024", "srd-2024_bag-of-holding");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.open5e.com/v2/magicitems/srd-2024_bag-of-holding/",
      expect.anything(),
    );
    expect(result.ruleset).toBe("2024");
    expect(result.name).toBe("Bag of Holding");
  });
});
```

- [ ] **Step 5: Rewrite `src/api/factories.ts`**

```ts
import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type {
  MagicItemDetail,
  MagicItemIndex,
  MagicItemIndexEntry,
} from "./endpoints/magicItems";

const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const categories = ["Wondrous Item", "Ring", "Rod", "Weapon", "Armor", "Potion", "Scroll", "Wand"];

const open5eKey = (slug: string): string => `srd-2024_${slug}`;

export const magicItemIndexEntryFactory = Factory.define<MagicItemIndexEntry>(() => {
  const slug = faker.helpers
    .slugify(`${faker.commerce.productName()}-${faker.string.alphanumeric(5)}`)
    .toLowerCase();
  return {
    key: open5eKey(slug),
    name: faker.commerce.productName(),
  };
});

type MagicItemIndexTransient = { size: number };

export const magicItemIndexFactory = Factory.define<MagicItemIndex, MagicItemIndexTransient>(
  ({ transientParams }) => {
    const size = transientParams.size ?? 3;
    const results = magicItemIndexEntryFactory.buildList(size);
    return { count: results.length, results };
  },
);

export const magicItemDetailFactory = Factory.define<MagicItemDetail>(() => {
  const slug = faker.helpers
    .slugify(`${faker.commerce.productName()}-${faker.string.alphanumeric(5)}`)
    .toLowerCase();
  return {
    key: open5eKey(slug),
    name: faker.commerce.productName(),
    desc: faker.lorem.paragraph(),
    category: { name: faker.helpers.arrayElement(categories) },
    rarity: { name: faker.helpers.arrayElement(rarities) },
    requires_attunement: false,
    attunement_detail: null,
    ruleset: "2024",
  };
});
```

(Both ruleset-specific detail factories collapse into one. The `ruleset` field defaults to `"2024"` but tests override when needed.)

- [ ] **Step 6: Rewrite `src/api/factories.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import {
  magicItemDetailFactory,
  magicItemIndexEntryFactory,
  magicItemIndexFactory,
} from "./factories";

describe("magicItemIndexEntryFactory", () => {
  test("produces unique keys across builds", () => {
    const a = magicItemIndexEntryFactory.build();
    const b = magicItemIndexEntryFactory.build();
    expect(a.key).not.toBe(b.key);
  });
});

describe("magicItemIndexFactory", () => {
  test("count equals results length", () => {
    const idx = magicItemIndexFactory.build({}, { transient: { size: 5 } });
    expect(idx.results).toHaveLength(5);
    expect(idx.count).toBe(5);
  });
});

describe("magicItemDetailFactory", () => {
  test("defaults ruleset to '2024' and exposes a string desc", () => {
    const d = magicItemDetailFactory.build();
    expect(d.ruleset).toBe("2024");
    expect(typeof d.desc).toBe("string");
  });

  test("ruleset can be overridden", () => {
    const d = magicItemDetailFactory.build({ ruleset: "2014" });
    expect(d.ruleset).toBe("2014");
  });
});
```

- [ ] **Step 7: Rewrite `src/api/mappers/magicItems.ts`**

Replace the file with the simplified, single-shape mapper:

```ts
import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MagicItemDetail } from "../endpoints/magicItems";

export const magicItemDetailToCard = (detail: MagicItemDetail): ItemCard => {
  const now = nowIso();
  const headerTags: string[] = [detail.category.name];
  if (detail.requires_attunement) {
    headerTags.push(
      detail.attunement_detail
        ? `requires attunement ${detail.attunement_detail}`
        : "requires attunement",
    );
  }
  return {
    id: newId(),
    kind: "item",
    name: detail.name,
    headerTags,
    body: detail.desc,
    footerTags: [detail.rarity.name.toLowerCase()],
    source: "api",
    apiRef: { system: "open5e", slug: detail.key, ruleset: detail.ruleset },
    createdAt: now,
    updatedAt: now,
  };
};
```

Note the move: previously rarity was the only footer tag; this stays the same. Attunement (with optional detail) is in the header.

- [ ] **Step 8: Rewrite `src/api/mappers/magicItems.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { itemCardSchema } from "../../decks/schema";
import { magicItemDetailFactory } from "../factories";
import { magicItemDetailToCard } from "./magicItems";

describe("magicItemDetailToCard", () => {
  test("output is a valid ItemCard", () => {
    const detail = magicItemDetailFactory.build();
    const card = magicItemDetailToCard(detail);
    expect(itemCardSchema.safeParse(card).success).toBe(true);
  });

  test("category goes to headerTags, rarity (lowercased) goes to footerTags", () => {
    const detail = magicItemDetailFactory.build({
      category: { name: "Ring" },
      rarity: { name: "Uncommon" },
      requires_attunement: false,
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Ring"]);
    expect(card.footerTags).toEqual(["uncommon"]);
  });

  test("adds 'requires attunement' to headerTags when requires_attunement is true and detail is null", () => {
    const detail = magicItemDetailFactory.build({
      category: { name: "Ring" },
      requires_attunement: true,
      attunement_detail: null,
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Ring", "requires attunement"]);
  });

  test("appends attunement_detail when present", () => {
    const detail = magicItemDetailFactory.build({
      category: { name: "Weapon" },
      requires_attunement: true,
      attunement_detail: "by a dwarf or paladin",
    });
    const card = magicItemDetailToCard(detail);
    expect(card.headerTags).toEqual(["Weapon", "requires attunement by a dwarf or paladin"]);
  });

  test("body equals detail.desc verbatim — no header-line stripping", () => {
    const detail = magicItemDetailFactory.build({
      desc: "This suit of armor is reinforced with adamantine.",
    });
    const card = magicItemDetailToCard(detail);
    expect(card.body).toBe("This suit of armor is reinforced with adamantine.");
  });

  test("apiRef carries open5e system, the detail key as slug, and the ruleset", () => {
    const detail = magicItemDetailFactory.build({
      key: "srd-2024_bag-of-holding",
      ruleset: "2024",
    });
    const card = magicItemDetailToCard(detail);
    expect(card.apiRef).toEqual({
      system: "open5e",
      slug: "srd-2024_bag-of-holding",
      ruleset: "2024",
    });
  });

  test("source is 'api' and imageUrl is undefined (Open5e magicitems has no image field)", () => {
    const detail = magicItemDetailFactory.build();
    const card = magicItemDetailToCard(detail);
    expect(card.source).toBe("api");
    expect(card.imageUrl).toBeUndefined();
  });
});
```

- [ ] **Step 9: Rewrite the magic-items handlers in `src/test/msw.ts`**

Replace the two handler factories with Open5e routes:

```ts
import type { MagicItemDetail, MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";

const documentKey = (ruleset: Ruleset): string => (ruleset === "2024" ? "srd-2024" : "srd-2014");

export const magicItemIndexHandler = (ruleset: Ruleset, body: MagicItemIndex) =>
  http.get(`https://api.open5e.com/v2/magicitems/`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("document") !== documentKey(ruleset)) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({
      count: body.count,
      next: null,
      previous: null,
      results: body.results.map((r) => ({
        ...r,
        // Pad with the fields the endpoint code reads off raw responses,
        // even though it only returns key+name to consumers. Using the
        // index entry's name/key keeps fixtures concise.
        desc: "",
        category: { name: "" },
        rarity: { name: "" },
        requires_attunement: false,
        attunement_detail: null,
      })),
    });
  });

export const magicItemDetailHandler = (
  _ruleset: Ruleset,
  key: string,
  body: MagicItemDetail,
) => {
  const { ruleset: _r, ...rest } = body;
  return http.get(`https://api.open5e.com/v2/magicitems/${key}/`, () => HttpResponse.json(rest));
};

export const apiErrorHandler = (path: string, status: number) =>
  http.get(`https://api.open5e.com${path}`, () => new HttpResponse(null, { status }));
```

(Drop the `equipmentIndexHandler` / `equipmentDetailHandler` block — already deleted in Phase 1 Task 3 Step 4.)

The `magicItemIndexHandler` accepts the same `MagicItemIndex` shape as today (still `{ count, results: [{ key, name }] }`), pads each row with the fields the raw Open5e response carries, and gates on the `?document=` query parameter so 2014/2024 handlers can coexist.

- [ ] **Step 10: Update `src/api/hooks.test.tsx`**

Update the imports:

```ts
import { magicItemDetailFactory, magicItemIndexEntryFactory, magicItemIndexFactory } from "./factories";
```

Update the test that uses `magicItemDetail2024Factory`:

```ts
test("fetches when slug is supplied", async () => {
  const indexEntry = magicItemIndexEntryFactory.build();
  const detail = magicItemDetailFactory.build({
    key: indexEntry.key,
    name: indexEntry.name,
  });
  server.use(magicItemDetailHandler("2024", indexEntry.key, detail));

  const { result } = renderHook(() => useMagicItemDetail("2024", indexEntry.key), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.name).toBe(indexEntry.name);
});
```

(Note `entry.index` → `entry.key` everywhere.)

- [ ] **Step 11: Update `src/views/BrowseApiModal.tsx` for Open5e shape**

Three changes — all in the `filtered.map(...)` block near the bottom of the file:

```diff
-              key={entry.index}
+              key={entry.key}
```

```diff
-                  onClick={() => handlePick(entry.index)}
+                  onClick={() => handlePick(entry.key)}
```

```diff
-                  {pickingSlug === entry.index && (
+                  {pickingSlug === entry.key && (
```

- [ ] **Step 12: Update `src/views/BrowseApiModal.test.tsx`**

Update the imports at the top of the file:

```ts
import { magicItemDetailFactory, magicItemIndexEntryFactory } from "../api/factories";
```

(Drop `magicItemDetail2024Factory` from the import — it doesn't exist anymore.)

Two tests build a detail with `magicItemDetail2024Factory.build({ index: entry.index, name: entry.name, equipment_category: ... })`. Update each:

`"clicking a row POSTs the card to the persistence layer and calls onSelected"`:

```ts
const entry = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
const detail = magicItemDetailFactory.build({
  key: entry.key,
  name: entry.name,
  category: { name: "Wondrous Item" },
});
server.use(
  magicItemIndexHandler("2024", { count: 1, results: [entry] }),
  magicItemDetailHandler("2024", entry.key, detail),
);
```

`"clicking the same row only POSTs once even under StrictMode double-render"`:

```ts
const entry = magicItemIndexEntryFactory.build({ name: "Flame Tongue" });
const detail = magicItemDetailFactory.build({
  key: entry.key,
  name: entry.name,
  category: { name: "Wondrous Item" },
});
server.use(
  magicItemIndexHandler("2024", { count: 1, results: [entry] }),
  magicItemDetailHandler("2024", entry.key, detail),
);
```

(All `entry.index` references in the file must become `entry.key`. Field renames: `equipment_category` → `category`. The `desc: "Weapon (Longsword)  \n A glowing sword."` overrides used by the now-deleted enrichment tests are gone — the remaining tests don't override `desc`.)

The `"error state shows retry button"` test calls `apiErrorHandler` with a path. Update it:

```ts
server.use(apiErrorHandler("/v2/magicitems/?document=srd-2024&limit=2000", 500));
```

(was `/api/2024/magic-items`).

- [ ] **Step 13: Update `src/decks/schema.ts`**

```diff
 const apiRefSchema = z.object({
-  system: z.literal("dnd5eapi"),
+  system: z.literal("open5e"),
   slug: z.string(),
   ruleset: z.enum(["2014", "2024"]),
 });
```

- [ ] **Step 14: Update `src/decks/schema.test.ts`**

Replace all three occurrences of `system: "dnd5eapi" as const` with `system: "open5e" as const` (lines 34, 50, 113).

- [ ] **Step 15: Run the full suite**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 16: Run typecheck**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 17: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: swap magic-item import from dnd5eapi to Open5e v2

- apiClient base URL → api.open5e.com
- endpoints/magicItems rewritten for Open5e shape
  - one MagicItemDetail type (no ruleset split)
  - fetchMagicItemIndex hits /v2/magicitems/?document=srd-{ruleset}&limit=2000
  - throws when count exceeds the fetch limit
- mapper collapses to ~25 lines: drops composeName, composeHeaderTags,
  composeFooterTags, stripBodyPrefix2014/2024, detectAttunement2014
- attunement_detail (e.g., "by a dwarf or paladin") now flows into the
  attunement tag — new affordance Open5e exposes
- factories collapse from two ruleset-specific to one shape
- MSW handlers, schema literal, BrowseApiModal entry.key rename, all
  affected tests updated together

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Tag separator change

Independent of the API swap. Five sites; mechanical search-and-replace with verification.

### Task 5: Replace ` · ` with ` | ` across the codebase

**Files:**
- Modify: `src/cards/Card.module.css`
- Modify: `src/views/DeckView.tsx`
- Modify: `src/views/EditorView.tsx`
- Modify: `src/views/EditorView.test.tsx`

- [ ] **Step 1: Update `src/cards/Card.module.css`**

Two occurrences (lines 82 and 129):

```diff
 .headerTag + .headerTag::before {
-  content: " · ";
+  content: " | ";
   white-space: pre;
 }
```

```diff
 .footerTag + .footerTag::before {
-  content: " · ";
+  content: " | ";
   white-space: pre;
 }
```

- [ ] **Step 2: Update `src/views/DeckView.tsx` (line 92)**

```diff
-                  <span className={styles.headerTags}>{card.headerTags.join(" · ")}</span>
+                  <span className={styles.headerTags}>{card.headerTags.join(" | ")}</span>
```

- [ ] **Step 3: Update `src/views/EditorView.tsx` (line 40)**

```diff
   return buckets
     .map((b) => `${b.count} card${b.count === 1 ? "" : "s"} (${b.perPage} per page)`)
-    .join(" · ");
+    .join(" | ");
```

- [ ] **Step 4: Update `src/views/EditorView.test.tsx` (line 180)**

```diff
-      await screen.findByText("3 cards (4 per page) · 2 cards (2 per page)"),
+      await screen.findByText("3 cards (4 per page) | 2 cards (2 per page)"),
```

- [ ] **Step 5: Verify with grep**

```bash
grep -rn ' · ' src --include='*.ts' --include='*.tsx' --include='*.css' --include='*.module.css'
```
Expected: no output (zero matches).

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
style: switch tag separator from middle-dot to vertical bar

Card header/footer tag CSS pseudo-elements, the deck-view header-tag
inline list, and the editor counts label all switch from ' · ' to ' | '.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Drop the editor template notice + final verification

### Task 6: Remove editor template notice

**Files:**
- Modify: `src/views/EditorView.tsx`
- Modify: `src/views/EditorView.module.css`
- Modify: `src/views/EditorView.test.tsx`

- [ ] **Step 1: Drop the `isTemplateItem` predicate and its render block in `EditorView.tsx`**

Delete the function:

```ts
const isTemplateItem = (card: ItemCard): boolean =>
  card.source === "api" && /\(any /i.test(card.body);
```

And the render block (lines 127–133):

```tsx
{isTemplateItem(draft) && (
  <div className={styles.templateNotice} data-testid="template-notice">
    <strong>Template item.</strong> The dnd5eapi entry is weapon-type-agnostic ...
  </div>
)}
```

- [ ] **Step 2: Drop the `.templateNotice` rule in `EditorView.module.css`**

Find and delete the rule:

```css
.templateNotice {
  /* ... */
}
```

(Plus any related rules like `.templateNotice strong`, if they exist.)

- [ ] **Step 3: Drop the two template-notice tests in `EditorView.test.tsx`**

Delete:
- The test starting at line 81: `"shows the template-item notice for API-sourced cards with a generic body"`
- The test at line 143: `"does NOT show the template notice for custom items"`

- [ ] **Step 4: Run tests**

```bash
npm test -- EditorView
```
Expected: all remaining EditorView tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: drop EditorView template-item notice

Open5e returns concrete variants (Adamantine Armor (Plate),
Adamantine Armor (Breastplate), etc.) so the prose-regex template
detection has nothing to match. The notice and its CSS rule become
dead UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 7: Final smoke verification

- [ ] **Step 1: Run the full test suite once more**

```bash
npm test
```
Expected: all green.

- [ ] **Step 2: Run a typecheck/build**

```bash
npm run build
```
Expected: build succeeds with zero errors.

- [ ] **Step 3: Manually exercise the import flow**

```bash
npm run dev
```

In the browser:
- Open a deck (create one if needed).
- Click "Browse Items".
- Toggle between 2024 and 2014; verify both populate (lists should be visibly different sizes; 2024 ≈ 757 entries, 2014 ≈ 499).
- Search for "Adamantine"; confirm you see *separate* entries for `Adamantine Armor (Breastplate)`, `(Chain Mail)`, `(Plate)`, etc. — the proof that pre-split variants work.
- Pick `Adamantine Armor (Plate)`. The card should save and open in the editor immediately, with no second-step modal.
- Verify the editor shows: name = "Adamantine Armor (Plate)", header tag = "Armor", footer tag = "uncommon", body containing "This suit of armor is reinforced with adamantine."
- Verify there's no "Template item" notice.
- Verify the icon resolves (likely `shield` icon via the existing rule on "Armor"; could also fall back).
- Search for and pick `Wand of Magic Missiles`. Verify icon resolves to `wizard-staff` and there's no second step.
- Pick something with attunement (`Belt of Giant Strength` or similar). Verify the header shows `requires attunement`.

- [ ] **Step 4: Run the dev server's print preview once**

Visit `/deck/<id>/print`. Verify cards render with the new ` | ` separator between header tags.

- [ ] **Step 5: No commit needed unless smoke testing surfaces a bug**

If a bug is found, fix it as a follow-up commit on this branch before merging.

---

## Summary

After all tasks complete:
- ~9 files deleted entirely (enrichment subsystem + tests)
- ~12 files modified
- Net code change: roughly +50 lines of new code, -400 lines of deletion
- Zero changes to: `Card.tsx` rendering, `ItemEditor.tsx`, `iconRules.ts`, routing, persistence layer
- API surface for `useMagicItemIndex`/`useMagicItemDetail`/`magicItemDetailToCard` preserved (signatures shift only in their shape; modal/editor consumers updated in step)
- Tag separator change applied across screen + print

The followup [issue #32](https://github.com/ChristopherChudzicki/dnd-cards/issues/32) tracks taking advantage of Open5e's structured `category.key`/`weapon.category`/`armor.category` fields for richer icon resolution — out of scope here.
