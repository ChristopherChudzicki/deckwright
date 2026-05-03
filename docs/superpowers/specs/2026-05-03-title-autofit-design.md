# Title autofit on `<Card>`

## Problem

Some item names — "Flame Tongue Trident", "Ring of Spell Storing", etc. —
wrap to two lines at the current title size, often with a near-empty second
line that wastes header space (and pushes the body down). A modest font-size
nudge would let many of these collapse to one line, but currently the title
font is fixed.

A `AutoFitCard` wrapper used to scale the *whole card* via `--scale` to
recover from body overflow; it was removed when body pagination shipped
(commits `d6e9c7f` → `4bf6fa3`). This spec proposes a narrower analog: scale
only the title, only when it wraps.

## Solution

Inside `<Card>`, measure the rendered title after layout. If it spans more
than one line, try a smaller font-size. Step through `[1, 0.9, 0.8]`. If even
0.8 still wraps, give up and render at 1.0 with the wrap accepted. Apply the
result as an inline `font-size` on the `<h3>`.

## Scope

In scope:

- A `useLayoutEffect` block inside `Card.tsx` that owns the title-scale state.
- Inline `font-size` on the `<h3>` driven by that state.
- Resetting the state when `card.id`, `card.name`, or `cardsPerPage` changes.
- New unit tests on `Card.test.tsx` covering the three wrap-state branches.

Out of scope:

- Whole-card scaling (the body has pagination; only the title needs this).
- Reviving the deleted `AutoFitCard` wrapper. The new code lives inside
  `Card.tsx` because `Card` already manages its own non-trivial state (image
  error fallback) — adding one more local concern is cleaner than introducing
  a wrapper purely to host the effect.
- Feeding the autofit result back into `paginate.ts` / `measurer.ts`. The
  measurer renders titles at scale 1.0 (worst case), so pagination decisions
  remain conservative — see "Pagination interaction" below.
- Body, tag, or icon scaling.

## Behavior

### Algorithm

After every render that changes the title's measured layout:

1. Read `h3.offsetHeight` and `getComputedStyle(h3).lineHeight`.
2. Compute `lineCount = Math.round(offsetHeight / lineHeightPx)`.
3. If `lineCount === 1`, fixed point reached — keep current scale.
4. If `lineCount > 1`:
   - If current scale is `1.0`, set scale to `0.9`.
   - If current scale is `0.9`, set scale to `0.8`.
   - If current scale is `0.8`, transition to a `gave-up` terminal state
     (renders with no inline `font-size`, i.e. visually 1.0em, and the
     measurement loop bails on subsequent passes).

State machine in three steps gives at most 3 layout passes per card.

### Reset triggers

State resets to `unmeasured` when any of these change:

- `card.id` — different card
- `card.name` — title text changed (editor live-edit)
- `cardsPerPage` — card width changed (4-up vs 2-up have different available widths)

Implementation: a single `useLayoutEffect` owns both reset and measurement.
A `useRef<string | null>` tracks the last input key (`${card.id}:${card.name}:${cardsPerPage}`); when the effect runs and detects a key change, it resets `autofit` to `unmeasured` and returns. The next render then re-enters the effect and runs measurement. Folding both responsibilities into one layout effect avoids a race that would otherwise occur if reset lived in a separate `useEffect` (post-paint) while measurement was a `useLayoutEffect` (pre-paint) — the layout effect would fire first against stale state on rename.

### "Give up" semantics

If 0.8 still wraps, the state transitions to `gave-up` (a terminal state).
The rendered title carries no inline `font-size` and so renders at 1.0em.
Per the user's stated rule: "if it does need a second line, go back up to
1.0". Accepting wrap at 1.0 keeps title typography consistent with
non-wrapping titles in the same deck when shrinkage doesn't help anyway.
The terminal state (rather than transitioning back to `fitted{1}`) prevents
a 2-cycle that would otherwise loop the layout effect indefinitely.

### Visual consistency

