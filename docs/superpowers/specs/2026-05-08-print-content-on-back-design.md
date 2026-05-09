# Continuation cards on print backs

## Problem

`PrintView` already supports a "Print backs" toggle that adds an icon-only back
page after each front page (see
`2026-05-06-print-backs-design.md`). For multi-page cards (cards whose body
overflows a single physical page), the existing flow lays each physical page as
its own front-side card and gives every one an icon back. A user with a duplex
printer wants to combine the two physical pages of a 2-page card into a single
double-sided card — page 1 on the front, page 2 on the back, cut once. The
2026-05-06 spec's "Forward compatibility" section explicitly anticipated this
follow-up; this spec is that follow-up.

## Goals

- A second toggle, "Continue on back", lives directly under "Print backs" in
  `PrintView`'s sidebar. Default off. Disabled when "Print backs" is off.
- When both toggles are on, multi-page cards continue onto the back of their
  first slot instead of taking a separate front slot. A 2-page card occupies
  one physical slot; a 3-page card occupies two; a 4-page card occupies two; in
  general, physical pages flow front/back/front/back through a per-card slot
  sequence, and any unfilled trailing back falls back to the existing icon
  back.
- 1-page cards mixed with multi-page cards on the same sheet keep the icon on
  their backs.
- Sheet imposition (horizontal mirror for duplex flip) is unchanged. The
  geometry constraint is independent of what's on the back.
- "Print backs" off → no behavior change. "Print backs" on, "Continue on back"
  off → existing icon-only back behavior, regression-tested.

## Non-goals

- **Per-card overrides** for back content (custom icon, custom back text).
- **Smarter sheet packing** — e.g., grouping multi-page cards together to avoid
  mixed sheets. Cards stay in deck order.
- **Changes to the imposition algorithm.** `imposeBackPage` and `backSlotIndex`
  are content-agnostic and stay untouched.
- **Persisting toggle state** across visits. Same precedent as "Print backs":
  print-time choice, not a deck attribute.
- **Pagination changes.** `paginate.ts`, `expandCard.ts`, and the measurer are
  not modified.
- **Suppressing the "Card 2 of 2" footer** on a back-rendered continuation
  page. The same `<Card>` component renders front and back content, and the
  footer continues to display. See "Risks / things to watch."

## Approach

Introduce a thin layout-layer abstraction — a **print slot** — that pairs a
front `PhysicalCard` with an optional back `PhysicalCard`. The pairing function
is pure and unit-tested in isolation. Everything below the slot layer
(pagination, body chunking, measurement) is unchanged. Above it, `PrintView`
consumes slots instead of `PhysicalCard`s, and the existing `getBackContentFor`
seam grows a tiny branch: render `<Card>` when the slot has a back, otherwise
render the existing `<CardBack>` icon fallback.

Three units of work:

1. A pure `pairSlots(physicalCards, { contentOnBack })` function that walks
   the `PhysicalCard` list and groups consecutive entries belonging to the
   same card, two at a time, into `PrintSlot { front, back? }`. With
   `contentOnBack: false`, every `PhysicalCard` becomes its own front-only
   slot — a no-op transformation that lets `PrintView` use the same data
   shape regardless of toggle state.

2. `PrintView` state additions: a new `contentOnBack` boolean switch and one
   call to `pairSlots` between `useExpandedCards` and the existing chunking.

3. The existing `getBackContentFor(entry, perPage)` seam (introduced as a
   forward-compat seam in the 2026-05-06 spec) updates from
   `PhysicalCard` → `PrintSlot`. When the slot has a `back`, it renders
   `<Card>` with that page's body chunk and pagination; otherwise it falls
   back to `<CardBack>`.

## Architecture

### `pairSlots`

New: `src/cards/pairSlots.ts` + `src/cards/pairSlots.test.ts`. Sits next to
`expandCard.ts` because it operates on its output.

```ts
import type { PhysicalCard } from "./expandCard";

export type PrintSlot = {
  front: PhysicalCard;
  back?: PhysicalCard;
};

export function pairSlots(
  cards: PhysicalCard[],
  opts: { contentOnBack: boolean },
): PrintSlot[] {
  if (!opts.contentOnBack) return cards.map((front) => ({ front }));

  const slots: PrintSlot[] = [];
  for (let i = 0; i < cards.length; i++) {
    const front = cards[i]!;
    const next = cards[i + 1];
    if (next && next.card.id === front.card.id) {
      slots.push({ front, back: next });
      i++; // consume the paired entry
    } else {
      slots.push({ front });
    }
  }
  return slots;
}
```

Properties this relies on:

