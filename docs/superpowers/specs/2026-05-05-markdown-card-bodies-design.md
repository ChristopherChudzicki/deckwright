# Markdown card bodies

## Problem

Card bodies render as plain text. The `body` field is split on blank lines and each paragraph is wrapped in `<p>`; nothing else is interpreted. But the SRD JSON we already ship contains real markdown — italic emphasis (`_plane shift_`), bold (`**_Curse_**`), bullet lists, and GFM tables for items like *Armor of Resistance* (damage-type table) and *Belt of Giant Strength* (stats table). Today those characters print literally, which is both ugly and wrong.

## Goal

Render card bodies as markdown so SRD-imported items show their formatting correctly, while keeping the editor a plain `<textarea>` (no rich-text controls) for now. Pagination across multiple physical cards must continue to work, and the printed card and the offscreen measurer must produce identical DOM.

## Scope

In:

- Inline: bold, italic, inline code.
- Block: paragraphs (already supported), bullet/numbered lists, GFM tables.
- Existing plain-text bodies render unchanged (markdown's paragraph rule already matches today's `\n\n` split).

Out:

- Headings, blockquotes, horizontal rules, fenced code blocks, links, images, footnotes, raw HTML.
- A WYSIWYG or markdown-shortcut editor (textarea stays plain).

Restricting the supported subset gives us a small, predictable visual vocabulary on a 3.75″×5″ card, and lets sanitization be aggressive (see *Sanitization*).

## UX

- The editor's body field stays a textarea with no markdown affordances. (No help text added in this iteration; can be revisited if the format isn't discoverable enough.)
- The card preview in the editor renders the markdown live, same as today's preview render path (it shares `<Card>` with `PrintView`).
- Inline emphasis renders as bold / italic. Lists render with appropriate margins. Tables render with thin borders, modest cell padding, and inherit `--print-color-*` tokens.
- Backward compatibility: existing cards' plain-text bodies render identically to today, because `\n\n` is already a paragraph break in markdown and bare prose with no markdown tokens passes through unchanged.

## Architecture

```
body string
  ├─ marked(body)            → HTML string (CommonMark + GFM tables)
  ├─ DOMPurify.sanitize(html) → safe HTML string (whitelist subset)
  └─ injection:
       ├─ Card.tsx                — dangerouslySetInnerHTML on .body
       └─ measurer.ts             — el.innerHTML on the body slot

paginate.ts
  ├─ blocks = splitTopLevelBlocks(body)
  ├─ greedy-fit blocks onto each physical card
  └─ if a single block exceeds a card:
       ├─ paragraph → word-boundary fit (today's algorithm)
       ├─ list      → list-item-boundary fit
       └─ table     → atomic (overflows; rare, accepted)
```

### Library choices

- **`marked`** for markdown → HTML. Configured with GFM enabled (for tables). No raw HTML passthrough.
- **`dompurify`** to sanitize the HTML before injection. Whitelist scoped to the elements we actually render (see below).

Total added bundle weight: ~40kb gzipped. Two `npm install`s — user must approve.

Alternatives considered:

- *`react-markdown` + `remark-gfm`*: more idiomatic but the offscreen measurer would need ReactDOM rendering, adding moving parts with no visible benefit. Rejected.
- *`markdown-it` with its built-in safe mode*: viable, but DOMPurify is still the right tool for the secondary user-content path, and `marked` is smaller. Rejected.
- *`marked` alone without DOMPurify*: even with `marked`'s `mangle: false` and no-raw-HTML config, it still passes through `javascript:` URLs in any links or images we'd later allow. Defense in depth wins. Rejected.

### Sanitization

`DOMPurify.sanitize` is configured with an explicit allowlist matching our supported subset:

```ts
const ALLOWED_TAGS = [
  "p", "strong", "em", "code",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
  "br",
];
const ALLOWED_ATTR = ["start"];
```

`start` is allowlisted so that ordered-list continuation chunks can carry their original numbering across a card boundary (`marked` emits `<ol start="N">` when the source's first item isn't `1.`). It has no security-relevant meaning on other elements.

This is configured in a single helper, `renderBody(text: string): string` at `src/cards/renderBody.ts`, that both `Card.tsx` and `measurer.ts` call. A single source of truth means measurer and card are guaranteed identical.

### `Card.tsx`

Replace:

```tsx
{splitParagraphs(bodyText).map((p) => (
  <p key={p}>{p}</p>
))}
```

with:

```tsx
<div
  className={styles.bodyContent}
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify in renderBody
  dangerouslySetInnerHTML={{ __html: renderBody(bodyText) }}
/>
```

The `bodyContent` wrapper exists so CSS selectors like `.bodyContent > p:first-child` can drop top margin without affecting the outer flex container.

The `splitParagraphs` helper is removed (its job moves into `marked`).

### `measurer.ts`

`setBodyContent` replaces its manual `<p>` building with:

```ts
const setBodyContent = (el: HTMLElement, text: string) => {
  el.innerHTML = renderBody(text);
};
```

No other change to the measurer's structure.

### `paginate.ts`

The function signature stays the same. The internals change from "word-fit on raw text" to "block-fit, with sub-pagination fallbacks":

```ts
export function paginateBody(opts: {
  body: string;
  measureFirst: PaginateMeasurer;
  measureContinuation: PaginateMeasurer;
}): string[];
```

**New algorithm:**

