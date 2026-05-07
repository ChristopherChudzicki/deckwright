# Item vs spell card differentiation

## Problem

`<Card>` currently renders item and spell cards with identical layout —
title block, body, footer — varying only the icon glyph. Players can't tell
the two types apart at a glance when scanning a deck or a printed sheet,
because nothing structural distinguishes them.

A second, related gap: the **custom card editor has no UI for picking
`kind`**. New cards are hard-coded to `kind: "item"` (`EditorView.tsx:53`),
and there's no way to change a card's kind after creation. API-imported
cards get the right kind from the import dialog, but custom-authored spell
cards aren't expressible at all today.

## Solution

Two changes, shipped together:

1. **A polygonal frame around the icon** in `<Card>`, distinct per kind:
   rounded square for items, flat-top hexagon for spells. The frame is the
   only visual difference between the two card kinds; everything else stays
   identical.
2. **A new "Type" segmented control** in `CardEditor`, inline with Name,
   that toggles `kind` between `item` and `spell`. Editable after creation.

## Scope

In scope:

- New frame element inside `.icon` in `Card.tsx`, rendered as a per-kind
  inline SVG `<polygon>` (rounded rect for items, hexagon for spells).
- CSS in `Card.module.css` to size and position the frame and to scale the
  inner glyph so the frame is visible without crowding.
- New "Type" field in `CardEditor.tsx` using the existing
  `ToggleButtonGroup` primitive, two `ToggleButton` options
  ("Item", "Spell"), inline with Name and Icon in the existing top row.
- `flex-wrap` on that row so Icon drops to its own line on narrow widths.
- Tests in `Card.test.tsx` for the per-kind frame, and in
  `CardEditor.test.tsx` for the Type control.

Out of scope:

- Changes to `kind`, `BaseCard`, persistence, schema, or migrations —
  `kind` already exists and is already serialized.
- `AbilityCard` rendering. `EditorView` already gates editing to
  `RenderableCard` and `<Card>` doesn't render abilities; nothing about
  abilities changes.
- Color, paper, or border changes to the card itself.
- Changes to the icon picker, `iconRules.ts`, or the Auto-pick dropdown.
- Changes to the default `kind: "item"` for new cards in `EditorView.tsx`.
- Print toolbar / `PrintView` changes — the card renders identically in
  preview and print.

## Behavior

### Frame visual

- **Item card:** rounded-square frame.
  - Stroke: `1.5px` solid in `--print-color-border-strong`.
  - Corner radius: `0.25em` (matches the visual feel of the card's outer
    `0.5em` corner at the smaller scale of the icon area).
- **Spell card:** flat-top hexagon frame.
  - Same stroke weight and color.
  - Rendered as an inline SVG with a single `<polygon>` element.
- **Both:**
  - Frame outer dimensions match the existing `.icon` size (`3em × 3em`).
  - Inner glyph scales to ~`72%` of the frame so a clear margin separates
    the SVG glyph from the surrounding stroke.
  - No fill — frame is transparent so the paper shows through.

The hexagon is rendered as SVG (not CSS `clip-path`) because SVG strokes
print reliably across browsers and PDF pipelines, while clip-path borders
can drop or rasterize unpredictably in print.

### Editor — Type control

- New "Type" `ToggleButtonGroup` with `selectionMode="single"` and
  `disallowEmptySelection`, containing two `ToggleButton` values: `item`
  and `spell`.
- Width compact (~120px). Sits inline between the existing `Name` and `Icon`
  fields in the top row of `CardEditor`. The row uses `flex-wrap: wrap` so
  Icon drops to a second line on narrow widths and Name keeps usable width.
- Editable at any time — switching Type updates `draft.kind` and
  `draft.updatedAt`. No other fields are mutated.
- The `ToggleButtonGroup`'s `selectedKeys` is a `Set<Key>`; the editor
  passes `new Set([card.kind])` and reads back the single selected key on
  change.

### Switching Type — what stays, what changes