- Pairing happens only between **consecutive** `PhysicalCard`s with the
  **same `card.id`**. `useExpandedCards` runs `expandCard` per card and
  concatenates; consecutive entries with matching ids are guaranteed to be
  pages 1, 2, 3 of the same card in order.
- When `contentOnBack` is off, the function is a no-op `map`. The downstream
  pipeline does not need to branch.
- Output array length is between `ceil(N/2)` and `N` for any one card's
  contribution (depending on whether continuations exist).

### `PrintView` changes

In `src/views/PrintView.tsx`:

1. Add `const [contentOnBack, setContentOnBack] = useState(false)`.
2. Compute `printSlots`:
   ```ts
   const physicalCards = useExpandedCards(printable, perPage).physicalCards;
   const printSlots = pairSlots(physicalCards, {
     contentOnBack: printBacks && contentOnBack,
   });
   ```
   The `printBacks &&` guard means the toggle has no effect when "Print backs"
   is off. With backs off, no back page is emitted anyway, so pairing would be
   invisible — but unpairing keeps the slot count consistent with what the
   user sees and avoids surprising behavior if they toggle backs back on.
3. Chunk `printSlots` (not `physicalCards`) into pages of `perPage`:
   ```ts
   const pages = printSlots.length === 0 ? [] : chunk(printSlots, perPage);
   ```
4. Front-page render: each slot renders `slot.front` through the existing
   `<Card>` invocation. The page key derivation continues to use the first
   slot's `front.card.id` and `front.pagination?.page`.
5. Back-page render: `imposeBackPage(pageSlots, perPage, COLS)` — the helper
   is generic (`<T>`), so this is just a type-level change. Each imposed
   entry is a `PrintSlot | undefined`.
6. `getBackContentFor` updates:
   ```ts
   const getBackContentFor = (slot: PrintSlot, perPage: CardsPerPage) =>
     slot.back ? (
       <Card
         card={slot.back.card}
         cardsPerPage={perPage}
         bodyOverride={slot.back.bodyChunk}
         pagination={slot.back.pagination}
       />
     ) : (
       <CardBack card={slot.front.card} cardsPerPage={perPage} />
     );
   ```
