# Optional decorative card backs in print

## Problem

Today `PrintView` emits one DOM page per chunk of physical cards and prints
single-sided. Users who want to cut the result into double-sided cards have no
way to print decorative backs on a duplex run at a print shop. The card sheet
is one-sided by construction.

A decorative back is a card-shaped tile with the same outer border as the
front and a single icon centered in the body. Backs should match the physical
dimensions of the front exactly so a duplex run cuts cleanly.

## Goals

- A single deck-wide toggle in `PrintView`'s controls strip switches backs on
  or off. Default off.
- When on, every front page is followed by a back page with the same cards
  arranged in horizontally-mirrored slot order, ready for a duplex print on
  letter paper.
- Each back tile renders the front's outer border and one centered icon. The
  icon reuses the front's resolved `iconKey` (same `card.iconKey ?? pickIconKey(card)`
  chain `Card.tsx` uses today). No new icon assets, no new fallback path.
- The toggle exposes a tip telling the user which duplex flip mode to choose
  in the print dialog. The phrasing swaps with the active layout (4-up portrait
  → "flip on long edge"; 2-up landscape → "flip on short edge").
- No regression to the existing front-only output when the toggle is off.

## Non-goals

- **Continuation cards on backs.** Today, an oversized item produces multiple
  `physicalCards` entries via `useExpandedCards` and prints them as separate
  slots. In this iteration, every continuation entry gets its own *decorative*
  back, just like a single-page card. Pairing a card's continuation page into
  the back slot of its first page is a planned follow-up — see "Forward
  compatibility".
- **Per-card back overrides.** No custom icon per card, no per-card back text.
- **Deck-wide custom back artwork.** No uploaded image, no pattern, no theme.
- **Bleed / crop marks.** The existing front design has a white margin outside
  the visible black border, which dodges bleed entirely; backs follow the same
  design and need no bleed work.
- **Color management (CMYK / ICC).** Browser sRGB output remains acceptable.
- **Switching off CSS print media to a real PDF generator.** Browser
  `Save as PDF` continues to be the export path.

## Approach

**Decorative backs first; continuation-on-back is a future iteration.** The
visual back ships now. The page-emission and back-content boundaries are
shaped so the future swap is local — no rewrite required.

**Three independent units:**

1. A pure imposition helper that maps a row-major front slot index to its
   horizontally-mirrored back slot index, given `cols`. Tested in isolation.
2. A `CardBack` component that renders the front's outer border and a single
   centered icon, sized exactly like a front `Card` for the active
   `cardsPerPage`. Print tokens only.
3. `PrintView` page emission, which when the toggle is on emits, after each
   front page, a back page whose slots are filled by applying the imposition
   helper to the front-page card list.

**Toggle state lives in `PrintView` local state.** Default off. Not persisted
across visits to the print view. Treated as a print-time choice, not a deck
attribute.

**Same icon as the front.** The back's icon comes from `card.iconKey ??
pickIconKey(card)` — identical to `Card.tsx:67`. Cards with an explicit
`iconKey` use it; otherwise the heuristic picks one; otherwise the existing
`FALLBACK_ICON_KEY` (d20) returns. Every card already resolves to *some* icon
today, so no new fallback is needed.

## Architecture

### Imposition helper

A small pure module — recommended placement
`src/cards/backImposition.ts` (sibling of `Card.tsx`, since the rule is about
card slot geometry, not about the print view shell).

```ts
// Given a row-major slot index on the front page and the column count of
// the layout, return the slot index its back-side mirror should occupy.
//
//   row   = floor(frontIndex / cols)
//   col   = frontIndex % cols
//   back  = row * cols + (cols - 1 - col)
//
// For 4-up portrait (cols = 2, rows = 2): [A, B, C, D] → [B, A, D, C].
// For 2-up landscape (cols = 2, rows = 1): [A, B] → [B, A].
// A 1-column layout would be a no-op; the rule degrades correctly.
export function backSlotIndex(frontIndex: number, cols: number): number {
  const row = Math.floor(frontIndex / cols);
  const col = frontIndex % cols;
  return row * cols + (cols - 1 - col);
}

