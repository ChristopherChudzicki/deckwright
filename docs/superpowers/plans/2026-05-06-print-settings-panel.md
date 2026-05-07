# Print-settings panel polish — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the print-settings controls into a clearly demarcated panel with three rows (cards-per-page select, print-backs toggle + helptext, hero Print button + tip), and add a `size="lg"` variant to the `Button` primitive to support the hero CTA.

**Architecture:** Two changes. (1) Extend `Button` with a third size, `"lg"`, in both the TypeScript union and `Button.module.css`, plus a documentation update. (2) Restructure `src/views/PrintView.tsx` and `src/views/PrintView.module.css` to render the controls inside a bordered beige panel with three vertical rows. No behavior changes — every existing PrintView test should pass without modification.

**Tech Stack:** React 18 + TypeScript + Vite, `react-aria-components` (Button + Switch), CSS modules with screen tokens (`--color-surface-2`, `--color-border`, `--space-*`, `--fs-lg`, etc.), Vitest + RTL + `@testing-library/user-event`.

**Spec:** `docs/superpowers/specs/2026-05-06-print-settings-panel-design.md`

**Conventions for the executor:**
- Per `CLAUDE.md`: `npm test`, `npm run dev`, `npm run build` are pre-approved; ask before `npm install`.
- Biome's formatter is authoritative — accept its reformatting.
- Default to no comments. Only add one when the WHY is non-obvious.
- Tests use `getByRole(...)` over text/class selectors.
- Don't push or create PRs.
- Work happens on the existing `card-backs` branch (the spec was committed there).

---

## Task 1: Add `size="lg"` to the Button primitive

The hero Print button needs a larger size than the existing `sm`/`md`. Extend the primitive in three places: the TypeScript union, the CSS, and the README catalog.

**Files:**
- Modify: `src/lib/ui/Button.tsx`
- Modify: `src/lib/ui/Button.module.css`
- Modify: `src/lib/ui/Button.test.tsx`
- Modify: `src/lib/ui/README.md`

- [ ] **Step 1: Add a failing test for the lg size**

In `src/lib/ui/Button.test.tsx`, append a new test inside the existing `describe("<Button>", ...)` block:

```tsx
  it("applies size='lg' via data-size", () => {
    render(<Button size="lg">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("data-size", "lg");
  });
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npm test -- --run src/lib/ui/Button.test.tsx`

Expected: FAIL with a TypeScript error — `size="lg"` isn't assignable to `"sm" | "md"`.

- [ ] **Step 3: Extend `ButtonSize` in `Button.tsx`**

In `src/lib/ui/Button.tsx`, change:

```ts
export type ButtonSize = "sm" | "md";
```

to:

```ts
export type ButtonSize = "sm" | "md" | "lg";
```

- [ ] **Step 4: Add the `lg` CSS rule**

In `src/lib/ui/Button.module.css`, after the `.btn[data-size="md"]` block (around line 29), add:

```css
.btn[data-size="lg"] {
  padding: var(--space-3) var(--space-5);
  font-size: var(--fs-lg);
}
```

Both `--space-5` (1.5rem) and `--fs-lg` (1.125rem) are already defined in `src/index.css`.

- [ ] **Step 5: Run the test, confirm pass**

Run: `npm test -- --run src/lib/ui/Button.test.tsx`

Expected: PASS — all four Button tests green.

- [ ] **Step 6: Update the README catalog**

In `src/lib/ui/README.md`, change the Button row:

```markdown
| `Button` | Any button. Variants: `primary`, `secondary`, `danger`. Sizes: `sm`, `md`. |
```

to:

```markdown
| `Button` | Any button. Variants: `primary`, `secondary`, `danger`. Sizes: `sm`, `md`, `lg`. |
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui/Button.tsx src/lib/ui/Button.module.css src/lib/ui/Button.test.tsx src/lib/ui/README.md
git commit -m "feat(ui): add Button size='lg' variant"
```

---

## Task 2: Restructure the PrintView controls into a three-row panel

Wraps the controls in a bordered beige panel; splits them onto three rows; pairs each helptext with the control it documents; bumps the Print button to `size="lg"`. No behavior changes — `PrintView.test.tsx` continues to pass unmodified.

**Files:**
- Modify: `src/views/PrintView.tsx`
- Modify: `src/views/PrintView.module.css`

- [ ] **Step 1: Run the existing PrintView tests, confirm they all pass before changes**

Run: `npm test -- --run src/views/PrintView.test.tsx`

Expected: PASS — 12 tests green. This is the baseline; the goal is to keep them green after the refactor.

- [ ] **Step 2: Replace the JSX in PrintView.tsx**

In `src/views/PrintView.tsx`, replace the entire `<div className={styles.controls}>...</div>` block (lines 45–74 in the current file) with this new structure:

