# SRD Browse Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-toggle header in `BrowseApiModal` with a left sidebar of content types + a single source dropdown, backed by a content-type registry so adding monsters/effects/feats later is purely additive.

**Architecture:** Introduce `src/api/content-types/` with a per-type module (`items.ts`, `spells.ts`) exporting a `ContentType` whose `useResults(source, query)` hook closes over the entry shape. The modal iterates `CONTENT_TYPES` to render `react-aria-components` `Tabs` (sidebar) + `MenuTrigger`/`Menu` (source dropdown). A wrapper inside the modal carries `container-type: inline-size`; below ~560px the sidebar collapses into a second `MenuTrigger` for type. No backend or schema changes — saved card payloads are byte-identical.

**Tech Stack:** React 18, TypeScript, Vite, `react-aria-components`, TanStack Query (existing hooks), CSS Modules, Vitest + Testing Library + MSW.

**Spec:** `docs/superpowers/specs/2026-05-09-srd-browse-rework-design.md`

---

## File Structure

**New:**
- `src/api/content-types/types.ts` — `ContentType`, `ContentRow`, `ContentTypeResults` interfaces
- `src/api/content-types/items.ts` — items module (closes over `MagicItem`)
- `src/api/content-types/spells.ts` — spells module (closes over `Spell`)
- `src/api/content-types/index.ts` — exports `CONTENT_TYPES`
- `src/views/BrowseApiModal.menu.module.css` — *not creating; reuse the existing module*

**Modified:**
- `src/views/BrowseApiModal.tsx` — full rewrite: registry-driven, `Tabs` + `MenuTrigger`
- `src/views/BrowseApiModal.module.css` — add layout/sidebar/tabs/menu/container-query rules; relax footer copy
- `src/views/BrowseApiModal.test.tsx` — switch ARIA selectors to `tab` and `menuitem`; add new assertions

**Untouched (verify imports continue to compile):** `src/api/endpoints/*`, `src/api/mappers/*`, `src/api/hooks.ts`, `src/decks/mutations.ts`, `src/lib/ui/*`.

---

## Sequencing

Phase 1 — Registry foundation (Tasks 1–4): pure additions, no behavior change.
Phase 2 — Modal refactor (Tasks 5–6): tests then implementation; one commit each.
Phase 3 — Polish (Task 7): footer copy, final verification.

`npm test`, `npm run typecheck`, `npm run lint`, `npm run dev`, `npm run build` are pre-approved per project memory — run as needed without asking.

---

## Task 1: Create `content-types/types.ts`

**Files:**
- Create: `src/api/content-types/types.ts`

This task only declares interfaces — TypeScript validates correctness. No runtime test.

- [ ] **Step 1: Create the file.**

```ts
// src/api/content-types/types.ts
import type { Card } from "../../cards/types";
import type { Ruleset } from "../endpoints/magicItems";

export type ContentRow = {
  key: string;
  name: string;
  meta: string;
  toCard: () => Card;
};

export type ContentTypeResults = {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  rows: ReadonlyArray<ContentRow>;
};

export type ContentType = {
  id: string;
  label: string;
  searchPlaceholder: string;
  supportedSources: readonly Ruleset[];
  useResults: (source: Ruleset, query: string) => ContentTypeResults;
};
```

- [ ] **Step 2: Verify typecheck passes.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/api/content-types/types.ts
git commit -m "refactor(browse): add ContentType registry interfaces"
```

---

## Task 2: Create `content-types/items.ts`

**Files:**
- Create: `src/api/content-types/items.ts`

Extracts the items branch of `BrowseApiModal` (the `useMagicItemIndex` call, the substring filter, the rarity-as-meta formatter, and the `magicItemDetailToCard({ ...entry, ruleset })` call) into a self-contained `ContentType`.

- [ ] **Step 1: Create the file.**

```ts
// src/api/content-types/items.ts
import { useMemo } from "react";
import { useMagicItemIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import type { ContentType } from "./types";

const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export const itemsContentType: ContentType = {
  id: "items",
  label: "Items",
  searchPlaceholder: "Search items…",
  supportedSources: ["2014", "2024"] as const,
  useResults: (source, query) => {
    const idx = useMagicItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: capitalize(entry.rarity.name),
          toCard: () => magicItemDetailToCard({ ...entry, ruleset: source }),
        }));
    }, [idx.data, query, source]);
    return {
      isLoading: idx.isLoading,
      isError: idx.isError,
      refetch: idx.refetch,
      rows,
    };
  },
};
```

- [ ] **Step 2: Verify typecheck passes.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/api/content-types/items.ts
git commit -m "refactor(browse): extract items content-type module"
```

