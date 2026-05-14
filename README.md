# Deckwright

A browser app for creating and printing **D&D 5e item and spell cards** with a legibility-first design. Lives at [deckwright.org](https://deckwright.org).

## Run locally

**Prerequisites:**

- Docker (for the local Supabase stack)
- [`just`](https://github.com/casey/just) — `brew install just`
- [`pre-commit`](https://pre-commit.com/) — `brew install pre-commit`

**First-time setup:**

```bash
pre-commit install
just start
```

Then open http://localhost:5173. On the login page, use the **dev** sign-in button (creates `dev@local` / `devpass` on first run).

`just` recipes are thin wrappers around npm scripts; running npm directly works too.

## Database

`just start` brings up a local Supabase stack (`supabase start`) and applies all migrations (`supabase migration up`). The Vite dev server's [`scripts/vite-supabase-env.ts`](scripts/vite-supabase-env.ts) plugin injects the local Supabase URL and anon key at boot, so a `.env.local` file is only needed when pointing local dev at a non-local Supabase.

- **Add a migration:** `npx supabase migration new <name>`
- **Reset the local database:** `npx supabase db reset`
- **Regenerate DB types after a migration:** `npm run gen:db-types` (requires the local stack from `just start`). `src/api/database.types.ts` is committed; CI's `check:db-types` step fails the build if it drifts from the schema.
- **Deploy to production:** migrations apply automatically via [`.github/workflows/deploy-db.yml`](.github/workflows/deploy-db.yml) on merges to `main` that touch `supabase/migrations/**`.

**Schema:** `decks` and `cards` tables, gated by row-level security on the deck owner.

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

## Card body markdown

Item and spell bodies render as Markdown (CommonMark + GFM tables) and are sanitized with DOMPurify before injection. Supported: paragraphs, **bold**, _italic_, `inline code`, bullet/numbered lists, tables. The single chokepoint is [`src/cards/renderBody.ts`](src/cards/renderBody.ts) — both the on-screen card and the offscreen pagination measurer call it, so what's measured for cross-card pagination is byte-identical to what prints.

## Project docs

- Design: [`docs/superpowers/specs/2026-04-19-dnd-cards-design.md`](docs/superpowers/specs/2026-04-19-dnd-cards-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-04-19-dnd-cards-v1.md`](docs/superpowers/plans/2026-04-19-dnd-cards-v1.md)

## Credits

Spell and magic-item data bundled in this app is derived from the System Reference Document 5.1 and System Reference Document 5.2 by Wizards of the Coast LLC, available at [dndbeyond.com/srd](https://www.dndbeyond.com/srd), licensed under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).

Huge thanks to the [Open5e](https://open5e.com) project — Deckwright's SRD content is sourced from their curated API at [api.open5e.com](https://api.open5e.com). Open5e does the unglamorous work of turning the SRD into clean, queryable JSON; without that, this app would have been a much longer project.