```tsx
      <div className={styles.panel}>
        <label className={styles.row}>
          <span className={styles.rowLabel}>Cards per page</span>
          <select
            className={styles.select}
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value) as CardsPerPage)}
          >
            <option value={4}>4 per page (portrait)</option>
            <option value={2}>2 per page (landscape)</option>
          </select>
        </label>

        <div className={styles.row}>
          <Switch isSelected={printBacks} onChange={setPrintBacks}>
            Print backs
          </Switch>
          <div className={styles.helptext}>
            <p>Adds a second page of card backs for double-sided printing.</p>
            {printBacks && (
              <p>
                In the print dialog, choose <em>Flip on {flipEdge}</em> (sometimes labelled{" "}
                <em>{flipLabel}</em>).
              </p>
            )}
          </div>
        </div>

        <div className={styles.row}>
          <Button
            variant="primary"
            size="lg"
            onPress={() => window.print()}
            isDisabled={printable.length === 0}
          >
            Print
          </Button>
          <span className={styles.tip}>
            Tip: in the print dialog, choose <em>Margins: None</em> and uncheck{" "}
            <em>Headers and footers</em> for best results.
          </span>
        </div>
      </div>
```

Note: the `aria-label="Cards per page"` is removed because the visible `<label>` now provides the accessible name. The `getByRole("combobox", { name: /cards per page/i })` test selector continues to match.

- [ ] **Step 3: Update PrintView.module.css**

In `src/views/PrintView.module.css`, replace the entire `.controls` block and the `.controls select` / focus rules (lines 1–24) with this new structure. Leave the `.tip`, `.sheet`, `.page`, `.perPage*`, `.slot`, and `@media print` blocks alone — only the controls section changes.

```css
/* === Screen-only UI (hidden in @media print) === */

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.rowLabel {
  font-weight: 500;
}

.select {
  font: inherit;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.select:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.helptext {
  font-size: var(--fs-sm);
  color: var(--color-text-faint);
  flex-basis: 100%;
  /* Indent under the switch so the helptext visually belongs to the toggle.
     Switch indicator (~2.4rem) + gap covers the offset. */
  padding-left: var(--space-6);
  margin: 0;
}

.helptext p {
  margin: 0;
}

.helptext p + p {
  margin-top: var(--space-1);
}

.tip {
  font-size: var(--fs-sm);
  color: var(--color-text-faint);
}
```

- [ ] **Step 4: Update the print-time hide rule**

In the same `PrintView.module.css`, the `@media print` block's selector still references `.controls`. Update it to match the renamed class.

Find:

```css
@media print {
  .controls {
    display: none;
  }
```

Replace with:

```css
@media print {
  .panel {
    display: none;
  }
```

- [ ] **Step 5: Run PrintView tests, confirm all pass**

Run: `npm test -- --run src/views/PrintView.test.tsx`

Expected: PASS — same 12 tests green. Specifically:
- The `combobox` cards-per-page selector still works (real label provides accessible name).
- The `switch` print-backs selector still works (Switch children unchanged).
- The "long edge" / "short edge" presence-and-absence tests still match the conditional `<p>` inside `.helptext`.

If any test fails, stop and inspect — the most likely cause is a stale class reference. Don't add new tests; behavior is preserved.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: PASS across the project (no regressions in unrelated suites).

- [ ] **Step 7: Build + visual smoke check**

Run: `npm run build`

Expected: clean build.

Then ask the user before running: `npm run dev`. Open a deck, click into Print view. Confirm:
- Beige panel surrounds the controls, separated from the page background.
- Three rows: dropdown alone, toggle + helptext, large Print button + tip.
- Toggle "Print backs" off → only the static description ("Adds a second page…") is visible under the switch.
- Toggle on → second line "In the print dialog, choose Flip on long edge…" appears below the static line.
- Switch dropdown to "2 per page (landscape)" with toggle on → second line updates to "short edge" and "Tablet".
- Print button is visibly larger and primary-colored.

Stop the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add src/views/PrintView.tsx src/views/PrintView.module.css
git commit -m "feat(print): regroup controls into a bordered settings panel"
```

---

## Task 3: Final integration check

Defense-in-depth: verify the full project state.

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS across the project.

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: clean build, no missing-token or missing-class warnings.

- [ ] **Step 3: Confirm branch state**

```bash
git log --oneline main..HEAD | head -5
```

Expected: a short, clean sequence of commits — the spec doc, the Button `lg` variant, and the PrintView panel restructure. Plus any pre-existing card-backs commits that were already on the branch.

If everything checks out, the work is ready for the user to push and update the PR (per `CLAUDE.md`, the executor does not push or create PRs without explicit instruction).