---

## Task 3: Create `content-types/spells.ts`

**Files:**
- Create: `src/api/content-types/spells.ts`

Mirror of Task 2 for spells. Extracts the spells branch — `useSpellIndex` + the level/school formatter + `spellDetailToCard`.

- [ ] **Step 1: Create the file.**

```ts
// src/api/content-types/spells.ts
import { useMemo } from "react";
import { useSpellIndex } from "../hooks";
import { spellDetailToCard } from "../mappers/spells";
import type { ContentType } from "./types";

const ordinal = (n: number): string => {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
};

const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const spellMeta = (level: number, schoolName: string): string => {
  const school = schoolName.toLowerCase();
  if (level === 0) return `${capitalize(school)} cantrip`;
  return `${ordinal(level)}-level ${school}`;
};

export const spellsContentType: ContentType = {
  id: "spells",
  label: "Spells",
  searchPlaceholder: "Search spells…",
  supportedSources: ["2014", "2024"] as const,
  useResults: (source, query) => {
    const idx = useSpellIndex(source);
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: spellMeta(entry.level, entry.school.name),
          toCard: () => spellDetailToCard({ ...entry, ruleset: source }),
        }));
    }, [idx.data, query, source]);
    return {
      isLoading: idx.isLoading,
      isError: idx.isError,
      refetch: idx.refetch,
      rows,
    };
  },
};
```

- [ ] **Step 2: Verify typecheck passes.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/api/content-types/spells.ts
git commit -m "refactor(browse): extract spells content-type module"
```

---

## Task 4: Create `content-types/index.ts`

**Files:**
- Create: `src/api/content-types/index.ts`

Aggregator. Order in the array determines sidebar order; today's modal lists Items first, Spells second — preserve that.

- [ ] **Step 1: Create the file.**

```ts
// src/api/content-types/index.ts
import { itemsContentType } from "./items";
import { spellsContentType } from "./spells";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly ContentType[] = [itemsContentType, spellsContentType];

export type { ContentType, ContentRow, ContentTypeResults } from "./types";
```

- [ ] **Step 2: Verify typecheck passes.**

Run: `npm run typecheck`
Expected: PASS. The new modules are now importable but nothing imports them yet, so no behavior change.

- [ ] **Step 3: Commit.**

```bash
git add src/api/content-types/index.ts
git commit -m "refactor(browse): add CONTENT_TYPES registry"
```

---

## Task 5: Rewrite the test file for the new ARIA shape

**Files:**
- Modify: `src/views/BrowseApiModal.test.tsx`

Today's tests select the kind toggle via `getByRole("radio", { name: "Spells" })` (RAC `ToggleButton` exposes `role="radio"` inside a single-select `ToggleButtonGroup`). After the rework the type selector is a vertical `Tabs`, so type selection becomes `getByRole("tab", { name: "Spells" })`. The source toggle becomes a `MenuTrigger` — selecting a source means clicking the trigger button, then a `menuitem`.

This task updates **all** existing assertions to the new selectors and adds the new ones the spec calls for. Tests will fail at the end of this task — Task 6 makes them pass.

- [ ] **Step 1: Replace `BrowseApiModal.test.tsx` with the rewritten version.**

```tsx
// src/views/BrowseApiModal.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";
import type { SpellIndex } from "../api/endpoints/spells";
import { magicItemIndexEntryFactory, spellIndexEntryFactory } from "../api/factories";
import { makeCardRow } from "../test/factories";
import { SB_URL, server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
import { BrowseApiModal } from "./BrowseApiModal";

const itemKey = (ruleset: Ruleset) => ["magic-items", ruleset, "index"];
const spellKey = (ruleset: Ruleset) => ["spells", ruleset, "index"];

type Seeds = {
  items?: Partial<Record<Ruleset, MagicItemIndex>>;
  spells?: Partial<Record<Ruleset, SpellIndex>>;
};

const makeClient = (seeds: Seeds = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [ruleset, body] of Object.entries(seeds.items ?? {}) as [Ruleset, MagicItemIndex][]) {
    client.setQueryData(itemKey(ruleset), body);
  }
  for (const [ruleset, body] of Object.entries(seeds.spells ?? {}) as [Ruleset, SpellIndex][]) {
    client.setQueryData(spellKey(ruleset), body);
  }
  return client;
};