Cards in the same deck may end up at 1.0, 0.9, or 0.8 — accepted by the user
because the small-caps title styling already differentiates titles
visually, and the variance only matters when paged together.

## Architecture

### Files

```
src/cards/
  Card.tsx               ← add useState + useLayoutEffect + ref
  Card.test.tsx          ← 3 new tests stubbing offsetHeight + line-height
```

No new files. No CSS changes — autofit is applied inline via `style={{ fontSize: ... }}`.

### Code shape

The state must track not just the current scale but whether we've already
given up — otherwise after wrapping at every scale the loop would oscillate
forever (1.0 → 0.9 → 0.8 → 1.0 → 0.9 → …). A `gave-up` terminal state
short-circuits the loop.

A single `useLayoutEffect` owns reset and measurement. A ref tracks the
last input key; on key change the effect resets and returns, deferring
measurement to the next render. This avoids a race that splitting reset
into a separate `useEffect` would introduce — see "Reset triggers" above.

```tsx
type AutofitState =
  | { kind: "unmeasured" }                   // initial; needs measurement
  | { kind: "fitted"; scale: 1 | 0.9 | 0.8 } // measurement says it fits at this scale
  | { kind: "gave-up" };                     // wrapped at every scale; render at 1.0

export function Card({ card, cardsPerPage, ... }: Props) {
  // … existing state …

  const titleRef = useRef<HTMLHeadingElement>(null);
  const [autofit, setAutofit] = useState<AutofitState>({ kind: "unmeasured" });
  const lastInputKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const inputKey = `${card.id}:${card.name}:${cardsPerPage}`;
    if (lastInputKeyRef.current !== inputKey) {
      lastInputKeyRef.current = inputKey;
      if (autofit.kind !== "unmeasured") {
        setAutofit({ kind: "unmeasured" });
        return;
      }
    }
    if (autofit.kind === "gave-up") return;
    if (autofit.kind === "fitted" && autofit.scale === 1) return;
    const el = titleRef.current;
    if (!el) return;
    const lineHeightPx = Number.parseFloat(getComputedStyle(el).lineHeight);
    if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return;
    const wraps = Math.round(el.offsetHeight / lineHeightPx) > 1;

    if (autofit.kind === "unmeasured") {
      setAutofit(wraps ? { kind: "fitted", scale: 0.9 } : { kind: "fitted", scale: 1 });
      return;
    }
    // autofit.kind === "fitted" with scale 0.9 or 0.8
    if (!wraps) return;
    if (autofit.scale === 0.9) setAutofit({ kind: "fitted", scale: 0.8 });
    else setAutofit({ kind: "gave-up" });
  }, [autofit, card.id, card.name, cardsPerPage]);

  const titleStyle =
    autofit.kind === "fitted" && autofit.scale !== 1
      ? { fontSize: `${autofit.scale}em` }
      : undefined;

  return (
    // …
    <h3 className={styles.title} ref={titleRef} style={titleStyle}>
      {card.name}
    </h3>
    // …
  );
}
```

Why this terminates:

- `unmeasured` → either `fitted{1}` or `fitted{0.9}` (1 transition)
- `fitted{0.9}` → either stays (no wrap) or `fitted{0.8}` (1 transition)
- `fitted{0.8}` → either stays (no wrap) or `gave-up` (1 transition)
- `fitted{1}` and `gave-up` early-return without setting state

Maximum chain from `unmeasured` is `unmeasured → fitted{0.9} → fitted{0.8} →
gave-up`, three state transitions, four layout passes. A reset (key change)
sends us back to `unmeasured` and the cycle can run again.

Notes:

- `[autofit, card.id, card.name, cardsPerPage]` deps mean the effect only
  runs when one of these changes, not on every parent re-render.
- `getComputedStyle` returns `lineHeight` either as `"normal"` or as a px
  string like `"19.55px"`. The CSS sets `line-height: 1.15` (unitless), so
  the computed value resolves to a px string in all browsers and jsdom.
  Defensive `isFinite/<=0` check guards against the rare `"normal"` case.

