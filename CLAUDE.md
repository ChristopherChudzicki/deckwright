# CLAUDE.md

Project-specific guidance for AI coding sessions on this repo. Read alongside `README.md`.

## Stack

- React 18 + TypeScript + Vite, TanStack Router + TanStack Query.
- `@supabase/supabase-js` for auth + persistence; no other backend code.
- Biome for lint + format. CSS modules for styling.
- Vitest + RTL + `@testing-library/user-event`. MSW for HTTP mocks. Fishery + faker for factories.

## Design system

See README's "Design system" section for the full picture. Short version:

- **Screen tokens** live in `src/index.css` (`--color-*`, `--space-*`, `--radius-*`, etc.). All screen UI references them; no inline hexes/rems in scope.
- **Print-scoped tokens** are namespaced `--print-*` and used only by printable card components (`Card`, `PrintView`). They never apply to screen UI.
- Use `react-aria-components` for new interactive primitives. **No** emotion / styled-components / MUI / Tailwind / shadcn.
- Shared UI primitives live in `src/lib/ui/`. Before hand-rolling any input, button, dialog, switch, or toggle, check `src/lib/ui/README.md` — there's almost certainly an existing primitive.
- The card preview shown in the editor renders the same `<Card>` component as `PrintView`, so screen preview matches print output exactly.
- Card bodies render as Markdown via `src/cards/renderBody.ts` (`marked` → DOMPurify with a strict allowlist). Both `<Card>` and the offscreen `measurer.ts` call this helper. Don't bypass it or expand the allowlist without thinking through pagination + XSS.

## CSS module typing

- `*.module.css` class names are **type-checked**. `@css-modules-kit/codegen` (`cmk`) emits per-file `.d.ts` into the gitignored `generated/` dir (overlaid via `rootDirs` in `tsconfig.app.json`), so `styles.typo` is a real `tsc` error, not `string`.
- `npm run gen:css` regenerates them; `build` and `typecheck` run it first, and a `PostToolUse` hook in `.claude/settings.json` reruns it whenever you edit a `*.module.css`. So after adding a class you can use `styles.newClass` immediately — no manual step.
- The regen hook fires only on `*.module.css` edits, not `.tsx`. So when a class is flagged "does not exist on type": if it's already in the `.module.css`, the dts is just stale → run `npm run gen:css`. If it isn't in the `.module.css` yet (or the name is a typo), the error is **real** → add the class or fix the name. Don't reflexively revert the usage.

## Tests

- Prefer `getByRole(...)` over text/class selectors. React Aria primitives expose accurate ARIA roles.
- Factories pass no values they don't assert on. Don't write `factory.build({ name: "Foo" })` unless the test reads `name`.
- Tests sit next to the file they cover (`Foo.tsx` + `Foo.test.tsx`).

## Code

- Default to no comments. Add one only when the WHY is non-obvious (a hidden constraint, a workaround, behavior that would surprise a reader).
- Don't add features, refactors, or abstractions beyond what the task requires.
- Don't add error handling for cases that can't happen — trust internal code.
- Biome's formatter is authoritative — if it reformats your output, accept the reformatting.

## Working norms

- `npm test`, `npm run dev`, and `npm run build` are pre-approved — run them as needed. Ask before `npm install` (or other dependency changes).
- Address review nits inline in the same task — don't accumulate a deferred cleanup pass.
- Don't use `git -C <path>` — run git from the working directory.
- Don't push or create PRs without explicit instruction.

## Sensitive — proceed carefully

- **Print output**: `src/cards/Card.tsx`, the printed sheet preview half of `src/views/PrintView.module.css`, and `@page` / `@media print` rules. These target physical paper dimensions in absolute units; visual changes can break 4-per-sheet output. The screen toolbar inside `PrintView.tsx` is ordinary screen UI — that's fine to refactor.
- **Database schema and RLS policies**: changes go through `supabase/migrations`. Don't edit live tables or bypass migrations.
