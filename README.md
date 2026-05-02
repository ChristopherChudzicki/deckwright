# D&D Cards

A browser app for creating and printing **D&D 5e item cards** with a legibility-first design.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build
- `npm test` — run Vitest suite
- `npm run lint` — Biome lint + format check
- `npm run lint:fix` — auto-fix lint + format

## How to print

1. Create cards at `/` and `/editor/:id`.
2. Go to `/print`.
3. Choose 2 or 4 cards per page.
4. Click **Print**. In the browser print dialog, set **Margins: None** and uncheck **Headers and footers** for a tight fit.

## Design system

UI styling is driven by CSS custom-property tokens defined in [`src/index.css`](src/index.css). Components reference tokens via `var(--name)`; **no hardcoded colors, font sizes, or spacing values** in component CSS modules. The card visual and print view are intentionally exempt — they target physical print dimensions in absolute units.

**Stack**

- [`react-aria-components`](https://react-spectrum.adobe.com/react-aria/) for accessible interactive primitives (Dialog, Menu, ToggleButtonGroup, etc.).
- CSS modules. No styled-components, emotion, MUI, Tailwind, or shadcn.
- Self-hosted Inter (body) and Cinzel (display headings) via fontsource.

**Token scopes** — `src/index.css` defines two namespaces: screen tokens (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--fs-*`, etc.) used by all screen UI, and print tokens (`--print-*`) used only by `Card` and `PrintView`. Never reference `--print-*` in screen UI.

**Shared primitives** live in `src/lib/ui/`: buttons, inputs, textarea, switch, toggle buttons, dialogs, icon picker, and user menu. See [`src/lib/ui/README.md`](src/lib/ui/README.md) for the full primitive catalog, the wrapper pattern, and conventions.

**Conventions**

- Reach for tokens first; if one is missing, add it to `src/index.css` rather than inlining a hex.
- React Aria buttons use `onPress` (not `onClick`) and `isDisabled` (not `disabled`).
- Tests use `getByRole(...)` queries — React Aria primitives expose accurate ARIA roles.

For rationale, see the [UI refinement spec](docs/superpowers/specs/2026-04-29-ui-refinement-design.md).

## Project docs

- Design: [`docs/superpowers/specs/2026-04-19-dnd-cards-design.md`](docs/superpowers/specs/2026-04-19-dnd-cards-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-04-19-dnd-cards-v1.md`](docs/superpowers/plans/2026-04-19-dnd-cards-v1.md)

Deck data is persisted in Supabase (decks + cards tables, gated by row-level security on the deck owner). For local development, run a local Supabase via `supabase start` and use the **dev** sign-in button on the login page (creates `dev@local` / `devpass` on first run). You can also **Import JSON / Export JSON** from the deck view.
