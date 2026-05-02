# Card overflow pagination

## Problem

When an item card's body is longer than fits a single physical card, the text is silently clipped. `AutoFitCard` already steps the font down (1.0 → 0.9 → 0.8), but past that the body's `overflow: hidden` truncates without warning. Users have no signal that content was lost.

## Goal

Render an oversized item as a sequence of physical cards with a clear continuation marker, so the full body always reaches the printed sheet.

## UX summary

- An item whose body overflows after the existing scale-down splits into multiple physical cards.
- The split is greedy at word boundaries: each card is filled before starting the next. Mid-paragraph and mid-sentence breaks are allowed; mid-word breaks are not (with one fallback — see edge cases).
- Continuation cards differ from the first card in two ways:
  - Title shows `Item Name (p2 of 4)` (and `(p1 of 4)` on the first card when there is more than one).
  - The italic type line below the title is hidden.
- Image/icon (top-right) and footer (cost/weight) appear on every physical card.
- Once an item is split, the body renders at the natural 1.0 scale — `AutoFitCard`'s scale-down is only used when an item still fits on a single card.

## Architecture (Approach A: centralized pagination)

```
ItemCard[]
  └─ useExpandedCards(items, layout)
       │   measures each body in a hidden DOM container, splits as needed
       └─→ physicalCards: Array<{
             card: ItemCard;
             bodyChunk: string;
             pagination?: { page, total };
             needsScaleFit: boolean;       // single-card item; render via AutoFitCard
           }>
            │
            └─ chunk(perPage) → pages → render
```

### `Card.tsx`

Adds two optional props:

```ts
type Props = {
  card: ItemCard;
  layout: CardLayout;
  pagination?: { page: number; total: number };
  bodyOverride?: string;
};
```

Inside the component, derive `const isFirstPage = !pagination || pagination.page === 1;` and gate first-page-only content off it. For now that's just the type line; future first-only rows use the same gate.

When `pagination` is set, the title is rendered as `${card.name} (p${page} of ${total})`. The body uses `bodyOverride ?? card.body`.

When `pagination` is undefined and `bodyOverride` is undefined, the component behaves exactly as today.

### `AutoFitCard.tsx`

Unchanged. Continues to handle 1.0 / 0.9 / 0.8 scale-down for single-card items.

### `src/cards/paginate.ts` (new)

```ts
export type PaginateMeasurer = (prefix: string) => boolean;
// returns true iff `prefix` fits the body at the configured layout/page-shape

export function paginateBody(opts: {
  body: string;
  measureFirst: PaginateMeasurer;       // first card: includes type line
  measureContinuation: PaginateMeasurer; // page 2+: no type line
}): string[];
// returns one chunk per physical card; length 1 if the whole body fits
```

The two measurers reflect that the first card has a type line eating header space while continuations do not — so continuations have a slightly larger body budget. Both are injected callbacks so the function stays pure and unit-testable without a DOM.

**Algorithm:**

1. If `measureFirst(body)` is true, return `[body]` (single card, no pagination).
2. Otherwise, binary-search the largest word-prefix `P1` such that `measureFirst(P1)` is true. Append `P1` to the output and trim it (plus leading whitespace) off the front of `body`.
3. While `body` is non-empty:
   - If `measureContinuation(body)` is true, append `body` and stop.
   - Else binary-search the largest word-prefix `Pn` such that `measureContinuation(Pn)` is true; append it and advance.
4. **Single-token-too-long fallback**: if a binary search returns 0 words (one token longer than a card body — rare, e.g., a URL), fall back to character-boundary search for that one chunk only.

Word tokenization preserves intervening whitespace so paragraph breaks (`\n\n`) survive a mid-paragraph split correctly when the chunk is rejoined.

### `useExpandedCards(items, layout)` (new, in `src/cards/`)

A hook that:

1. Lazily mounts two hidden full `<Card>` instances per layout off-screen (`position: absolute; left: -10000px;`): one shaped like a first card (with type line, with a sentinel `(p9 of 9)` pagination suffix on the title), one shaped like a continuation (no type line, same sentinel). Rendering full cards rather than synthetic body boxes ensures real header/divider/footer sizing — including title wrapping — drives the body's measured height. The sentinel is a worst-case proxy for the actual suffix; minor real-suffix differences are accepted as a known approximation.
2. For each item, calls `paginateBody({ body, measureFirst, measureContinuation })` where each `measure(prefix)` swaps the candidate body into the corresponding measurer Card and returns `bodyEl.scrollHeight <= bodyEl.clientHeight`.
3. Memoizes by `(body, layout)` — the only inputs that affect splits.
4. Returns `{ physicalCards, isMeasuring }`.

