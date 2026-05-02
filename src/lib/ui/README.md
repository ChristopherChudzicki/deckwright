# UI primitives

Thin wrappers around `react-aria-components` (and a couple of native elements) that own the project's design language: tokens for color/space/radius, the standard `--color-focus-ring` outline, and consistent ARIA roles so tests can use `getByRole`.

## Catalog

| Primitive | Use when |
|---|---|
| `Button` | Any button. Variants: `primary`, `secondary`, `danger`. Sizes: `sm`, `md`. |
| `IconButton` | An icon-only button. Pass an SVG component as children. |
| `OAuthButton` | A sign-in button branded for an OAuth provider. |
| `Input` | A single-line text field. |
| `Textarea` | A multi-line text field. |
| `Switch` | An on/off toggle with a track + thumb. Children are the label. |
| `ToggleButton` | A toggleable button (alone or inside a `ToggleButtonGroup`). |
| `ToggleButtonGroup` | A segmented selector — wraps `ToggleButton` children. |
| `DialogShell` | The outer scaffolding (overlay + modal + dialog) for any modal. |
| `DialogHeader` | The standard header strip for any dialog: title, optional middle slot, close X. |
| `LoadingState` | A centered "Loading…" indicator (`role="status"`). Use whenever a view is waiting on a query. |
| `EmptyHero` | A centered hero block for page-level empty states: title + optional description + actions. Inline "no rows yet" notes can stay as plain `<p>` — reach for this when the empty state replaces a whole view. |
| `IconPickerDialog` | The game-icons picker (used by the card editor). |
| `IconPreview` | A static icon render. |
| `UserMenu` | The signed-in user dropdown. |

## Wrapper pattern

Each primitive follows the same shape. `Button.tsx` is the canonical reference:

```tsx
import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";
import styles from "./Button.module.css";

export type ButtonProps = Omit<RACButtonProps, "className"> & {
  className?: string;
};

export function Button({ className, ...rest }: ButtonProps) {
  return (
    <RACButton
      {...rest}
      className={[styles.btn, className].filter(Boolean).join(" ")}
    />
  );
}
```

**Why `Omit<..., "className">` then re-add `className?: string`:** RAC's `className` is `string | ((values) => string)` — it supports a render-function form for state-based classes. Our merge logic (`[styles.x, className].filter(Boolean).join(" ")`) assumes a string. Stripping RAC's wider type and re-adding the narrower one prevents callers from passing a function and silently producing garbage class names.

## Tokens

Primitive CSS uses tokens for color, space, radius, shadow, and font. Component-internal geometry — focus outline width, switch track size, modal max-width, transition timing, etc. — may stay as literals when no semantic token fits. The litmus test: would multiple primitives ever share this value? If yes, tokenize it. If it's intrinsic to one component's visual identity, a literal is fine.

Two scopes for tokens:

- **Screen tokens** (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--fs-*`, etc.) — used by everything in `src/lib/ui/` and most of `src/views/`.
- **Print tokens** (`--print-*`) — used only by `src/cards/Card.tsx` and `src/views/PrintView.tsx` (sheet preview half). Never reference these in screen UI.

## Testing

Tests live next to the primitive (`Foo.tsx` + `Foo.test.tsx`). Conventions:

- `getByRole(...)` over text/class selectors. RAC primitives expose accurate ARIA roles.
- `userEvent` over `fireEvent`.
- For controlled props, write a small `Harness` component that owns state.
- Factories pass no values they don't assert on.

## When to add a new primitive

A wrapper earns its place in `src/lib/ui/` when:

- It's a recognized design-system pattern (Input, Switch, Tooltip, Toggle, etc.) — its shape is well-known.
- At least one current consumer needs it, and a second is reasonably likely.

If only one consumer is using a pattern and the shape is novel/exploratory, leave it inline and document it as the canonical reference. Extract once a second consumer appears (or sooner if the primitive's shape is obvious from its name).

## A note on labels and Biome

Biome's `noLabelWithoutControl` rule can't see through wrapper components. The **implicit** labeling pattern below is valid HTML/a11y (the browser auto-associates a `<label>` with any form control nested inside it), but Biome flags it because it can't introspect `<Input>`:

```tsx
// Valid HTML/a11y at runtime — but Biome flags lint/a11y/noLabelWithoutControl
<label className={styles.field}>
  <span className={styles.label}>Name</span>
  <Input value={...} onChange={...} />
</label>
```

The workaround is the **explicit** labeling pattern with `useId` for collision-free ids:

```tsx
const idBase = useId();
const id = `${idBase}-name`;
// ...
<label className={styles.field} htmlFor={id}>
  <span className={styles.label}>Name</span>
  <Input id={id} value={...} onChange={...} />
</label>
```

Both forms are spec-valid; we use the explicit form purely to satisfy the linter. See `src/cards/ItemEditor.tsx` for a full multi-field example.
