# Item vs Spell Card Differentiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually differentiate item and spell cards via a per-kind icon frame (rounded square / flat-top hexagon), and add a Type segmented control to `CardEditor` so custom cards can be authored as spells.

**Architecture:** Add a per-kind inline SVG frame element inside the existing `.icon` block in `Card.tsx` (rounded-rect for items, polygon for spells). Add a `ToggleButtonGroup`-based Type field to `CardEditor.tsx`, inline with Name and Icon, sharing the existing top row with `flex-wrap` so Icon drops to its own line on narrow widths. No type, schema, or persistence changes — `kind` already exists on `BaseCard`.

**Tech Stack:** React 18 + TypeScript, react-aria-components, CSS modules, Vitest + RTL + `@testing-library/user-event`.

**Reference spec:** `docs/superpowers/specs/2026-05-07-card-type-differentiation-design.md`

---

## File map

**Modify:**

- `src/cards/Card.tsx` — render per-kind frame inside `.icon` block
- `src/cards/Card.module.css` — frame styles; `.icon { position: relative }`
- `src/cards/Card.test.tsx` — assert frame `data-frame` attribute per kind
- `src/cards/CardEditor.tsx` — new Type field using `ToggleButtonGroup`
- `src/cards/CardEditor.module.css` — `flex-wrap` on `.row`; replace `:first-child` with explicit `.nameField`
- `src/cards/CardEditor.test.tsx` — assert kind change via Type control

**No new files. No type, schema, factory, or migration changes.**

---

## Order of work

Two independent tracks; the Card visual goes first because it's foundation (the editor's preview will reflect the new frame as soon as Type is wired).

1. **Task 1** — Per-kind icon frame on `<Card>`
2. **Task 2** — Type segmented control on `<CardEditor>`
3. **Task 3** — Final verification

Each task is one commit. The suite stays green after each task.

---

## Task 1: Per-kind frame around the icon in `<Card>`

**Files:**

- Modify: `src/cards/Card.tsx` (icon block, around lines 71–73)
- Modify: `src/cards/Card.module.css` (`.icon` rule, plus two new classes)
- Modify: `src/cards/Card.test.tsx` (two new tests)

- [ ] **Step 1: Write the failing tests in `Card.test.tsx`**

Add these two tests inside the existing `describe("<Card>", …)` block. The frame is a new element identified by `data-testid="card-icon-frame"` carrying a `data-frame="square" | "hex"` attribute.

```tsx
test("renders a rounded-square frame for an item card", () => {
  const card = itemCardFactory.build();
  render(<Card card={card} cardsPerPage={4} />);
  const frame = screen.getByTestId("card-icon-frame");
  expect(frame).toHaveAttribute("data-frame", "square");
  expect(frame.querySelector("rect")).not.toBeNull();
});

test("renders a hexagon frame for a spell card", () => {
  const card = spellCardFactory.build();
  render(<Card card={card} cardsPerPage={4} />);
  const frame = screen.getByTestId("card-icon-frame");
  expect(frame).toHaveAttribute("data-frame", "hex");
  expect(frame.querySelector("polygon")).not.toBeNull();
});
```

`itemCardFactory` and `spellCardFactory` are already imported at the top of the file. No new imports.

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npm test -- Card.test
```

Expected: 2 failing tests, both with messages like `Unable to find an element by: [data-testid="card-icon-frame"]`. All previously-passing tests still pass.

- [ ] **Step 3: Update the icon block in `Card.tsx`**

Replace lines 71–73 (the current icon `<div>` containing only `<ResolvedIcon />`):

```tsx
<div className={styles.icon} data-testid="card-icon" aria-hidden="true">
  <ResolvedIcon iconKey={iconKey} />