- **Stays:** `name`, `body`, `headerTags`, `footerTags`, `iconKey`.
- **Changes:** `kind` (the discriminant) and `updatedAt`.
- `iconKey` is intentionally preserved on Type change. If the user
  explicitly picked a glyph (`iconKey` is set), keep it — replacing their
  choice silently would be surprising. If `iconKey` is `undefined` (the
  Auto-pick path), the next render runs `pickIconKey(card)` against the
  new kind and the icon updates automatically — `iconRules.ts:187` already
  branches on `card.kind === "spell"`. No editor code change is needed for
  this; it falls out of existing logic.

### `kind` widening

`CardEditor` is typed against `RenderableCard = ItemCard | SpellCard`, both
of which carry a discriminating `kind`. Changing `kind` at the
discriminant level requires constructing the appropriate variant on
update:

```ts
const handleKindChange = (next: "item" | "spell") => {
  if (next === card.kind) return;
  onChange({ ...card, kind: next, updatedAt: nowIso() } as RenderableCard);
};
```

The `as RenderableCard` cast is the cleanest expression; without it
TypeScript objects to changing the discriminant on a narrowed type. The
cast is sound because both `ItemCard` and `SpellCard` share the same
`BaseCard` field set — only `kind` differs.

## Architecture

### Files

```
src/cards/
  Card.tsx               ← render frame element inside .icon based on kind
  Card.module.css        ← frame styles (rounded-square + hex via SVG sizing)
  Card.test.tsx          ← assert per-kind frame element via data-testid
  CardEditor.tsx         ← new Type ToggleButtonGroup field
  CardEditor.module.css  ← row flex-wrap, type field width
  CardEditor.test.tsx    ← assert kind change via Type control
```

No new files. No changes to types, factories, or persistence.

### Code shape — `Card.tsx`

The icon block grows a frame element. The existing `<ResolvedIcon />`
becomes the inner glyph; a sibling SVG element renders the polygon frame
behind it.

```tsx
const isSpell = card.kind === "spell";

<div className={styles.icon} data-testid="card-icon" aria-hidden="true">
  <svg
    className={styles.iconFrame}
    viewBox="0 0 100 100"
    data-testid="card-icon-frame"
    data-frame={isSpell ? "hex" : "square"}
  >
    {isSpell ? (
      <polygon
        points="20,8 80,8 96,50 80,92 20,92 4,50"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    ) : (
      <rect
        x="3" y="3" width="94" height="94"
        rx="14" ry="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    )}
  </svg>
  <div className={styles.iconGlyph}>
    <ResolvedIcon iconKey={iconKey} />
  </div>
</div>
```

Both shapes use a `100×100` viewBox so the polygon coordinates are
straightforward and `strokeWidth="3"` gives a visually-equivalent ~1.5px
stroke when the SVG is rendered at `3em × 3em`. `currentColor` on the
stroke ties the frame to `--print-color-ink` via the existing `.icon`
color rule.

The square frame is also SVG (not CSS border) so both shapes share a
single sizing/positioning path and so screen-and-print rendering is
identical for both kinds.

### Code shape — `Card.module.css`

```css
.icon {
  /* existing rules: float right, 3em × 3em, color, etc. */
  position: relative;     /* new — anchors the absolutely-positioned children */
}

.iconFrame {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.iconGlyph {
  position: absolute;
  inset: 14%;             /* glyph occupies ~72% of the frame */
  display: flex;
  align-items: center;
  justify-content: center;
}
```

The existing `.icon svg { width: 100%; height: 100% }` rule continues to
apply to both child SVGs and needs no change — both fill their parent.
The icon area gains `position: relative` so the new absolutely-positioned
children anchor against it; the existing flex centering on `.icon`
becomes inert (no flex children) but is harmless to leave in place.

### Code shape — `CardEditor.tsx`

Adds a Type field between Name and Icon in the existing top row.

```tsx
<div className={styles.row}>
  <div className={styles.field}>
    <span className={styles.label} id={ids.typeLabel}>Type</span>
    <ToggleButtonGroup
      aria-labelledby={ids.typeLabel}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([card.kind])}
      onSelectionChange={(keys) => {
        const next = [...keys][0] as "item" | "spell";
        handleKindChange(next);
      }}
    >
      <ToggleButton id="item">Item</ToggleButton>
      <ToggleButton id="spell">Spell</ToggleButton>
    </ToggleButtonGroup>
  </div>
  <label className={styles.field} htmlFor={ids.name}>
    {/* existing Name field */}
  </label>
  <label className={styles.field} htmlFor={ids.icon}>
    {/* existing Icon field */}
  </label>
</div>
```