1. If `body === ""` return `[""]`.
2. If `measureFirst(body)` is true, return `[body]`.
3. Split body into top-level blocks on blank-line boundaries (`/\n\s*\n/`). Each block is one of: paragraph, list, table. Classification by lookahead at the first non-whitespace char of the block — `|` → table, `*`/`-`/`+`/`\d+. ` → list, otherwise paragraph.
4. Greedy-fit blocks onto card 1 (binary-search the largest prefix of the block list whose `\n\n`-joined string still passes `measureFirst`).
5. If even the first block alone doesn't fit, sub-paginate that block:
   - Paragraph: word-boundary binary search (today's algorithm).
   - List: split-point binary search where split points are item boundaries (line starts matching `^(\s*)([-*+]|\d+\.)\s+`). A nested item (greater leading whitespace than the outer item) is bound to its parent and not eligible as a split point — keeps an item with its sub-bullets together.
   - Table: atomic. If a table alone doesn't fit, accept the overflow. Document this as known.
6. Repeat for continuation cards using `measureContinuation` until `body` is consumed.

**Block classification details:**

- A line starting with `|` followed by another `|`-line classifies the block as a table. Whole table is one block.
- A block whose first non-whitespace line starts with `* `, `- `, `+ `, or `\d+. ` is a list; subsequent lines (including indented continuations) are part of the same list block.
- Anything else is a paragraph.

**Single-token-too-long fallback** (existing): if word-fit returns 0 words, fall back to character-boundary fit for that one chunk.

### `Card.module.css`

Add rules under `.body` for the new elements, all using `--print-*` tokens. Sketch:

```css
.bodyContent > :first-child { margin-top: 0; }
.bodyContent > :last-child { margin-bottom: 0; }

.body p { margin: 0 0 0.5em; }

.body ul, .body ol { margin: 0 0 0.5em; padding-left: 1.25em; }
.body li { margin: 0 0 0.15em; }
.body li:last-child { margin-bottom: 0; }

.body strong { font-weight: 700; }
.body em { font-style: italic; }
.body code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.92em;
}

.body table {
  border-collapse: collapse;
  width: 100%;
  margin: 0 0 0.5em;
  font-size: 0.92em;
}
.body th, .body td {
  border: 1px solid var(--print-color-border);
  padding: 0.15em 0.35em;
  text-align: left;
}
.body th { font-weight: 600; }
```

Final values tuned during implementation against representative SRD bodies.

### Editor

`CardEditor.tsx` is unchanged. The body remains a `<Textarea>`.

## Data

No schema migration. `body` stays `string`. Existing cards render identically since plain prose has no markdown tokens.

## Edge cases

- **Empty body** — `paginateBody` returns `[""]`. `renderBody("")` returns `""`.
- **Mixed plain prose + tokens that look like markdown** — accepted as the cost of opt-in markdown semantics. Documented behavior.
- **Single block too tall after sub-pagination** — only happens for tables (atomic). Body overflow is visually clipped, same as pre-pagination behavior. Rare per project owner.
- **Trailing/leading whitespace on chunks** — joined chunks must remain valid markdown. The block splitter trims each block, so re-joining with `\n\n` is safe.
- **Ordered list across a split** — chunks preserve the source's number markers (`4. ...`), so `marked` sets the continuation list's start correctly without us emitting a `start` attribute (which would be stripped by the sanitizer anyway).

## Testing

All Vitest + jsdom; no new test framework.

- `renderBody.test.ts` — new. Covers: plain prose passes through, bold/italic/code, list, table, sanitization (script tag stripped, javascript: URL stripped, raw HTML stripped, allowlisted tags survive).
- `paginate.test.ts` — extend. Covers:
  - Existing cases continue to pass (plain prose word-fit fallback).
  - Multi-block body splits at block boundaries.
  - List too tall splits at item boundaries; ordered-list numbers preserved.
  - Nested list item not used as a split point.
  - Table block treated as atomic.
- `Card.test.tsx` — add: bold/italic/list/table render in the DOM (`getByRole("table")`, `getByRole("list")`, etc.). Existing plain-body assertions continue to pass.
- `measurer.test.ts` — add: feeding markdown into the body slot produces the same DOM shape as `Card`. (Snapshot the relevant innerHTML or compare element counts.)

## Risks

- **Bundle weight.** ~40kb gzipped (`marked` + `dompurify`). Acceptable; this is a print-oriented app, not a perf-critical landing page.
- **Pagination measurement drift.** If the new CSS rules for lists/tables interact badly with `scrollHeight` measurement (e.g., margin collapsing), pagination might miscount. Mitigated by the existing offscreen-measurer pattern (real Card DOM, real CSS) and by extending `measurer.test.ts` to cover markdown bodies.
- **Sanitizer over-stripping.** A too-aggressive allowlist removes legitimate output. Mitigated by `renderBody.test.ts` covering each supported feature end-to-end.
- **User content surprise.** A user who typed `*` or `_` literally in an existing body will see them turn into emphasis. Documented as expected behavior; if a user complains, they can escape with `\*` / `\_` (CommonMark).

## Out of scope

- Markdown-shortcut editor or rich preview controls.
- Headings, blockquotes, links, images, code blocks, footnotes.
- A migration that rewrites old plaintext bodies to escape stray `*`/`_`.
- Visual-regression snapshots of rendered markdown cards.