</div>
```

with:

```tsx
<div className={styles.icon} data-testid="card-icon" aria-hidden="true">
  <svg
    className={styles.iconFrame}
    viewBox="0 0 100 100"
    data-testid="card-icon-frame"
    data-frame={card.kind === "spell" ? "hex" : "square"}
  >
    {card.kind === "spell" ? (
      <polygon
        points="20,8 80,8 96,50 80,92 20,92 4,50"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    ) : (
      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        rx="14"
        ry="14"
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

The frame is `aria-hidden` by virtue of being inside the existing `aria-hidden` `.icon` div — no new accessible content.

- [ ] **Step 4: Update `Card.module.css`**

Add `position: relative` to the existing `.icon` rule, and add two new classes immediately after it.

Replace the existing `.icon` rule (lines 32–42):

```css
.icon {
  float: right;
  margin: 0 0 -0.1em 0.4em;
  width: 3em;
  height: 3em;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--print-color-paper);
  color: var(--print-color-ink);
}
```

with:

```css
.icon {
  float: right;
  margin: 0 0 -0.1em 0.4em;
  width: 3em;
  height: 3em;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--print-color-paper);
  color: var(--print-color-ink);
  position: relative;
}

.iconFrame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.iconGlyph {
  position: absolute;
  inset: 14%;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

The existing `.icon svg { width: 100%; height: 100% }` rule (lines 44–47) stays — it applies to both child SVGs (the frame and the glyph), and both should fill their parents.

- [ ] **Step 5: Run the Card tests to verify they pass**

```bash
npm test -- Card.test
```

Expected: all tests pass — both new frame tests plus all previously-passing tests (the existing `card-icon` `<div>` is unchanged, so existing assertions on it still work).

- [ ] **Step 6: Visually verify in the dev server**

Run `npm run dev`, open a deck containing both an item and a spell. Confirm:

- The item card shows a thin rounded-square outline around its icon.
- The spell card shows a thin flat-top hexagon outline around its icon.
- The glyph isn't crowded against the frame — there's visible margin between glyph and stroke.

If the glyph looks too small, you can tune `.iconGlyph { inset: <value>% }` (smaller % = larger glyph). 14% is the spec-recommended starting point.

- [ ] **Step 7: Commit**

```bash
git add src/cards/Card.tsx src/cards/Card.module.css src/cards/Card.test.tsx
git commit -m "feat(card): per-kind icon frame (rounded-square for items, hex for spells)"
```

---

## Task 2: Type segmented control in `<CardEditor>`

**Files:**

- Modify: `src/cards/CardEditor.tsx` (new field + imports + new handler)
- Modify: `src/cards/CardEditor.module.css` (`.row` flex-wrap; replace `:first-child` with `.nameField`)
- Modify: `src/cards/CardEditor.test.tsx` (one new test)

- [ ] **Step 1: Write the failing test in `CardEditor.test.tsx`**

Add this test inside the existing `describe("<CardEditor>", …)` block:

```tsx
test("switching Type from Item to Spell updates kind without losing other fields", async () => {
  const card = itemCardFactory.build();
  const seen: RenderableCard[] = [];
  render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

  const itemRadio = screen.getByRole("radio", { name: "Item" });
  const spellRadio = screen.getByRole("radio", { name: "Spell" });
  expect(itemRadio).toBeChecked();
  expect(spellRadio).not.toBeChecked();

  await userEvent.click(spellRadio);

  const last = seen[seen.length - 1];
  expect(last?.kind).toBe("spell");
  expect(last?.name).toBe(card.name);
  expect(last?.body).toBe(card.body);
  expect(last?.iconKey).toBe(card.iconKey);
  expect(spellRadio).toBeChecked();
});
```

`getByRole("radio", { name: ... })` works because `react-aria-components`' `ToggleButton` inside a single-selection `ToggleButtonGroup` exposes `role="radio"` — see `src/lib/ui/ToggleButtonGroup.test.tsx:16` for precedent.

`itemCardFactory` and `RenderableCard` are already imported. No new imports.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- CardEditor.test
```

Expected: FAIL with `Unable to find an accessible element with the role "radio" and name "Item"`.

- [ ] **Step 3: Add `ToggleButton`/`ToggleButtonGroup` imports to `CardEditor.tsx`**

At the top of `CardEditor.tsx`, add to the existing imports from `../lib/ui/...`:

```tsx
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
```

- [ ] **Step 4: Add `handleKindChange` to `CardEditor.tsx`**

After the existing `handleFooterTagsChange` handler (currently around line 35), add:

```tsx
const handleKindChange = (next: "item" | "spell") => {
  if (next === card.kind) return;
  onChange({ ...card, kind: next, updatedAt: nowIso() } as RenderableCard);
};
```

The `as RenderableCard` cast is necessary because TypeScript narrows `card` (a `RenderableCard`) to a specific variant by `kind`, and changing the discriminant on a narrowed value requires an explicit widening. Both variants share the same `BaseCard` field set, so the cast is sound — it's documented in the spec.

- [ ] **Step 5: Add a `typeLabel` id to the `ids` object**

In the `ids` object inside the component (currently around lines 42–53), add:

```tsx
const ids = {
  name: `${idBase}-name`,
  headerTags: `${idBase}-headerTags`,
  headerTagsLabel: `${idBase}-headerTagsLabel`,
  headerTagsHelp: `${idBase}-headerTagsHelp`,
  icon: `${idBase}-icon`,
  body: `${idBase}-body`,
  bodyHelp: `${idBase}-bodyHelp`,
  footerTags: `${idBase}-footerTags`,
  footerTagsLabel: `${idBase}-footerTagsLabel`,
  footerTagsHelp: `${idBase}-footerTagsHelp`,
  typeLabel: `${idBase}-typeLabel`,
};
```

- [ ] **Step 6: Insert the Type field as the first child of `<div className={styles.row}>`, and add `nameField` class to Name**

Replace the entire `<div className={styles.row}>` block (currently lines 57–75):

```tsx
<div className={styles.row}>
  <label className={styles.field} htmlFor={ids.name}>
    <span className={styles.label}>Name</span>
    <Input
      id={ids.name}
      value={card.name}
      onChange={handle("name")}
      placeholder="Untitled item"
    />
  </label>
  <label className={styles.field} htmlFor={ids.icon}>
    <span className={styles.label}>Icon</span>
    <div className={styles.iconRow}>
      <IconPreview iconKey={resolvedKey} label={resolvedKey} size="md" />
      <IconPickerDialog id={ids.icon} value={card.iconKey} onChange={handleIconChange} />
    </div>
    {showHint && <div className={styles.iconHint}>Currently auto-picking: {resolvedKey}</div>}
  </label>
</div>
```

with:

```tsx
<div className={styles.row}>
  <div className={styles.field}>
    <span className={styles.label} id={ids.typeLabel}>
      Type
    </span>
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
  <label className={`${styles.field} ${styles.nameField}`} htmlFor={ids.name}>
    <span className={styles.label}>Name</span>
    <Input
      id={ids.name}
      value={card.name}
      onChange={handle("name")}
      placeholder="Untitled item"
    />
  </label>
  <label className={styles.field} htmlFor={ids.icon}>
    <span className={styles.label}>Icon</span>
    <div className={styles.iconRow}>
      <IconPreview iconKey={resolvedKey} label={resolvedKey} size="md" />
      <IconPickerDialog id={ids.icon} value={card.iconKey} onChange={handleIconChange} />
    </div>
    {showHint && <div className={styles.iconHint}>Currently auto-picking: {resolvedKey}</div>}
  </label>
</div>
```

The Type field is a `<div>` (not `<label>`) because there's no inner form control to hook an HTML `<label>` to; accessibility goes through `aria-labelledby` on the `ToggleButtonGroup` pointing at the `<span>` id.

- [ ] **Step 7: Update `CardEditor.module.css`**

Replace the existing `.row` and `.row > .field:first-child` rules at the bottom of the file:

```css
.row {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.row > .field:first-child {
  flex: 1;
  min-width: 0;
}
```

with:

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

The class-based selector replaces the positional one because Type is now the first child and we want Name (the second child) to flex.

- [ ] **Step 8: Run the CardEditor tests to verify the new test passes**

```bash
npm test -- CardEditor.test
```

Expected: all tests pass — the new test plus all previously-passing tests (Name and Icon fields are unchanged in behavior, only repositioned).

- [ ] **Step 9: Visually verify in the dev server**

Run `npm run dev`. Open the editor on a new card:

- The editor top row now shows `Type | Name | Icon`.
- The Type control is a two-segment toggle showing "Item" selected by default.
- Click "Spell" — the preview pane switches from rounded-square to hex frame (relies on Task 1 already being merged).
- Type a name and edit the body — both still work.
- Switch back to "Item" — frame returns to rounded-square; name and body are preserved.
- Resize the window narrow — the Icon field wraps to its own line and Name keeps usable width.
- Save the card and reopen it from the deck list — the kind persists.

- [ ] **Step 10: Commit**

```bash
git add src/cards/CardEditor.tsx src/cards/CardEditor.module.css src/cards/CardEditor.test.tsx
git commit -m "feat(editor): Type segmented control for switching item/spell"
```

---

## Task 3: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests green.

- [ ] **Step 2: Build (type-check + bundle)**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: End-to-end smoke test in the browser**

Run `npm run dev`. Walk through each path:

- **API import — spell:** Open Browse → import a spell → confirm hex frame in deck and in print preview.
- **API import — item:** Open Browse → import an item → confirm rounded-square frame.
- **Custom create:** New card → defaults to Item (rounded-square).
- **Toggle Type:** Switch to Spell → frame updates in preview; switch back → frame returns.
- **Persistence:** Save a custom Spell card → navigate away → reopen → Type still "Spell", frame still hex.
- **Print preview:** From deck view, open print preview → both frames render in the printed sheet.
- **Narrow width:** Shrink the window → editor row wraps gracefully; Name stays sized.

- [ ] **Step 4: Confirm spec coverage**

Re-read `docs/superpowers/specs/2026-05-07-card-type-differentiation-design.md` and confirm each item is implemented:

- Per-kind frame (rounded-square / hexagon) — Task 1 ✓
- SVG-rendered (not clip-path) — Task 1 Step 3 ✓
- Stroke ~1.5px (`strokeWidth="3"` on a 100×100 viewBox at 3em) — Task 1 Step 3 ✓
- Glyph at ~72% of frame (`inset: 14%`) — Task 1 Step 4 ✓
- Type `ToggleButtonGroup` inline with Name/Icon — Task 2 Step 6 ✓
- `flex-wrap` so Icon drops on narrow widths — Task 2 Step 7 ✓
- Type editable after creation — Task 2 Step 4 ✓
- `iconKey` preserved on kind change — Task 2 Step 4 (handler only mutates `kind` + `updatedAt`) ✓
- Default kind unchanged (`item` in `EditorView.tsx:53`) — no change made ✓
- No schema/migration changes — none made ✓

---

## Self-review

**Spec coverage:** every section of the spec maps to a task above. The "stays/changes" rules in the spec map to the `handleKindChange` body in Task 2 Step 4 plus the test assertions in Task 2 Step 1.

**Type consistency:** `handleKindChange` signature, `data-testid="card-icon-frame"`, `data-frame` attribute values (`"square"` / `"hex"`), and `nameField` class name are used identically across code, CSS, and tests.

**Placeholder scan:** every step contains complete code or an exact command. No "TBD", no "implement later", no "similar to Task N".