### Pagination interaction

`measurer.ts` renders an off-DOM scaffold with the title at the default scale
(no autofit; the scaffold's `<h3>` doesn't run any effects). The body fit
check therefore assumes a worst-case 1.0em title, which may be larger
vertically than the rendered card. Consequence: a card whose title actually
shrinks at render time has slightly more body room than the measurer
predicted. Pagination is conservative — in rare cases an item might be split
across two physical cards when it would have fit on one had the measurer
known about the title shrink.

**Decision: do not propagate autofit into the measurer.** Reasons:

1. Title shrinking from 2 lines to 1 line saves ~1.4em of header height. A
   card that splits at 1.4em-from-fit is uncommon.
2. Wiring the autofit into the measurer would require running the iterative
   scale-down inside the measurer's render path, which currently does
   single-pass DOM measurement. Significant complexity for a marginal win.
3. Worst-case behavior is "extra physical card" — same fallback the user
   already accepts when bodies overflow. No correctness issue.

## Testing

### New tests in `Card.test.tsx`

Each test stubs DOM measurement and asserts on the rendered inline style.

Stub helpers (defined per-test):

```ts
function stubTitleHeight(px: number) {
  Object.defineProperty(HTMLHeadingElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return this.classList.contains(/* styles.title hashed */) ? px : 0;
    },
  });
}
```

The single-line height is `1.15 * 1.2 * 17 ≈ 23.46px` for 4-up. We assert via
class match so only the title gets the stubbed height.

If `getComputedStyle(h3).lineHeight` returns `"normal"` in jsdom (it might —
jsdom's CSS resolution is partial), we'll need to also stub
`getComputedStyle` or set an explicit pixel `line-height` in a test-only
class. The implementation will pick whichever path actually works in jsdom;
the spec just guarantees the *behavior* below.

| Test | Stubbed offsetHeight | Expected outcome |
|---|---|---|
| Title fits on one line | ≈ single-line height (e.g. 23px) | h3 has no inline `font-size` |
| Title wraps, fits at 0.9 | 50px when scale=1, 22px when scale=0.9 | h3 has `style="font-size: 0.9em"` |
| Title wraps at every scale | 50px regardless of scale | h3 has no inline `font-size` (state lands on `gave-up`) |

The third test verifies the `gave-up` terminal state — the most subtle
behavior, and the one that prevents an infinite render loop.

### Tests not affected

- `paginate.test.ts` / `measurer.test.ts` — unchanged, since autofit doesn't
  touch the measurer.
- Existing `Card.test.tsx` cases render at fixed sizes; they don't stub
  offsetHeight, so the layout effect bails out (jsdom returns 0 for
  offsetHeight, lineCount = 0, no scale change).
- `PrintView.test.tsx` — same reasoning.

## Risks & non-risks

- **Infinite render loop:** addressed by the four-state machine in
  "Code shape". `fitted{1}` and `gave-up` are terminal — the layout effect
  bails out without setting state, breaking what would otherwise be a
  2-cycle (1.0 → 0.9 → 0.8 → 1.0 → 0.9 → …). Reset on key change clears
  `gave-up` back to `unmeasured` so editor live-edits get a fresh attempt.

- **jsdom `getComputedStyle` limitations.** As noted in Testing — if
  jsdom returns `lineHeight: "normal"`, the layout effect bails out (no
  scaling applied). For tests we stub measurements explicitly, so this
  doesn't bite. In real browsers `line-height: 1.15` resolves to a px value.

- **Print rendering.** `useLayoutEffect` runs in the browser before print.
  When the user invokes print, the screen-side rendered card is what gets
  printed (the `<Card>` is the same element). Title scale settles before
  the print snapshot. No print-specific path needed.

- **Editor live-edit.** As the user types in the title field, `card.name`
  changes → reset effect fires → scale resets to `unmeasured` → layout
  effect re-measures. One extra render per keystroke, all paint-aligned;
  no flicker because layout effects run before paint.