`handleKindChange` is the helper shown in
"Switching Type — what stays, what changes" above.

### Code shape — `CardEditor.module.css`

Two changes:

1. The existing `.row` rule gains `flex-wrap: wrap` so Icon drops to its
   own line on narrow widths.
2. The current `.row > .field:first-child { flex: 1 }` rule (which makes
   Name flex today because Name is currently the first child) is replaced
   by a class-based selector. With Type added as the new first child, a
   positional selector would target Type — which we want at fixed width.

```css
.row {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  flex-wrap: wrap;
}

.row > .nameField {
  flex: 1;
  min-width: 0;
}
```

Apply `styles.nameField` to the Name `<label>` in `CardEditor.tsx`. The
old `.row > .field:first-child` rule is removed.

## Testing

### `Card.test.tsx`

Two new tests:

| Test | Card | Assertion |
|---|---|---|
| Item card renders square frame | `makeItemCard()` | `getByTestId("card-icon-frame")` has `data-frame="square"` and contains a `<rect>` |
| Spell card renders hex frame | `makeSpellCard()` | `getByTestId("card-icon-frame")` has `data-frame="hex"` and contains a `<polygon>` |

Existing card tests (rendering name, body, tags, etc.) are unaffected —
the new frame is `aria-hidden`-wrapped (it's inside the existing
`aria-hidden` `.icon` div) and doesn't introduce new accessible content.

### `CardEditor.test.tsx`

One new test:

| Test | Action | Assertion |
|---|---|---|
| Switching Type from Item to Spell updates `draft.kind` | `userEvent.click` on the "Spell" toggle button | `onChange` last call's argument has `kind: "spell"` and unchanged `name`, `body`, `headerTags`, `footerTags`, `iconKey` |

Existing editor tests (name change, tag changes, body change) continue to
work — `onChange` shape is unchanged.

### Tests not affected

- `paginate.test.ts`, `measurer.test.ts`, `expandCard.test.ts` — no
  rendered-output changes that affect measurement.
- `iconRules.test.ts` — `pickIconKey` already branches on `kind`; this
  spec doesn't change rule logic.
- `PrintView.test.tsx` — preview rendering goes through `<Card>`, which
  picks up the new frame automatically.
- `factories.ts` and `factories.test.ts` — no factory changes needed.

## Risks & non-risks

- **Print fidelity.** The hexagon and rounded-square are SVG `stroke`-only
  shapes with `currentColor`. They print as part of the inline SVG just
  like the glyph itself does today. No new rasterization risk; no print
  CSS changes.

- **Icon glyph crowding.** The frame's `inset: 14%` reduces the glyph by
  ~28% on each axis. Existing icons are designed to fill their viewBox,
  so they get visually smaller but stay legible. If post-implementation
  review finds a specific glyph too small at 4-up, the inset can be
  tuned globally without per-glyph changes.

- **Type widening cast.** The `as RenderableCard` cast in
  `handleKindChange` is the only TypeScript escape hatch in the change.
  It's bounded — the only way to construct a `kind`-flipped value of
  `RenderableCard` from a narrowed input. Soundness comes from
  `BaseCard` carrying every field both variants share.

- **`AbilityCard` accidentally exposed.** The Type control offers only
  `item` and `spell`. The editor's existing `isRenderableCard` gate
  prevents `AbilityCard` from reaching the editor in the first place.
  No new path to author or convert into an `AbilityCard`.

- **Auto icon-pick re-running on Type change.** Existing behavior — when
  `iconKey` is `undefined`, `pickIconKey(card)` runs every render and
  branches on `card.kind`. After Type change the auto-pick refreshes;
  no new code, no flicker. If the user explicitly picked an icon
  (`iconKey` is set), the choice persists. Documented in
  "Switching Type — what stays, what changes" so the behavior is intentional.

- **Existing custom decks.** All custom cards in production today have
  `kind: "item"` (the only value the editor produces). After this ships
  they continue to render with the new rounded-square frame; no data
  migration, no visual surprise. Users can reclassify any custom card to
  `spell` via the new Type control.
