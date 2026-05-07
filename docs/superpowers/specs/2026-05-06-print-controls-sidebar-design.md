# Print controls as a left sidebar

## Problem

The current `PrintView` controls live in a wide horizontal panel above the
sheet preview. With only three controls (cards-per-page select, Print backs
switch, Print button), the panel reads as asymmetric and empty — controls hug
the left, the Print button sits awkwardly inline, and most of the panel's
horizontal space is dead.

The shape is wrong, not the contents. Functionally the controls work; the
layout doesn't carry them.

## Goals

- Move the controls into a sticky left sidebar next to the sheet preview.
- The sidebar holds the same three controls plus the same two helptexts (the
  "second page of card backs" hint and the "Margins: None" tip), reorganized
  vertically.
- Sheet preview takes the remaining horizontal space.
- The layout works at common laptop viewports without horizontal overflow.

## Non-goals

- Mobile-first redesign. PrintView is desktop-leaning; a single
  narrow-viewport fallback (stack vertically) is the only responsive treatment.
- Persisting controls state across visits. Per-visit local state stays.
- Refactoring the sheet preview itself, the page emission, or the print
  output. Only the controls move.
- Changing the controls' accessible names or roles. Existing tests pin those
  via `getByRole`.

## Approach

PrintView's outermost element becomes a 2-column CSS grid: a 14rem sticky
sidebar on the left, a `1fr` column on the right that contains the existing
sheet preview unchanged. The sidebar carries the existing panel chrome
(cream `--color-surface-2` background, border, radius); only its placement
and internal layout change.

PrintView opts into a wider page container — 1400px instead of the global
1200px — so the 2-up landscape sheet (1056px) still fits next to a 14rem
sidebar without horizontal overflow at common laptop viewports.

Below ~1300px viewport, the grid collapses to a single column (sidebar
above, sheet below). At that width, the side-by-side layout would overflow
horizontally, so we fall back to the current vertical arrangement.

## Architecture

### Container widening

`.main` in `src/app/root.module.css` learns one extra rule that scopes the
wider container to PrintView only:

```css
.main:has([data-print-view]) {
  max-width: 1400px;
}
```

PrintView's root element carries `data-print-view`. `:has()` is stable in
all evergreen browsers (Chrome 105+, Safari 15.4+, Firefox 121+). No JS, no
context, no new mechanism beyond a CSS selector.

The existing `@media print` override in `root.module.css`
(`max-width: none`) is unaffected — print runs ignore screen container
constraints.

### Sidebar layout

PrintView's root is a CSS grid:

```css
.root {
  display: grid;
  grid-template-columns: 14rem 1fr;
  gap: var(--space-5);
  align-items: start;
}

@media (max-width: 1299px) {
  .root {
    grid-template-columns: 1fr;
  }
}
```

The sidebar is a vertical flex column inside that grid cell, with
`position: sticky; top: var(--space-5)` so it pins to the viewport's top
once scrolled past. Stickiness works because the ancestor chain
(`.shell → .main → .root → .sidebar`) has no `overflow: hidden`.

Inside the sidebar:

1. **Cards per page** — a `<label htmlFor="...">` above its `<select>` (a
   small wiring change from today's `<label>` *wrapping* the select; the
   visual layout is now stacked, not inline).
2. **Print backs** — `Switch` from `src/lib/ui/Switch.tsx`, followed by the
   helptext block. The helptext shows the always-on hint
   (*"Adds a second page of card backs..."*) and conditionally the
   duplex-flip tip when the switch is on. Same conditional logic as today.
3. A horizontal rule (`<hr>`) using `border-top: 1px solid
   var(--color-border)` for visual separation between settings and action.
4. **Print button** — `<Button variant="primary" size="lg">` with
   `width: 100%` so it spans the sidebar.
5. **Margins tip** — small muted text (`--fs-sm`,
   `--color-text-muted`).

The sheet column on the right is the existing `.sheet` div, unchanged.
Pages continue to center within the column. Today's `align-items: center`
on `.sheet` keeps working — the sheet now centers in its grid cell rather
than the full main container.

### Component structure changes in `PrintView.tsx`

Today's flat structure (`.panel` followed by `.sheet`) becomes a `.root`
grid wrapping a `.sidebar` and the existing `.sheet`. The tip-and-toggle
JSX block from today's `.panel` moves verbatim into the new `.sidebar` div,
restructured into the five-item vertical column above. No changes to state,
queries, or page emission.

The `data-print-view` attribute on the root is the only new DOM hook beyond
the container restructure.

## Tests

The existing PrintView tests query by accessible role — `getByRole("switch",
{ name: /print backs/i })`, `getByRole("combobox", { name: /cards per page/i })`,
`getByRole("button", { name: /print/i })`. These survive the layout change
unchanged, since the controls' accessible names are preserved.

One test gap worth filling: at present nothing pins that the sidebar's
`Cards per page` label is associated with the select. Today's wrapping
`<label>` makes the association implicit; the new `htmlFor` + `id` makes it
explicit. The role-based query catches both, so the existing
`getByRole("combobox", { name: /cards per page/i })` is sufficient — no new
test needed.

No new behavioral tests. This is a layout reorganization with no new
functionality. The full PrintView test suite running green is the
regression check.

## Risks

- **`:has()` is novel here.** No prior usage in the codebase. If it ever
  needs to grow (e.g., other routes wanting wider containers), document the
  pattern in `README.md` under "Design system". For now, one selector in
  one file is fine.
- **Sticky positioning silently fails on `overflow: hidden` ancestors.**
  Verified clean today; if a future change adds `overflow: hidden` to
  `.shell`, `.main`, or PrintView's root, the sidebar will stop sticking
  and there's no error. A code-review note when touching these elements is
  the only mitigation.
- **2-up sheet at the edge of the right column.** The right column at
  1400px container width is 1400 − 14rem(224) − var(--space-5)(24) − padding
  ≈ 1100px. The 2-up sheet is 1056px. Tight but fits. If the container ever
  shrinks (e.g., if the global main padding grows), the 2-up case is what
  breaks first.

## Forward compatibility

If this layout pattern ever spreads to other "layout-heavy" routes (e.g., a
deck-print preview, a sheet designer), extract the wide-container `:has()`
rule and the grid scaffold into a small CSS pattern documented under the
design system. Don't pre-extract — one consumer is not a pattern.