7. Sidebar markup gains a sub-toggle. `Switch` accepts `isDisabled` (passes
   through to `react-aria-components`'s `Switch`):
   ```tsx
   <div className={styles.switchBlock}>
     <Switch isSelected={printBacks} onChange={setPrintBacks}>
       Print backs
     </Switch>
     <div className={styles.helptext}>
       <p>Adds a second page of card backs for double-sided printing.</p>
       {printBacks && (
         <p>
           In the print dialog, choose <em>Flip on {flipEdge}</em>{" "}
           (sometimes labelled <em>{flipLabel}</em>).
         </p>
       )}
     </div>
     <Switch
       isSelected={contentOnBack}
       onChange={setContentOnBack}
       isDisabled={!printBacks}
     >
       Continue on back
     </Switch>
     <div className={styles.helptext}>
       <p>Multi-page cards continue onto the back instead of a new sheet.</p>
     </div>
   </div>
   ```
   The exact CSS structure (indentation, spacing, divider treatment for the
   nested toggle) is at the implementer's discretion provided it reads as a
   sub-option of "Print backs". Defer to existing `PrintView.module.css`
   conventions.

### Imposition unchanged

`imposeBackPage` already accepts `T[]`. Switching from `PhysicalCard[]` to
`PrintSlot[]` is a type-level change at the call site only. The helper has no
knowledge of what's on the back, only of slot positions.

### `data-page-side` and other test hooks

The existing `data-page-side="back"` attribute and `data-role="card-back-root"`
selector continue to work. Tests already disambiguate front/back pages with
these.

## Tests

### `pairSlots.test.ts` (new)

Inputs are constructed with the existing factories where possible, otherwise
hand-built `PhysicalCard` literals. The factory pattern preference (no
unnecessary overrides) applies.

- `contentOnBack: false` → maps every `PhysicalCard` to a front-only slot;
  output length equals input length; no slot has a `back` property defined.
- Empty input → empty output, both modes.
- `contentOnBack: true`, single 1-page card (no `pagination` field) → one
  slot, `back` undefined.
- `contentOnBack: true`, single 2-page card (`pagination = {page:1, total:2}`
  then `{page:2, total:2}`) → one slot, `front.pagination.page === 1`,
  `back!.pagination.page === 2`.
- `contentOnBack: true`, single 3-page card → two slots: (pg1/pg2),
  (pg3/no back).
- `contentOnBack: true`, single 4-page card → two slots: (pg1/pg2), (pg3/pg4).
- `contentOnBack: true`, two distinct 1-page cards → two slots, neither
  paired (different `card.id`).
- `contentOnBack: true`, two consecutive 2-page cards (A then B) → two
  slots: (A.pg1/A.pg2), (B.pg1/B.pg2). Confirms only same-id consecutive
  pages pair (no cross-card pairing).

### `PrintView.test.tsx` (extended)

- "Continue on back" switch is rendered and `aria-disabled` when "Print
  backs" is off. Toggling "Print backs" on enables it.
- "Print backs" on, "Continue on back" off → existing icon-back behavior.
  Regression guard: page count and back-page contents match the existing
  print-backs assertions byte-for-byte.
- Both toggles on, deck = one 2-page card + one 1-page card, 4-up layout:
  - One front page with two filled slots in deck order: card1 page 1,
    card2 page 1.
  - One back page imposed by horizontal mirror. The slot mirroring card1
    contains card1 page 2's body content (assert by reading `data-role=
    "card-body"` text). The slot mirroring card2 contains an icon-back
    (`data-role="card-back-root"`).
- Both toggles on, deck = one 4-page card, 4-up layout:
  - One front page with two filled slots: pg1 and pg3 (in row-major slot
    order).
  - One back page with the mirrored two slots filled: pg2 (mirroring pg1's
    slot), pg4 (mirroring pg3's slot). Read body text to assert which page
    landed where.
- Both toggles on, deck = one 3-page card, 4-up layout:
  - One front page with two filled slots: pg1 and pg3.
  - One back page: pg2 in the slot mirroring pg1; the slot mirroring pg3
    renders an icon-back.
- "Continue on back" helptext renders ("Multi-page cards continue onto the
  back instead of a new sheet"). Existing flip-edge tip continues to render
  under the same conditions as today (i.e., when "Print backs" is on).

### Unchanged test files

- `Card.test.tsx` — the same `<Card>` renders front and back content; no new
  behavior to test.
- `CardBack.test.tsx` — used as the fallback for unfilled backs; no change.
- `backImposition.test.ts` — helper is generic and content-agnostic.

## Manual print verification (mandatory before declaring done)

CSS testing only confirms the DOM. The actual goal is paper that aligns when
duplexed. Before merging:

1. Build a deck containing one 2-page card. Print 4-up portrait with both
   toggles on, duplex long-edge.
   - Expected: a single sheet, front and back. After cutting, page 1 of the
     card on the front face, page 2 on the back face, oriented correctly when
     the user flips the card.
2. Build a deck mixing one 2-page card and one 1-page card. Print 4-up
   portrait, both toggles on, duplex.
   - Expected: 2-page card lands as a single double-sided slot; 1-page card
     has an icon back; both align within ~1 mm.
3. Build a deck with one 3-page card. Print 4-up portrait, both toggles on,
   duplex.
   - Expected: two slots — slot 1 is double-sided (pg1 / pg2), slot 2 has
     pg3 on the front and the icon on the back.

If a home printer isn't available, single-sided front + single-sided back
prints overlaid against a window are an acceptable proxy. Document the result
in the PR description.

## Risks / things to watch

- **Footer "Card 2 of 2" on a back-rendered page.** A user holding the cut
  card may find "Card 2 of 2" redundant on the back face — they can see it's
  the back. Kept by default because (a) it confirms physical orientation
  matches expectation, and (b) the same `<Card>` component renders front and
  back, so suppressing it would require a new prop and CSS change. Revisit
  only if multiple users surface it.
- **Mixed sheets look uneven.** A sheet with one 2-page card and three 1-page
  cards has one printed-content back and three icon backs side by side. This
  is correct but visually mixed. Auto-grouping multi-page cards is out of
  scope; users who care can reorder their deck manually.
- **Same-card pairing assumes `expandCard` ordering.** `pairSlots` relies on
  consecutive `PhysicalCard`s with matching `card.id` being consecutive pages
  of the same card. `useExpandedCards` runs `expandCard` per-card and
  concatenates, preserving this. If the pipeline ever reorders or
  interleaves entries, pairing breaks silently. The two-2-page-cards test
  case guards this.
- **Disabled state vs. selected state.** The sub-toggle is `isDisabled` when
  "Print backs" is off, but its `isSelected` value persists. If the user
  toggles backs back on, paired flow resumes from the previously-selected
  state. This matches user expectation; assertion in the disabled-gating
  test confirms it.
- **The `printBacks &&` guard inside `pairSlots`'s argument.** It's tempting
  to drop the guard and always honor `contentOnBack`. Don't — without the
  guard, toggling "Continue on back" while "Print backs" is off changes the
  front page's slot count (multi-page cards collapse), which is a confusing
  UI state for a toggle whose effect should be invisible until backs are
  enabled.