// Given a front-page card list and the layout's column count and slots per
// page, return a dense array of length `slotsPerPage` with each front entry
// placed at its mirrored back-slot index. Slots not occupied by a front entry
// stay `undefined`. The caller renders only defined entries.
export function imposeBackPage<T>(
  frontPage: T[],
  slotsPerPage: number,
  cols: number,
): (T | undefined)[] {
  const out: (T | undefined)[] = new Array(slotsPerPage).fill(undefined);
  for (let i = 0; i < frontPage.length; i++) {
    out[backSlotIndex(i, cols)] = frontPage[i];
  }
  return out;
}
```

`imposeBackPage` always returns a **dense array of length `slotsPerPage`**
(the layout's full grid cell count). For a partial last front page (e.g. 3
cards in a 4-up deck), the back page is still a 4-slot grid: three back
tiles at the mirrored positions, one explicit empty slot. Density matters —
a sparse array would be skipped by `.map()` and CSS grid would compress
backs left-to-right, breaking duplex alignment.

### `CardBack` component

New: `src/cards/CardBack.tsx` + `src/cards/CardBack.module.css`. Standalone
component, *not* a `Card` variant. Rationale: a back is structurally simpler
than a front (no body Markdown, no pagination footer, no autofit, no header
tags), and adding `variant="back"` to `Card` would fork logic that doesn't
share much. Tests stay small and focused.

The CSS shares physical dimensions with the front exactly. The simplest way
is to import the front's `Card.module.css` for the dimension rules, but CSS
modules don't share class names cleanly — instead, redefine the same values
in `CardBack.module.css` (per-page width / height / border / radius). Watch
for divergence in code review; if it appears, extract a small `CardFrame`
shell that both `Card` and `CardBack` use, in the same PR.

```tsx
// src/cards/CardBack.tsx
import type { CardsPerPage } from "./Card";
import styles from "./CardBack.module.css";
import { pickIconKey } from "./iconRules";
import { ResolvedIcon } from "./resolveIcon";
import type { RenderableCard } from "./types";

type Props = {
  card: RenderableCard;
  cardsPerPage: CardsPerPage;
};

export function CardBack({ card, cardsPerPage }: Props) {
  const layoutClass = cardsPerPage === 4 ? styles.perPage4 : styles.perPage2;
  const iconKey = card.iconKey ?? pickIconKey(card);
  return (
    <div className={`${styles.card} ${layoutClass}`} data-role="card-back-root">
      <div className={styles.icon} aria-hidden="true">
        <ResolvedIcon iconKey={iconKey} />
      </div>
    </div>
  );
}
```

The icon is sized to the body — a noticeably larger glyph than the front's
3em corner icon, since the back has nothing else to show. Concrete sizing is
left to CSS; recommended target is roughly 50% of the shorter card edge.

### `PrintView` changes

Three changes to `src/views/PrintView.tsx`:

1. Add a `printBacks: boolean` state, default `false`. Wire it to a
   `Switch` primitive (`src/lib/ui/Switch.tsx`) inside the existing
   `.controls` strip.
2. After mapping `pages` (from `chunk(physicalCards, perPage)`), conditionally
   interleave a back page after each front page when `printBacks` is on.
   The back page's content is computed via
   `imposeBackPage(pageCards, perPage, COLS)` where `COLS = 2` is a local
   constant — both supported layouts (4-up portrait, 2-up landscape) use 2
   columns. A comment notes this is the only layout-specific assumption in
   page emission; if a 1-col or 3-col layout is ever added, derive `cols`
   from `perPage` here.
3. Conditionally append a tip line under (or beside) the toggle that names
   the correct duplex flip mode for the active layout. The tip is rendered
   only when `printBacks` is on; with backs off, the existing print-margin
   tip is the only one visible.

Sketch of the rendered structure when `printBacks` is true:

```tsx
{pages.map((pageCards, pageIndex) => (
  <Fragment key={pageIndex}>
    <div data-testid="page" data-page-side="front" className={…}>
      {pageCards.map((entry) => (
        <div className={styles.slot} key={…}>
          <Card … />
        </div>
      ))}
    </div>
    {printBacks && (
      <div data-testid="page" data-page-side="back" className={…}>
        {imposeBackPage(pageCards, perPage, COLS).map((entry, slotIndex) => (
          <div className={styles.slot} key={`back-${pageIndex}-${slotIndex}`}>
            {entry ? getBackContentFor(entry, perPage) : null}
          </div>
        ))}
      </div>
    )}
  </Fragment>
))}
```

`getBackContentFor(entry, perPage)` is a thin local helper inside
`PrintView.tsx` (not exported). In this iteration:

```ts
const getBackContentFor = (entry: PhysicalCard, perPage: CardsPerPage) =>
  <CardBack card={entry.card} cardsPerPage={perPage} />;
