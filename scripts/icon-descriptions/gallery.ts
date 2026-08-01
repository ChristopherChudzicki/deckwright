import type { IconifyJSON } from "@iconify/types";
import type { Arms, Choices } from "./promote";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

// Descriptions are model output and names come from a third-party package, so
// neither is safe to interpolate raw — one `&` or `<` corrupts the rest of the
// document. Icon bodies are the exception and are written through unescaped:
// they are SVG markup from a dependency, and escaping them would render the
// tags as text.
const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch] ?? ch);

export type GalleryOptions = {
  collection: IconifyJSON;
  names: readonly string[];
  arms: Arms;
  choices: Choices;
};

const iconSvg = (collection: IconifyJSON, name: string): string | null => {
  const icon = collection.icons[name];
  if (!icon) return null;
  const width = icon.width ?? collection.width ?? 512;
  const height = icon.height ?? collection.height ?? 512;
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${icon.body}</svg>`;
};

const STYLES = `
:root { color-scheme: light dark; --bg: #fff; --fg: #16161a; --muted: #6b6b76; --line: #e2e2e8; --accent: #1a5fb4; --mark: #fff3c4; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #16161a; --fg: #e8e8ec; --muted: #9a9aa6; --line: #2c2c34; --accent: #7cb0f0; --mark: #4a3d00; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
header { position: sticky; top: 0; z-index: 1; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 16px; }
h1 { font-size: 16px; margin: 0 0 8px; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
input[type=search] { flex: 1 1 260px; min-width: 0; padding: 6px 10px; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; }
label { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
#count { color: var(--muted); font-variant-numeric: tabular-nums; }
.legend, .row { display: grid; gap: 16px; grid-template-columns: 96px repeat(var(--models), minmax(0, 1fr)); }
.legend { padding: 8px 16px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.row { padding: 14px 16px; border-bottom: 1px solid var(--line); content-visibility: auto; contain-intrinsic-size: auto 116px; }
.row[hidden] { display: none; }
.art { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.art svg { width: 64px; height: 64px; fill: currentColor; }
.name { font: 12px/1.3 ui-monospace, monospace; color: var(--muted); word-break: break-all; }
.cell p { margin: 0; }
.cell .missing { color: var(--muted); font-style: italic; }
.shipped { color: var(--accent); font-weight: 600; }
.badge { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 4px; background: var(--mark); color: var(--fg); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.model { display: none; font: 12px/1.3 ui-monospace, monospace; color: var(--muted); margin-bottom: 4px; }
/* The legend names the columns, so per-cell model labels are redundant — except
   on a row where choices.json overrides the default, which is exactly where you
   need to see which arm won without counting columns. */
.row[data-exception="1"] .model { display: block; }
@media (max-width: 720px) {
  .legend { display: none; }
  .row { grid-template-columns: 1fr; }
  .model { display: block; }
}
`;

// Filtering toggles `hidden` on rows rather than rebuilding the list, so the
// browser keeps the SVGs it has already rasterized. `content-visibility` on the
// row is what makes 4,134 inline SVGs openable at all — off-screen rows skip
// layout and paint until scrolled to.
const SCRIPT = `
const rows = [...document.querySelectorAll('.row')];
const search = document.getElementById('q');
const exceptionsOnly = document.getElementById('exceptions');
const count = document.getElementById('count');
function apply() {
  const needle = search.value.trim().toLowerCase();
  const only = exceptionsOnly.checked;
  let shown = 0;
  for (const row of rows) {
    const hit =
      (!only || row.dataset.exception === '1') &&
      (needle === '' || row.dataset.text.includes(needle));
    row.hidden = !hit;
    if (hit) shown++;
  }
  count.textContent = shown + ' of ' + rows.length;
}
search.addEventListener('input', apply);
exceptionsOnly.addEventListener('change', apply);
apply();
`;

export function renderGallery({ collection, names, arms, choices }: GalleryOptions): string {
  const models = Object.keys(arms).sort();
  const columns = `--models: ${models.length}`;

  const rows = names.flatMap((name) => {
    const svg = iconSvg(collection, name);
    if (svg === null) return [];
    const shipped = choices.choices[name] ?? choices.default;
    const isException = name in choices.choices;

    const cells = models.map((model) => {
      const description = arms[model]?.[name];
      const label = `<span class="model${model === shipped ? " shipped" : ""}">${escapeHtml(model)}</span>`;
      const body =
        description === undefined
          ? '<p class="missing">not described</p>'
          : `<p>${escapeHtml(description)}</p>`;
      return `<div class="cell">${label}${body}</div>`;
    });

    // One lowercase haystack per row so the filter is a substring test rather
    // than a walk of the row's DOM on every keystroke.
    const haystack = [name, ...models.map((model) => arms[model]?.[name] ?? "")]
      .join(" ")
      .toLowerCase();

    return [
      `<div class="row" style="${columns}" data-exception="${isException ? "1" : "0"}" data-text="${escapeHtml(haystack)}">` +
        `<div class="art">${svg}<span class="name">${escapeHtml(name)}</span></div>` +
        cells.join("") +
        "</div>",
    ];
  });

  const legend = models
    .map(
      (model) =>
        `<span${model === choices.default ? ' class="shipped"' : ""}>${escapeHtml(model)}` +
        `${model === choices.default ? '<span class="badge">default</span>' : ""}</span>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Icon descriptions — ${rows.length} icons</title>
<style>${STYLES}</style>
</head>
<body>
<header>
<h1>Icon descriptions by arm</h1>
<div class="controls">
<input type="search" id="q" placeholder="Filter by name or description" autocomplete="off">
<label><input type="checkbox" id="exceptions"> only choices.json exceptions</label>
<span id="count"></span>
</div>
</header>
<div class="legend" style="${columns}"><span>icon</span>${legend}</div>
<main>
${rows.join("\n")}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
