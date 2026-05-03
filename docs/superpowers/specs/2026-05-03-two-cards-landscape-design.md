# Two-cards-per-page prints landscape

## Problem

`PrintView` offers a `Cards per page` toggle with values `4` and `2`. The 4-up
mode produces a 2×2 grid of portrait 3.75″×5″ cards on portrait Letter — what
you'd expect. The 2-up mode produces a 1×2 stack of **7.5″×5″ landscape**
cards on portrait Letter, which is awkward: each card is wider than tall, and
the two modes look like different products. Users who want bigger printed
cards expect "2 per page" to mean "two normal cards, just larger" — not "two
cards rotated sideways."

## Solution

When a user picks 2-up, render the page in landscape with two **5″×7.5″
portrait** cards side-by-side. Same card aspect ratio as 4-up (a touch taller
proportionally), just bigger. Make the print dialog default to landscape
orientation via `@page { size: letter landscape }`. Update the on-screen sheet
preview to match.

## Scope

In scope:

- New CSS dimensions for `.perPage2`: 5″×7.5″ portrait card, 11″×8.5″ landscape page.
- `@page` rule that sets landscape page size when 2-up is active.
- Updated dropdown option labels in `PrintView.tsx`: `4 per page (portrait)`
  and `2 per page (landscape)`.
- Test updates where label/option text changed; new assertion that 2-up uses
  the landscape page class so the layout swap is observable.

Out of scope:

- A separate "2 per page (portrait)" mode. Not needed; clearer to have one
  shape per count.
- Changes to the 4-up layout, font sizes, or any non-`perPage2` CSS.
- Changes to `paginate.ts` / `measurer.ts`. The measurer reads real DOM
  dimensions, so the dimension change repaginates automatically.
- Changes to card content (header, body, footer, pagination indicator) — the
  same `<Card>` component renders in both modes via `cardsPerPage` class.

## Behavior

### Dimensions

| Mode | Page | Card | Grid | Card font-base |
|---|---|---|---|---|
| 4-up (unchanged) | 8.5″×11″ portrait | 3.75″×5″ portrait | 2 cols × 2 rows | 17px |
| 2-up (new) | **11″×8.5″ landscape** | **5″×7.5″ portrait** | **2 cols × 1 row** | 24px (unchanged) |

Page padding stays 0.5″ on all four sides. With landscape Letter that gives a
10″×7.5″ usable area, fitting two 5″×7.5″ cards edge-to-edge with the existing
1px kerf gap.

Card-base font stays at **24px**. The narrower column (5″ vs the old 7.5″)
already improves readability without shrinking the type.

### Print orientation

Add a `@page` rule scoped to the 2-up sheet:

```css
@media print {
  .perPage2Sheet {
    /* applied to a wrapper around the printed pages when perPage === 2 */
  }
  @page perPage2 { size: letter landscape; }
  .perPage2 { page: perPage2; }
}
```

