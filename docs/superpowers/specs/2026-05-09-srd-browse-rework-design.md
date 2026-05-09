# SRD browse modal — rework for content-type growth

## Problem

`BrowseApiModal` exposes two filter axes — content type (Items / Spells) and source (2014 / 2024 SRD) — as four sibling toggle buttons in the dialog header. Today that's manageable; we want to add monsters, effects, feats, and a few more types in the next year. With ~5–10 types the toggle row stops fitting and stops scaling. The modal also hardcodes the `Kind = "items" | "spells"` union and switches on it (mappers, hooks, placeholders, empty messages), so adding a new type means editing the modal in several places.

## Goal

Reshape the dialog so adding a content type is a localized, additive change — register one module, append it to a list, done. Visually, replace the four-toggle header with a left sidebar of types (the growing axis) and a single source dropdown in the header (the slow axis). Keep the modal a modal.

## Non-goals

- Counts in the sidebar. The bundled JSON would have to be dynamically imported for every registered type just to read `.length`. Not a clear win; trivial to add later.
- Attribute filtering (rarity, spell level, school, CR, etc.). Out of scope for this rework.
- Cross-type / "All" view with mixed listing. Users entering this dialog know whether they want a spell or an item; mixed listing changes how search behaves and is straightforward to add later if browsing patterns argue for it.
- "Coming soon" placeholder rows for unimplemented types.
- Renaming the dialog to "Browse Library." Stays "Browse SRD" until a non-SRD source actually ships.
- Database changes. This is a frontend refactor; the saved card payload still flows through `useSaveCard` into the existing `cards` table.

## Approach

### Layout

`DialogShell` size grows from `md` (640px) to `lg` (720px). At wide widths the dialog is split:

- **Header** (existing `DialogHeader`): title "Browse SRD" on the left; a source dropdown on the right (visible label "SRD 2024 ▾"); close button.
- **Sidebar** (10rem / 160px, left, literal in the new CSS module — no `--space-*` token at that magnitude): vertical list of registered content types, active type styled with `--color-primary`. Only types whose `supportedSources` include the current source render; selection rules in "Source × type interaction" below.
- **Main pane** (right): existing search row + results list + attribution footer. No structural change beyond receiving the active type from the sidebar instead of the kind toggle.

Sidebar uses **`Tabs` from `react-aria-components`** in vertical orientation. Sidebar items act like tabs (each switches the active result panel); the primitive gives keyboard nav (↑/↓/Home/End), focus management, and ARIA roles for free. Each `TabPanel` renders the search field + results for one type.

Source dropdown uses **`MenuTrigger` + `Popover` + `Menu` + `MenuItem` from `react-aria-components`** — the same pattern already used by `src/lib/ui/UserMenu.tsx`. There is no `Select` primitive in `lib/ui/` and we are not introducing one; the menu pattern is sufficient for a small read-only list of sources, requires zero new wrappers, and inherits the project's existing trigger styling. The trigger button shows the active source label; menu items are the available sources for the active type. Selection updates the source state.

All styling uses existing screen tokens (`--color-*`, `--space-*`, `--radius-*`, `--fs-*`); no new tokens introduced.

### Type registry

Replace the hardcoded `Kind` union and its switch sites with a registry array. The interface deliberately **closes over each type's entry shape inside the module** so the registry's element type is non-generic and the array is simply `ContentType[]`. (An earlier sketch typed the array as `ContentType<unknown>[]`; that does not typecheck because `rowMeta(entry)`/`toCard(entry, …)` are contravariant in `TEntry`.)

```ts
// src/api/content-types/types.ts
import type { Ruleset } from "../endpoints/magicItems";
import type { Card } from "../../cards/types";

export type ContentRow = {
  key: string;
  name: string;
  meta: string;             // pre-rendered right-side text
  toCard: () => Card;       // closes over the original entry + source
};

export type ContentTypeResults = {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  rows: ReadonlyArray<ContentRow>;
};

export type ContentType = {
  id: string;                          // "items"
  label: string;                       // "Items"
  searchPlaceholder: string;           // derived once: `Search ${label.toLowerCase()}…`
  supportedSources: readonly Ruleset[];
  useResults: (source: Ruleset, query: string) => ContentTypeResults;
};
```