```

It exists as a named seam so the future continuation-on-back iteration only
modifies this one function. See "Forward compatibility".

The new `data-page-side` attribute on the page `div` is purely for tests
(distinguishing front pages from back pages without coupling to CSS classes).
The existing `data-testid="page"` selector keeps working — current tests that
count pages just count both sides, which is what they want when the toggle is
on; tests that need to disambiguate filter by `data-page-side`.

### Tip phrasing

The tip lives next to the toggle. Phrasing chosen for parity with macOS /
Chrome print dialogs:

- 4-up portrait: *"For double-sided printing, choose **Flip on long edge** in
  the print dialog (sometimes labelled "Book")."*
- 2-up landscape: *"For double-sided printing, choose **Flip on short edge** in
  the print dialog (sometimes labelled "Tablet")."*

The geometry justifies the difference: in landscape, the right-edge mirror
*is* a short-edge flip on letter paper. The content-space mirror is the same
horizontal flip in both cases — only the dialog label changes.

## Forward compatibility (continuation-on-back)

The next iteration will let a multi-page card's continuation render as the
**back of its first page** instead of as a separate front-side card. To make
that change local:

- The `getBackContentFor(entry, perPage)` seam is the *only* place that
  decides what goes into a back slot. The future iteration changes this
  function to branch — if `entry` is page 1 of a multi-page item AND its
  page 2 sits in a known position, return page 2 rendered as a back-side
  `Card`; otherwise return `<CardBack />`.
- The imposition helper (`imposeBackPage`) stays untouched. It only knows
  about slot geometry, not back content.
- `useExpandedCards` will need to know that paired continuations should not
  consume their own front slot. That is the future iteration's problem; this
  spec deliberately does not pre-solve it. A follow-up issue will track it.

This boundary is the entire forward-compat investment. Pre-building any of
the future plumbing now is out of scope.

## Tests

- **`backImposition.test.ts`** (new):
  - `backSlotIndex(0, 2) === 1`, `backSlotIndex(1, 2) === 0`,
    `backSlotIndex(2, 2) === 3`, `backSlotIndex(3, 2) === 2` (covers 4-up).
  - `imposeBackPage(["A", "B", "C", "D"], 4, 2)` returns `["B", "A", "D", "C"]`.
  - `imposeBackPage(["A", "B"], 2, 2)` returns `["B", "A"]` (2-up).
  - `imposeBackPage(["A", "B", "C"], 4, 2)` returns
    `["B", "A", undefined, "C"]` (length 4, *dense*) when the partial last
    page has 3 fronts on a 4-slot grid. Assert both the length and that
    the empty slot at index 2 is `undefined`, not a sparse hole — a
    regression to a sparse array would silently break grid alignment. Use
    `Object.hasOwn(result, 2)` or `2 in result` to confirm density.

- **`CardBack.test.tsx`** (new):
  - Renders the resolved icon for a card whose `iconKey` is set explicitly
    (assert `data-testid="card-icon"` (or equivalent) contains the expected
    icon).
  - Renders the heuristic-picked icon for a card with no `iconKey`
    (re-uses `pickIconKey` so the assertion mirrors `Card.test.tsx`'s
    icon-related cases).
  - Renders the outer card frame (border) — sanity-check the root has the
    expected layout class for `cardsPerPage`.

- **`PrintView.test.tsx`** (extended):
  - Default behavior unchanged: with no toggle action, `getAllByTestId("page")`
    count matches existing assertions (regression guard for the toggle-off
    path).
  - With the "Print backs" switch flipped on, page count doubles (N front
    pages + N back pages). Filter by `[data-page-side="back"]` to assert
    back-only specifics.
  - Back pages place each card's back in the horizontally-mirrored slot of
    its front. Concretely: build 4 named cards, render at 4-up, toggle
    backs on, read the icon-bearing element from each back slot and assert
    the order matches `[B, A, D, C]`.
  - Partial last front page: build 3 cards at 4-up, toggle on, count
    `data-role="card-back-root"` elements on the back page — assert
    exactly 3 (the empty slot exists as an empty `.slot` div but renders no
    `CardBack`).
  - Tip visibility: with backs off, the layout tip ("flip on long edge"
    /"flip on short edge") is *not* rendered. With backs on, it is.
  - Tip phrasing matches the active layout: at 4-up the tip mentions "long
    edge"; switching to 2-up updates it to "short edge".

- **`Card.test.tsx`** — no change. Existing front rendering is untouched.

## Manual print verification (mandatory before declaring done)

CSS testing only confirms the DOM. The actual goal is paper that aligns when
duplexed. Before merging:

1. Print one sheet of 4-up portrait with backs enabled, duplex long-edge, on
   real paper.
2. Print one sheet of 2-up landscape with backs enabled, duplex short-edge,
   on real paper.
3. Hold each sheet up to the light and confirm backs land behind their fronts
   (within ~1 mm — printer tolerance, not ours).

If a home printer isn't available, single-sided front + single-sided back can
be printed and overlaid against a window as a proxy. Document the result in
the PR description.

## Risks / things to watch

- **Border / dimension drift between `Card` and `CardBack`.** Front and back
  must share `width`, `height`, border style, and border-radius byte-for-byte
  or duplex output won't align cleanly. Mitigation: redefine the same
  numeric values in `CardBack.module.css`, and watch for divergence in code
  review. If it shows up, extract `CardFrame` in the same PR — don't accept
  drift.
- **Toggle scope.** Per-deck persistence is deliberately out of scope; if a
  user complains the toggle "forgets" their preference, the answer is "yes,
  by design — it's a print-time choice." Revisit only if multiple users
  raise it.
- **Empty-slot rendering.** The mirror-only-populated rule depends on
  `imposeBackPage` returning `undefined` in empty slots, *and* the renderer
  branching on truthy. A reviewer should confirm both halves; a regression
  here prints orphan tiles.
- **Imposition vs. landscape geometry.** The content-space mirror is the
  same horizontal flip in both portrait and landscape; only the print-dialog
  label changes. The tip is the only layout-dependent piece. Don't over-engineer
  imposition to "know" about landscape — the helper is layout-agnostic.
- **The `data-page-side` attribute.** New in this iteration. Used only by
  tests. If it grows visual or behavioral semantics later, refactor — don't
  let test-only attrs accumulate domain meaning.