Use [CSS named pages](https://developer.mozilla.org/en-US/docs/Web/CSS/@page)
so only 2-up pages claim landscape; the 4-up `@page` default remains portrait.
This means the print dialog locks orientation per page automatically — users
don't need to toggle it manually.

### On-screen preview

The `.page` element in the sheet preview switches dimensions based on which
class is applied:

- `.perPage4` → `width: 8.5in; height: 11in`
- `.perPage2` → `width: 11in; height: 8.5in`

Move the `width`/`height` declarations from `.page` (currently 8.5×11 always)
into the per-mode classes so each mode owns its own page size.

### Dropdown labels

Update the `<option>` text:

- `4 per page (portrait)` (was `4`)
- `2 per page (landscape)` (was `2`)

Drop the surrounding `Cards per page ` label text — the option text now
carries that info. Keep the `<select>` accessible by wrapping it in a label
with visually-hidden text or using an `aria-label` (which approach falls out
during implementation; both are equivalent for tests).

The `value` attribute stays `"4"` and `"2"` — only display text changes.

## Architecture

### Files

```
src/views/
  PrintView.tsx              ← option labels; remove "Cards per page" prefix; aria-label on select
  PrintView.module.css       ← move width/height into perPage4/perPage2; add @page named-page rule for perPage2
  PrintView.test.tsx         ← update label query; add assertion that the 2-up page uses the perPage2 class
src/cards/
  Card.module.css            ← swap perPage2 dimensions: 7.5×5 → 5×7.5
```

No new files. No changes to `Card.tsx`, `paginate.ts`, `measurer.ts`,
`useExpandedCards.ts`, or `expandCard.ts`.

### CSS layout sketch

`PrintView.module.css` after the change:

```css
.page {
  background: var(--print-color-paper);
  padding: 0.5in;
  box-sizing: border-box;
  display: grid;
  box-shadow: var(--print-shadow-page);
  page-break-after: always;
  break-after: page;
}

.perPage4 {
  width: 8.5in;
  height: 11in;
  grid-template-columns: 3.75in 3.75in;
  grid-template-rows: 5in 5in;
  gap: 1px;
  justify-content: center;
  align-content: center;
}

.perPage2 {
  width: 11in;
  height: 8.5in;
  grid-template-columns: 5in 5in;
  grid-template-rows: 7.5in;
  gap: 1px;
  justify-content: center;
  align-content: center;
}

@media print {
  @page perPage2 { size: letter landscape; }
  .perPage2 { page: perPage2; }
}
```

`Card.module.css` after the change:

```css
.perPage2 {
  --card-base: 24px;
  --card-width: 5in;
  --card-height: 7.5in;
}
```

### Side effect: pagination

`measurer.ts` builds an off-screen card with the `perPage2` class and reads
`scrollHeight`/`clientHeight` of the body slot. When the body's clientHeight
grows from ~3.5″ to ~6″, more text fits per card, and items that previously
spanned multiple physical cards may collapse to one. This is a desirable
consequence of the dimension change, not a separate change in pagination
logic. No code edits in `paginate.ts` / `measurer.ts`.

## Testing

### Updated tests

`src/views/PrintView.test.tsx`

The existing 2-up test queries `getByLabelText(/cards per page/i)`. Once we
drop the literal "Cards per page" prefix, this query needs an updated source.
Replace with `getByRole("combobox", { name: /cards per page/i })` and set the
select's `aria-label` to `"Cards per page"`. The select's value-by-option
selection (`selectOptions(..., "2")`) still works because option `value`
stays `"2"`.

Add one new assertion to that same test (or a sibling test): after switching
to 2-up, the rendered `[data-testid="page"]` element carries the `perPage2`
class. This locks in the layout swap.

```tsx
test("2-up pages use the landscape layout class", async () => {
  // setup: 2 cards, switch dropdown to "2"
  const pages = screen.getAllByTestId("page");
  expect(pages[0].className).toMatch(/perPage2/);
});
```

CSS module class names are hashed at build time but Vitest's CSS modules
plugin emits readable class names that include the source name (e.g.
`_perPage2_abc123`), so the regex match is stable.

### Tests not affected

- `Card.test.tsx` exclusively renders with `cardsPerPage={4}`. No edits.
- All other `PrintView.test.tsx` cases use 4-up or test pagination shape, not
  dimensions.

## Risks & non-risks

- **`@page size: letter landscape` browser support:** Honored by Chrome,
  Safari, Firefox, Edge. Named pages are well-supported. No fallback needed —
  worst case (some browser ignores it) the page prints portrait but the cards
  still lay out correctly horizontally because the page element is fixed at
  11″×8.5″; users would manually flip orientation as they do today.
- **Pagination drift:** Existing data in dev/prod hasn't been migrated, but
  pagination is a render-time concern — re-rendering a deck in 2-up after
  this change just produces fewer continuation cards for long entries.
  Nothing persists.
- **Visual regression on the on-screen sheet preview:** the preview gets
  noticeably wider in 2-up (11″ instead of 8.5″). On narrow screens this may
  trigger horizontal scroll inside `.sheet`. Acceptable — the sheet preview
  is a print-fidelity surface, not a responsive UI.
- **Print output is flagged as sensitive in `CLAUDE.md`** (absolute units,
  4-per-sheet output). This change leaves 4-per-sheet untouched — only the
  `perPage2` path moves.