The two measurers are reused across calls. They're removed on unmount of the last consumer (ref-counted module-level cleanup).

The hook also supports `useExpandedCards([singleCard], layout)` for the editor preview's per-keystroke recomputation.

### `PrintView.tsx`

```tsx
const items = cards.filter(...).filter(c => c.kind === "item");
const { physicalCards } = useExpandedCards(items, layout);
const pages = chunk(physicalCards, perPage);
```

Each slot picks `<AutoFitCard>` when `entry.needsScaleFit` is true, else `<Card>` directly with `bodyOverride` and `pagination` from the entry.

### `EditorView.tsx`

The right-hand preview pane gets:

- A counts label that always renders, derived by running `paginateBody` once per layout for the current draft:
  - `1 card` when both 4-up and 2-up produce a single chunk.
  - `3 cards (4-up) · 2 cards (2-up)` when they differ or either is >1.
- The preview itself stays at 4-up size, showing one card at a time. When the 4-up split has more than one chunk, a paginator (`← Page 2 of 3 →`) appears below the preview. The visible-page index is local `useState`, clamped if the chunk count shrinks while typing.
- The preview renders `<AutoFitCard>` when there's only one chunk, `<Card>` with `bodyOverride` + `pagination` when there are multiple.
- **Debounced measurement.** The editor recomputes splits on every keystroke, which is wasteful during fast typing. The `body` input that feeds `useExpandedCards` is debounced (200ms). Other draft fields (name, type line, footer) update the preview synchronously since they don't trigger remeasure. While the debounce window is open the preview keeps showing the previous splits — visually fine, just slightly stale. The visible-page index stays clamped against the latest computed chunk count.

## Edge cases

- **Single token longer than one card** — character-boundary fallback for that one chunk only (see paginate.ts step 4).
- **Empty body** — `paginateBody` returns `[""]`; one card, no pagination metadata.
- **Body unchanged across re-renders** — memoization key prevents re-measure.
- **Image fails on continuation** — each `Card` instance owns its own `brokenUrl` state; per-page fallback is fine.
- **Body shrinks while editing** — `useExpandedCards` recomputes; the editor's local page index is clamped to the new chunk count.

## Testing

Hybrid: keep Vitest + JSDOM for the bulk of the work, add Playwright for things that genuinely need a browser.

### Vitest (existing runner)

- `paginate.test.ts` — pure algorithm with a fake `measure` that resolves based on configured "fits up to N characters" rules. Covers: no-split when body fits, exact word-boundary splits, multi-page splits, single-long-token character fallback, empty body.
- `Card.test.tsx` — additions for the `pagination` prop: title suffix appears, type line is hidden when `page > 1` (and `page === 1` of >1 total), footer still renders, `bodyOverride` is used.
- `useExpandedCards.test.ts` — hook behavior with the measurer DOM stubbed via `Object.defineProperty(HTMLElement.prototype, "scrollHeight", …)` (same pattern as the existing `AutoFitCard.test.tsx`). Verifies memoization keys and the `needsScaleFit` flag.

### Playwright (new — `e2e/` directory)

Two focused specs against the dev server:

1. `e2e/editor-pagination.spec.ts` — type a long body into the item editor; assert the counts label updates (`"3 cards (4-up) · …"`), the paginator appears, prev/next moves the visible page, the `(p2 of 3)` suffix appears in the preview title.
2. `e2e/print-pagination.spec.ts` — seed a deck with one long item, navigate to `/print`, set `perPage=4`, assert the sheet contains the expected number of `[data-role="card-root"]` with sequential `(p1 of N)`…`(pN of N)` titles, image/footer present on each, type line absent on continuations.

Playwright is added under `devDependencies` (this requires user approval per project convention). CI gets a new job; locally the e2e suite is a separate npm script.

### Out of scope

- Visual-regression snapshots of printed sheets (could be a follow-up).
- Manual page breaks (no UI for the user to insert one).
- Pagination for non-item card kinds (spell, ability) — they're not rendered by `Card.tsx` today.

## Risks

- **Measurement performance on the editor's per-keystroke recompute.** Mitigated by memoization on `(body, layout)`. Worst case is one binary search per layout per change — O(log n) measurer mounts per keystroke. Should be fine for hundreds-of-words bodies; revisit if profiling shows hitches.
- **Measurer drift from real card.** The hidden measurers render real `<Card>` instances, so they pick up CSS changes automatically. The remaining approximation is the sentinel pagination suffix (`(p9 of 9)`) — close enough in practice; the e2e tests catch any real misbehavior.
- **Adding Playwright is a non-trivial dependency change.** Browsers in CI, install time, and a new test runner. Worth it given the printed-output stakes; user must approve the dependency add before the implementation runs `npm install`.
