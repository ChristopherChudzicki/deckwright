# Print-settings panel — design

## Problem

The print-settings strip in `PrintView.tsx` currently renders all controls
(cards-per-page select, print-backs toggle, print button, two tip strings) on
one wrapping flex row against the page background. At typical widths it's
hard to scan, the helptext competes with the call-to-action, and there's no
visual separation from the rest of the page. The "Print" button doesn't read
as the primary action.

## Goals

- Group the controls into a clearly demarcated panel, separated from the page
  background.
- Stack the controls vertically into purposeful rows.
- Make "Print" feel like the page's hero action.
- Tie each helptext to the control it documents.

## Non-goals

- Changing what gets printed, paper sizes, layouts, or the back-imposition.
- Restructuring `PrintView` beyond the controls strip.
- Adding new dependencies or major design-system pieces. (One small addition:
  a `size="lg"` option on the existing `Button` primitive.)

## Layout

Replace the single-row `.controls` div with a panel containing three rows:

```
┌─ Print settings (panel) ───────────────────────────────────────┐
│  Cards per page   [4 per page (portrait) ▾]                    │
│                                                                 │
│  ◯ Print backs                                                  │
│      Adds a second page of card backs for double-sided print.   │
│      (when on:) In the print dialog, choose Flip on long edge   │
│      (sometimes labelled Book).                                 │
│                                                                 │
│  ┌─ Print ─┐  Tip: in the print dialog, choose Margins: None    │
│  └─────────┘  and uncheck Headers and footers for best results. │
└─────────────────────────────────────────────────────────────────┘
```

**Container.** A panel using existing tokens — no new colors/spaces:

- `background: var(--color-surface-2)` (beige, distinct from `--color-bg`)
- `border: 1px solid var(--color-border)`
- `border-radius: var(--radius-md)`
- `padding: var(--space-4)`
- `margin-bottom: var(--space-4)` (separates from the sheet preview)

**Row 1 — Cards per page.**
A real `<label>` containing the text "Cards per page" + the existing native
`<select>`. The current `aria-label="Cards per page"` is removed (now
redundant). Test selectors that use `getByRole("combobox", { name: /cards per
page/i })` continue to match because the visible label provides the
accessible name.

**Row 2 — Print backs.**
The existing `<Switch>` primitive on the left with children "Print backs". A
helptext block sits beneath the switch, indented to align under the toggle's
label, in `--fs-sm` and `--color-text-faint`:

- Always-visible static line: "Adds a second page of card backs for
  double-sided printing."
- Conditional second line, only when `printBacks` is on: "In the print
  dialog, choose *Flip on {long edge}* (sometimes labelled *{Book}*)." —
  same `flipEdge` / `flipLabel` derivation already in the file. Existing
  tests in `PrintView.test.tsx` pin the conditional behavior of the
  "long edge" / "short edge" copy; this preserves it.

**Row 3 — Print + tip.**
The existing `<Button variant="primary">` with a new `size="lg"` (see Design
system below). To the right of the button, the general margins/headers tip in
`--fs-sm` / `--color-text-faint`. Row uses `display: flex; align-items: center;
gap: var(--space-3); flex-wrap: wrap;` so the tip wraps below the button on
narrow widths.

The button's existing `isDisabled={printable.length === 0}` is unchanged.

**Empty state.** "No printable cards in this deck yet." stays after the panel
and before the sheet preview.

## Design system

The `Button` primitive currently exposes `size: "sm" | "md"`. Add
`size: "lg"`:

- TypeScript: `ButtonSize = "sm" | "md" | "lg"`.
- CSS: `.btn[data-size="lg"] { padding: var(--space-3) var(--space-5);
  font-size: var(--fs-lg); }`. Both tokens already exist in `src/index.css`.
- README catalog (`src/lib/ui/README.md`): update the Button row's "Sizes"
  list.

Used by exactly one call site today (the Print button). Earns its place per
the README's "second consumer is reasonably likely" guideline — a hero CTA is
a recurring need.

## Print-time behavior

Unchanged. The existing `@media print { .controls { display: none } }` rule
hides the strip; the renamed `.panel` class inherits that — the rule's
selector becomes `.panel` (or both, during the rename).

## Tests

`PrintView.test.tsx` already covers the main interactions through ARIA roles
and visible text. Verify these still pass without modification:

- `getByRole("combobox", { name: /cards per page/i })` — works with a real
  `<label>` wrapping the select.
- `getByRole("switch", { name: /print backs/i })` — unchanged; the Switch's
  children still provide the accessible name.
- The "long edge" / "short edge" presence-and-absence tests still match the
  conditional helptext.

No new tests required. The visual change is layout-only; behavior is
preserved.

## Risks

- **Switch helptext alignment.** RAC's `<Switch>` puts the label as a child
  next to the indicator. Aligning the helptext "under the label" requires the
  helptext to be a sibling element styled with a left margin equal to the
  indicator + gap. A `<div>` after the `<Switch>` with `padding-left` works.
- **The `.controls` → `.panel` class rename** changes the CSS selector that
  hides the strip when printing; the new selector must match.