Each module assembles its own `ContentType` and owns its entry shape end-to-end:

```ts
// src/api/content-types/items.ts (sketch — `capitalize` is a local helper today
// in BrowseApiModal.tsx; it moves into the items module since only items use it)
import { useMagicItemIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import type { ContentType } from "./types";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export const items: ContentType = {
  id: "items",
  label: "Items",
  searchPlaceholder: "Search items…",
  supportedSources: ["2014", "2024"] as const,
  useResults: (source, query) => {
    const idx = useMagicItemIndex(source);
    // Memoize on the same triple BrowseApiModal currently uses
    // (`useMemo([kind, itemIndex.data, query])` at BrowseApiModal.tsx:58–69).
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: capitalize(entry.rarity.name),
          // ruleset injection lives inside the module, satisfying the existing mapper contract
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

```ts
// src/api/content-types/index.ts
import { items } from "./items";
import { spells } from "./spells";
export const CONTENT_TYPES: readonly ContentType[] = [items, spells];
```

`BrowseApiModal` becomes type-agnostic: it iterates `CONTENT_TYPES` to render `<Tab>` items in the `TabList` and a `<TabPanel key={type.id}>` per type. **The modal does not call `type.useResults` itself** — that would be a Rules-of-Hooks violation, since the resolved hook body would change as the active type changes. Instead, each `<TabPanel>` renders a `<TypePanel type={type} … />`, and `TypePanel` calls `type.useResults(source, query)` exactly once per render. Because `react-aria-components` `Tabs` only mounts the active `TabPanel` (default behavior — `shouldForceMount` is off), only one `TypePanel` is mounted at a time; switching the active type unmounts the prior `TypePanel` and mounts a fresh one keyed by `type.id`, so each `TypePanel` instance sees a single, stable `type` prop for its entire lifetime. This keeps the hook call order stable inside each `TypePanel`.

On row click, `TypePanel` calls `row.toCard()` and hands the resulting `Card` up to the modal via the `onPick` prop, which in turn calls `useSaveCard.mutateAsync`. The modal never sees `MagicItem` or `Spell` directly.

**Payload preservation contract:** `toCard` injection of `ruleset` (today: `magicItemDetailToCard({ ...item.entry, ruleset })` at `BrowseApiModal.tsx:78–79`) moves *inside* each module's `toCard` closure. The `Card` payload produced is byte-identical to today's; `useSaveCard` keeps receiving the same shape.

Re-homing existing pieces (no behavior change):

- `magicItemDetailToCard` / `spellDetailToCard` are still imported and called — by the type modules, not the modal.
- `useMagicItemIndex` / `useSpellIndex` are called by the modules' `useResults`.
- Per-kind helpers (`itemMeta`, `spellMeta`, `placeholder`, `emptyMessage`) become inline within their module.

Adding monsters later: create `src/api/content-types/monsters.ts`, append to `CONTENT_TYPES`. No edits to `BrowseApiModal`.

**Why introduce the registry now (with only 2 types)?** CLAUDE.md cautions against "abstractions beyond what the task requires." The registry is justified here because the shape change is the actual scope of this rework — adding the third type without it would require touching `BrowseApiModal` again on the same lines. We're paying the abstraction cost once, alongside the layout change that benefits from it.

### Source × type interaction

**One unified rule:** the source state is always a member of the active type's `supportedSources`. After every state change — initial mount, type switch, and any future registry change — the modal asserts this invariant; if the current source is not in the active type's list, it falls back to the active type's first supported source. The dropdown's options are exactly the active type's `supportedSources`, recomputed as the active type changes. Initial mount picks the first registered type and that type's first supported source.

Today every type supports both 2014 and 2024 so the fallback path is a no-op; the rule pays for itself when a future type ships partial source coverage (e.g., monsters with only 2014 data).

### Search

- Search stays scoped to the active type. Placeholder reads from `type.searchPlaceholder`.
- Query **clears on type switch.** A "fire" query for spells doesn't carry into items.
- `pickError` also clears on type switch (consistent with query — both belong to the previous panel).
- The current substring-on-name match logic stays as-is; no fuzzy match, no attribute filters.

**Autofocus.** Today the search `<Input autoFocus>` focuses on dialog open (`BrowseApiModal.tsx:147`). With `react-aria-components` `Tabs`, only the active `TabPanel` is mounted, and its subtree unmounts/remounts on tab switch — so `autoFocus` on the panel-local search input fires both on open *and* on every tab switch, which is the desired behavior. No effect or `key`-driven remount is needed.

### Pick lifecycle and tab switching

`pickingKey` and `pickError` are **single global pieces of state owned by `BrowseApiModal`** (not per-panel) — same as today. They flow into the active `TypePanel` as props.

- `pickingKey` (the in-flight save key) disables rows in the active panel during a save (today: `BrowseApiModal.tsx:181`). Sidebar tabs are **not** disabled during a save; switching types mid-save is allowed.
- The in-flight save still resolves regardless of which tab is currently active. On success `onSelected` fires and the modal closes.
- `pickError` clears whenever the active type changes (the modal resets it on type switch, just like `query`). On error mid-save, `pickError` renders in whichever panel is active when the render happens — typically the panel that initiated the save, but if the user has switched away the prior panel is no longer mounted and the error is dismissed visually. This matches today's user-perceived behavior since the modal closes on success and the error is short-lived in failure.

### Narrow viewports

Modal width is `min(720px, 92vw)`. On a 375px viewport the dialog is ~345px wide and a 160px sidebar would crush the main pane. Use a container query at ~560px:

- A `container-type: inline-size` declaration goes on a **wrapper element inside `BrowseApiModal`** (a top-level `<div className={styles.layout}>` that contains both the sidebar and main pane). It does **not** go on `DialogShell` — adding it there would change layout containment for every consumer (`IconPickerDialog`, `FirstDeckDialog`, the various confirm dialogs).
- `@container (min-width: 560px)`: sidebar layout described above.
- Below: hide sidebar; render type as a second dropdown (same `MenuTrigger` + `Menu` pattern as the source dropdown — one trigger labelled by the active type, menu items are the registered types) in the header next to the source dropdown. Main pane gets full width. No new primitives beyond the two header controls.

### Attribution footer

Today's footer copy ("Only SRD spells and items are available…") is type-specific and breaks the moment we add monsters. Generalize to "All content shown is from the SRD…" — keeps the SRD + CC BY 4.0 links exactly as they are, and reads naturally regardless of which types are registered. Footer remains rendered always; per-source variant copy is a future change when a non-SRD source ships.

## Component sketch

- `BrowseApiModal.tsx`
  - Owns: selected `typeId`, selected `source`, search query, picking state, pick error.
  - Maintains the source-invariant rule (Source × type interaction) on every relevant state change.
  - Renders: `DialogShell` → `DialogHeader` (title + source `MenuTrigger`/`Menu` + close) → wrapper `<div>` with `container-type: inline-size` → vertical `Tabs` (sidebar = `TabList`, content = the active `TabPanel`).
  - At narrow widths, the sidebar is hidden by container query and a type `MenuTrigger` is shown in the header next to source.
  - Each `TabPanel` renders `<TypePanel type={type} source={source} query={query} onQueryChange={...} onPick={...} pickingKey={pickingKey} pickError={pickError} />`.
- `TypePanel` (new, internal to the file or co-located)
  - Calls `type.useResults(source, query)`, renders rows / loading / error / empty / pick-error states. Visuals unchanged from today.
  - Hosts the `<Input autoFocus>` search field — a fresh mount on every tab switch reapplies focus.
- `src/api/content-types/items.ts`, `src/api/content-types/spells.ts`
  - Each exports a `ContentType` object that closes over its entry shape (`MagicItem` / `Spell`).
- `src/api/content-types/types.ts`
  - Exports `ContentType`, `ContentRow`, `ContentTypeResults`.
- `src/api/content-types/index.ts`
  - Exports `CONTENT_TYPES`.

The existing `BrowseApiModal.module.css` keeps its row / state / footer rules; new rules cover the layout wrapper, sidebar/tabs, and the container-query variant.

## Testing

`BrowseApiModal.test.tsx` already exercises the modal end-to-end with MSW. Updates:

**Keep, unchanged in intent:**
- Pick row → `useSaveCard` POSTs once → `onSelected` fires (still true via `row.toCard()`).
- Escape closes the modal (`onClose` called).
- Under StrictMode (the project's default), a single click results in a single POST — guards against the regression that surfaced in the StrictMode rollout.
- Loading, empty, and error states render in the active panel; Retry triggers refetch.

**New / revised:**
- Assert the sidebar renders as a tablist with the registered types as tabs (today: "Items," "Spells") in registry order.
- Clicking a sidebar tab switches placeholder text, rows, clears the search query, and clears any prior pick error.
- Source dropdown options are exactly the active type's `supportedSources`. Switching the active type re-derives the options. (Today's two types both support 2014 and 2024, so this is a structural assertion via DOM, not a state transition.)
- Switching source updates rows.

**Dropped:** the previously proposed "registry shape guardrail" runtime test — TypeScript already enforces the shape; a runtime assert adds nothing.

**Out of scope for unit tests:** the narrow-viewport layout swap is CSS-only (a `@container` rule that hides one element and shows another). The state machine — active type, source, query, picking — is identical at both widths, so the assertions above cover behavior at any width. We do **not** add a JSDOM-only `data-narrow` runtime toggle to make container queries testable; that would diverge production from the test path. Visual verification of the narrow layout is left to manual QA / future E2E.

No new test infrastructure; existing MSW handlers continue to serve the bundled JSON.

## Migration

None. Frontend refactor only — no database, RLS, or schema change. Saved cards keep the same shape (`toCard` produces the same `Card` payload).

## Risks and edge cases

- **Container query support**: relied on; current browser targets all support it. The `container-type` declaration is scoped to the new layout wrapper inside `BrowseApiModal`, not `DialogShell`, so other dialog consumers are unaffected.
- **Vertical Tabs styling**: `react-aria-components` `Tabs` defaults to horizontal; the `orientation="vertical"` prop plus CSS produces the sidebar.
- **Type with zero supported sources**: registry filters such a type out of the sidebar.
- **Active type's `useResults` errors**: the tab stays selected and the error renders inside the panel with a Retry button that calls `refetch()`. Today's behavior preserved (same control, scoped to the active panel).
- **Switching tabs mid-save**: allowed. The save resolves regardless of active tab; on success `onSelected` fires and the modal closes. On error, `pickError` is rendered inside the panel that owned the save — switching away dismisses the error visually. Tab switch also clears `pickError` for the new panel.
- **Dialog height**: keep `height={{ fixed: "min(70vh, 640px)" }}` from today; the sidebar inherits the dialog height.
- **Focus on open and on tab switch**: `<Input autoFocus>` lives in the panel; RAC `Tabs` mounts only the active panel, so focus is applied on dialog open *and* on every tab switch. No effect needed.

## Out-of-scope follow-ups

- Sidebar counts (eager-load all type indices, display `.length`).
- Attribute filters per type (rarity, level, school, CR).
- "All" cross-type view with row tags + unified search.
- Per-source attribution footer copy when non-SRD sources land.
- Renaming dialog to "Browse Library" when fan/non-SRD content arrives.