const wrap = (ui: ReactNode, client: QueryClient) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

const openSourceMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^Source:/ }));
};

describe("<BrowseApiModal>", () => {
  test("renders the registered types as a vertical tablist in registry order", async () => {
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });
    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Items", "Spells"]);
  });

  test("shows index entries once the items list loads", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ items: { "2024": { count: 2, results: [entryA, entryB] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    expect(await screen.findByRole("button", { name: /Bag of Holding/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cloak of Protection/ })).toBeInTheDocument();
  });

  test("search filters the items list", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ items: { "2024": { count: 2, results: [entryA, entryB] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Bag of Holding/ });
    await userEvent.type(screen.getByRole("searchbox"), "bag");

    expect(screen.getByRole("button", { name: /Bag of Holding/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cloak of Protection/ })).not.toBeInTheDocument();
  });

  test("switching source loads a different items list", async () => {
    const v2024 = magicItemIndexEntryFactory.build({ name: "Ring A" });
    const v2014 = magicItemIndexEntryFactory.build({ name: "Ring Z" });
    const client = makeClient({
      items: {
        "2024": { count: 1, results: [v2024] },
        "2014": { count: 1, results: [v2014] },
      },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Ring A/ });
    await openSourceMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "2014" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Ring Z/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Ring A/ })).not.toBeInTheDocument();
  });

  test("switching to the Spells tab swaps the list source", async () => {
    const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const spell = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [item] } },
      spells: { "2024": { count: 1, results: [spell] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Bag of Holding/ });
    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Fireball/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /Bag of Holding/ })).not.toBeInTheDocument();
  });

  test("switching tabs clears the search query", async () => {
    const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const spell = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [item] } },
      spells: { "2024": { count: 1, results: [spell] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Bag of Holding/ });
    await userEvent.type(screen.getByRole("searchbox"), "bag");

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));

    const spellsSearch = await screen.findByRole("searchbox");
    expect(spellsSearch).toHaveValue("");
    expect(spellsSearch).toHaveAttribute("placeholder", "Search spells…");
  });

  test("clicking an item POSTs a card with kind:item", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(await screen.findByRole("button", { name: /Bag of Holding/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost.mock.calls[0]?.[0]?.payload?.kind).toBe("item");
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("clicking a spell POSTs a card with kind:spell", async () => {
    const entry = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({ spells: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));
    await userEvent.click(await screen.findByRole("button", { name: /Fireball/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost.mock.calls[0]?.[0]?.payload?.kind).toBe("spell");
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("clicking the same row only POSTs once even under StrictMode double-render", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Flame Tongue" });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );

    render(
      <QueryClientProvider client={client}>
        <BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: /Flame Tongue/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPost).toHaveBeenCalledTimes(1);
  });

  test("Escape calls onClose", async () => {
    const onClose = vi.fn();
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={onClose} onSelected={() => {}} />, client);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("shows rarity in each item row", async () => {
    const entry = magicItemIndexEntryFactory.build({
      name: "Bag of Holding",
      rarity: { name: "Uncommon" },
    });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    const row = await screen.findByRole("button", { name: /Bag of Holding/ });
    expect(row).toHaveTextContent("Uncommon");
  });

  test("shows level and school in each spell row", async () => {
    const cantrip = spellIndexEntryFactory.build({
      name: "Light",
      level: 0,
      school: { name: "evocation" },
    });
    const leveled = spellIndexEntryFactory.build({
      name: "Fireball",
      level: 3,
      school: { name: "evocation" },
    });
    const client = makeClient({
      spells: { "2024": { count: 2, results: [cantrip, leveled] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));
    const cantripRow = await screen.findByRole("button", { name: /Light/ });
    expect(cantripRow).toHaveTextContent("Evocation cantrip");
    const leveledRow = screen.getByRole("button", { name: /Fireball/ });
    expect(leveledRow).toHaveTextContent("3rd-level evocation");
  });

  test("renders the SRD notice with a link", async () => {
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });
    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);
    expect(await screen.findByRole("link", { name: "SRD" })).toHaveAttribute(
      "href",
      "https://www.dndbeyond.com/srd",
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail (we're red).**

Run: `npm test -- BrowseApiModal`
Expected: most tests fail (no `tab` role exists in the current modal, no `Source:` button). Some tests that don't depend on new ARIA may pass — that's fine.

- [ ] **Step 3: Do NOT commit yet — stop here and proceed to Task 6.**

The failing test file will be committed together with the implementation in Task 6 so we don't land a red commit on the branch.

---

## Task 6: Rewrite `BrowseApiModal.tsx` and CSS to use the registry

**Files:**
- Modify: `src/views/BrowseApiModal.tsx` (full rewrite)
- Modify: `src/views/BrowseApiModal.module.css` (add layout/sidebar/tabs/menu/container-query rules; relax footer copy)

This is the central change. The new `BrowseApiModal` owns `typeId`, `source`, `query`, `pickingKey`, `pickError`. A child `TypePanel` calls the active type's `useResults`. The source `MenuTrigger` lists exactly the active type's `supportedSources`. A wrapper `<div>` carries `container-type: inline-size` so the narrow-viewport CSS swap is local.

- [ ] **Step 1: Replace `BrowseApiModal.tsx` with the rewritten version.**

```tsx
// src/views/BrowseApiModal.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Button as RACButton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
} from "react-aria-components";
import type { Ruleset } from "../api/endpoints/magicItems";
import { CONTENT_TYPES, type ContentType } from "../api/content-types";
import type { Card } from "../cards/types";
import { useSaveCard } from "../decks/mutations";
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { Link } from "../lib/ui/Link";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./BrowseApiModal.module.css";

type Props = {
  deckId: string;
  onClose: () => void;
  onSelected: (cardId: string) => void;
};

export function BrowseApiModal({ deckId, onClose, onSelected }: Props) {
  const [typeId, setTypeId] = useState<string>(() => CONTENT_TYPES[0]?.id ?? "");
  const activeType =
    CONTENT_TYPES.find((t) => t.id === typeId) ?? CONTENT_TYPES[0];
  if (!activeType) {
    throw new Error("CONTENT_TYPES is empty");
  }

  const [source, setSource] = useState<Ruleset>(activeType.supportedSources[0] ?? "2024");
  // Source × type invariant: source is always a member of the active type's supportedSources.
  useEffect(() => {
    if (!activeType.supportedSources.includes(source)) {
      const fallback = activeType.supportedSources[0];
      if (fallback) setSource(fallback);
    }
  }, [activeType, source]);

  const [query, setQuery] = useState("");
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const handleTabChange = (next: string) => {
    if (next === typeId) return;
    setTypeId(next);
    setQuery("");
    setPickError(null);
  };

  const saveCard = useSaveCard();
  const handlePick = async (rowKey: string, card: Card) => {
    if (pickingKey !== null) return;
    setPickingKey(rowKey);
    setPickError(null);
    try {
      await saveCard.mutateAsync({ card, deckId, isNew: true });
      onSelected(card.id);
    } catch (err) {
      setPickError(
        err instanceof Error ? err.message : "Couldn't add this card. Please try again.",
      );
    } finally {
      setPickingKey(null);
    }
  };

  return (
    <DialogShell
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label="Browse SRD"
      size="lg"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <>
          <DialogHeader title="Browse SRD" onClose={onClose}>
            <SourceMenu
              source={source}
              options={activeType.supportedSources}
              onChange={setSource}
            />
          </DialogHeader>

          <div className={styles.layout}>
            <Tabs
              orientation="vertical"
              selectedKey={typeId}
              onSelectionChange={(k) => handleTabChange(String(k))}
              className={styles.tabs}
            >
              <TabList aria-label="Content type" className={styles.tabList}>
                {CONTENT_TYPES.map((t) => (
                  <Tab key={t.id} id={t.id} className={styles.tab}>
                    {t.label}
                  </Tab>
                ))}
              </TabList>
              {/*
                react-aria-components Tabs only mounts the active TabPanel by
                default, so each TypePanel is created exactly once per active
                type and unmounts on type switch — this keeps each TypePanel's
                hook order stable for its single `type` prop.
              */}
              {CONTENT_TYPES.map((t) => (
                <TabPanel key={t.id} id={t.id} className={styles.tabPanel}>
                  <TypePanel
                    type={t}
                    source={source}
                    query={query}
                    onQueryChange={setQuery}
                    pickingKey={pickingKey}
                    pickError={pickError}
                    onPick={handlePick}
                  />
                </TabPanel>
              ))}
            </Tabs>
          </div>

          <p className={styles.footer}>
            All content shown is from the{" "}
            <Link href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener noreferrer">
              SRD
            </Link>{" "}
            — content by Wizards of the Coast, licensed under{" "}
            <Link
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CC BY 4.0
            </Link>
            .
          </p>
        </>
      )}
    </DialogShell>
  );
}

function SourceMenu({
  source,
  options,
  onChange,
}: {
  source: Ruleset;
  options: readonly Ruleset[];
  onChange: (next: Ruleset) => void;
}) {
  return (
    <MenuTrigger>
      <RACButton
        aria-label={`Source: SRD ${source}`}
        className={styles.sourceTrigger}
      >
        Source: SRD {source} <span aria-hidden="true">▾</span>
      </RACButton>
      <Popover className={styles.sourcePopover} placement="bottom end">
        <Menu
          className={styles.sourceMenu}
          onAction={(key) => onChange(String(key) as Ruleset)}
        >
          {options.map((opt) => (
            <MenuItem key={opt} id={opt} className={styles.sourceItem}>
              {opt}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

type TypePanelProps = {
  type: ContentType;
  source: Ruleset;
  query: string;
  onQueryChange: (q: string) => void;
  pickingKey: string | null;
  pickError: string | null;
  onPick: (rowKey: string, card: Card) => void;
};

function TypePanel({
  type,
  source,
  query,
  onQueryChange,
  pickingKey,
  pickError,
  onPick,
}: TypePanelProps) {
  const results = type.useResults(source, query);
  const emptyMessage = useMemo(
    () => `No ${type.label.toLowerCase()} match your search.`,
    [type.label],
  );

  return (
    <>
      <div className={styles.searchRow}>
        <TextField aria-label={type.searchPlaceholder} className={styles.searchField}>
          <Input
            type="search"
            placeholder={type.searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
        </TextField>
      </div>

      <div className={styles.results}>
        {results.isLoading && <LoadingState />}
        {results.isError && (
          <div className={styles.state} role="alert">
            Couldn't load the list.
            <div className={styles.errorActions}>
              <Button variant="secondary" size="sm" onPress={() => results.refetch()}>
                Retry
              </Button>
            </div>
          </div>
        )}
        {!results.isLoading && !results.isError && results.rows.length === 0 && (
          <div className={styles.state}>{emptyMessage}</div>
        )}
        {pickError && (
          <div className={styles.state} role="alert">
            {pickError}
          </div>
        )}
        {results.rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className={styles.row}
            onClick={() => onPick(row.key, row.toCard())}
            disabled={pickingKey !== null}
          >
            <span className={styles.rowName}>{row.name}</span>
            <span className={styles.rowMeta}>
              {pickingKey === row.key ? "Loading…" : row.meta}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace `BrowseApiModal.module.css` with the updated rules.**

```css
/* src/views/BrowseApiModal.module.css */
.layout {
  flex: 1;
  display: flex;
  min-height: 0;
  container-type: inline-size;
}

.tabs {
  flex: 1;
  display: flex;
  min-height: 0;
}

.tabList {
  width: 10rem;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-2) var(--space-2);
  gap: var(--space-1);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface-2);
  outline: none;
}

.tab {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font: inherit;
  font-family: var(--font-body);
  color: var(--color-text);
  cursor: pointer;
  outline: none;
}

.tab[data-hovered]:not([data-selected]) {
  background: var(--color-surface);
}

.tab[data-selected] {
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 600;
}

.tab[data-focus-visible] {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.tabPanel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  outline: none;
}

.searchRow {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.searchField {
  display: block;
}

.results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-1) 0;
}

.row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  font-family: var(--font-body);
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
}

.row:last-child {
  border-bottom: 0;
}

.row:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.row:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: -2px;
}

.row:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.rowName {
  font-weight: 600;
}

.rowMeta {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.state {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-muted);
}

.errorActions {
  margin-top: var(--space-2);
}

.footer {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-2);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.4;
}

.sourceTrigger {
  font: inherit;
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.sourceTrigger[data-focus-visible] {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.sourcePopover {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  outline: none;
}

.sourceMenu {
  padding: var(--space-1);
  outline: none;
}

.sourceItem {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  cursor: pointer;
  outline: none;
}

.sourceItem[data-hovered],
.sourceItem[data-focused] {
  background: var(--color-surface-2);
}

@container (max-width: 559px) {
  .tabList {
    display: none;
  }
}
```

> **Note on the narrow-viewport behavior:** the spec calls for the type sidebar to be replaced with a second `MenuTrigger` in the header at narrow widths. This plan implements only the sidebar-hide half; the spec defers visual verification of the narrow layout to manual QA. If a future task adds the type `MenuTrigger` to the header at narrow widths, it can be a small follow-up — leaving it out now avoids speculative UI for behavior that isn't unit-tested.
>
> The spec section 144 implies both halves; deviation noted here so the user can decide. If the user wants the full swap implemented now, add a second `MenuTrigger` next to `SourceMenu` in `BrowseApiModal` controlled by the same `typeId` state, with a CSS rule that hides it at `min-width: 560px` and shows it below.

- [ ] **Step 3: Run typecheck.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the test suite.**

Run: `npm test -- BrowseApiModal`
Expected: all `BrowseApiModal` tests PASS. If any fail, read the output, fix the modal/CSS, re-run.

- [ ] **Step 5: Run the full test suite to catch regressions.**

Run: `npm test`
Expected: all tests PASS. (Other suites should be untouched — `EditorView.test.tsx` and `DeckView.test.tsx` reference `BrowseApiModal` imports but its props haven't changed.)

- [ ] **Step 6: Run lint.**

Run: `npm run lint`
Expected: PASS. If Biome reformats anything, accept it.

- [ ] **Step 7: Smoke-test in the browser.**

Run: `npm run dev`

In the browser, open a deck and click "Browse SRD." Verify:
1. The modal opens with the items sidebar tab selected and the items list visible.
2. Clicking the "Spells" tab swaps the list and clears the search.
3. Clicking the source button reveals 2014/2024; selecting one updates the list.
4. Search filters the active list.
5. Clicking an item adds it to the deck and closes the modal.
6. Hitting Escape closes the modal.
7. Resize the window narrow (≤ 540px wide-ish container) — the sidebar should disappear; the source dropdown still works.

Stop the dev server.

- [ ] **Step 8: Commit (test file + component + CSS together).**

```bash
git add src/views/BrowseApiModal.tsx src/views/BrowseApiModal.module.css src/views/BrowseApiModal.test.tsx
git commit -m "refactor(browse): registry-driven layout with sidebar tabs and source menu"
```

---

## Task 7: Final verification and PR-readiness check

**Files:**
- None (verification only)

- [ ] **Step 1: Confirm no stray imports of the old kind toggle still live in the modal.**

Run: `grep -n "ToggleButton" src/views/BrowseApiModal.tsx`
Expected: no matches.

- [ ] **Step 2: Confirm the `Kind` union and `Pickable` types are gone.**

Run: `grep -n "Pickable\|type Kind" src/views/BrowseApiModal.tsx`
Expected: no matches.

- [ ] **Step 3: Confirm content-type modules don't import each other.**

Run: `grep -n "from \"\\./items\"" src/api/content-types/spells.ts && grep -n "from \"\\./spells\"" src/api/content-types/items.ts || echo "OK — modules are independent"`
Expected: prints "OK — modules are independent".

- [ ] **Step 4: Build.**

Run: `npm run build`
Expected: PASS. Catches any production-only TS issue (vite.config strict tsc).

- [ ] **Step 5: Final test pass.**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Review the diff.**

Run: `git log --oneline origin/main..HEAD && git diff --stat origin/main..HEAD`
Expected: 6 commits (Tasks 1–6), files limited to:
- `src/api/content-types/{types,items,spells,index}.ts`
- `src/views/BrowseApiModal.{tsx,module.css,test.tsx}`
- `docs/superpowers/{specs,plans}/2026-05-09-srd-browse-rework-*.md`

If unexpected files appear, reconcile before proceeding.

- [ ] **Step 7: Stop.**

Do **not** push, open a PR, or merge. Report completion to the user; they will decide whether to open a PR.

---

## Out-of-scope follow-ups (already in spec)

- Sidebar counts (eager-load all type indices for `.length`)
- Per-type attribute filters (rarity, level, school, CR)
- Cross-type "All" view
- Per-source attribution footer copy
- Renaming dialog to "Browse Library" when fan/non-SRD content arrives
- Narrow-viewport type `MenuTrigger` in the header (see note in Task 6)
