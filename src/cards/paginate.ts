export type PaginateMeasurer = (prefix: string) => boolean;

type BlockKind = "paragraph" | "list" | "table";
type Block = { kind: BlockKind; text: string };

const BLANK_LINE = /\n\s*\n/;
const TABLE_LINE = /^\s*\|/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;

function classify(text: string): BlockKind {
  const firstLine = text.split("\n", 1)[0] ?? "";
  if (TABLE_LINE.test(firstLine)) return "table";
  if (LIST_ITEM.test(firstLine)) return "list";
  return "paragraph";
}

export function splitTopLevelBlocks(body: string): Block[] {
  return body
    .split(BLANK_LINE)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ kind: classify(text), text }));
}

export function paginateBody(opts: {
  body: string;
  measureFirst: PaginateMeasurer;
  measureContinuation: PaginateMeasurer;
}): string[] {
  const { body, measureFirst, measureContinuation } = opts;

  if (body === "") return [""];
  if (measureFirst(body)) return [body];

  const blocks = splitTopLevelBlocks(body);
  if (blocks.length === 0) {
    // All-whitespace body: degrade to character fallback over the raw string
    // so we make forward progress (matches pre-refactor behavior).
    return [characterFit(body, measureFirst)];
  }

  const chunks: string[] = [];
  let remaining = blocks;
  let measure = measureFirst;

  while (remaining.length > 0) {
    const fittedCount = greedyFitBlocks(remaining, measure);
    if (fittedCount > 0) {
      chunks.push(joinBlocks(remaining.slice(0, fittedCount)));
      remaining = remaining.slice(fittedCount);
    } else {
      // Even the first block alone doesn't fit — sub-paginate it.
      const head = remaining[0];
      if (!head) break;
      const { fitted, rest } = subPaginateBlock(head, measure);
      chunks.push(fitted);
      remaining =
        rest === "" ? remaining.slice(1) : [{ kind: head.kind, text: rest }, ...remaining.slice(1)];
    }
    measure = measureContinuation;
  }

  return chunks;
}

function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.text).join("\n\n");
}

function greedyFitBlocks(blocks: Block[], measure: PaginateMeasurer): number {
  // Largest n in [1, blocks.length] whose joined text passes measure.
  let lo = 1;
  let hi = blocks.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(joinBlocks(blocks.slice(0, mid)))) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function subPaginateBlock(
  block: Block,
  measure: PaginateMeasurer,
): { fitted: string; rest: string } {
  if (block.kind === "paragraph") {
    const fitted = greedyFit(block.text, measure);
    const rest = block.text.slice(fitted.length).replace(/^\s+/, "");
    return { fitted, rest };
  }
  if (block.kind === "list") {
    return splitListAtItem(block.text, measure);
  }
  // table: atomic.
  return { fitted: block.text, rest: "" };
}

function greedyFit(text: string, measure: PaginateMeasurer): string {
  const wordEnds = wordEndIndices(text);
  if (wordEnds.length === 0) return characterFit(text, measure);

  let lo = 0;
  let hi = wordEnds.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(text.slice(0, wordEnds[mid]))) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best === -1) return characterFit(text, measure);
  return text.slice(0, wordEnds[best]);
}

function wordEndIndices(text: string): number[] {
  const ends: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((m = re.exec(text)) !== null) {
    ends.push(m.index + m[0].length);
  }
  return ends;
}

function characterFit(text: string, measure: PaginateMeasurer): string {
  let lo = 0;
  let hi = text.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(text.slice(0, mid))) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, Math.max(best, 1));
}

function splitListAtItem(
  text: string,
  measure: PaginateMeasurer,
): { fitted: string; rest: string } {
  const itemStarts = topLevelItemStarts(text);
  // Single item (possibly with nested children) — atomic fallback.
  if (itemStarts.length <= 1) return { fitted: text, rest: "" };

  const cutAt = (k: number): number =>
    k >= itemStarts.length ? text.length : (itemStarts[k] ?? text.length);

  // Largest k in [1, itemStarts.length] whose prefix (items 0..k-1) fits.
  let lo = 1;
  let hi = itemStarts.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, cutAt(mid)).replace(/\n+$/, "");
    if (measure(candidate)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // If nothing fits, accept overflow of the first item alone (rare).
  const k = best === 0 ? 1 : best;
  const cut = cutAt(k);
  return {
    fitted: text.slice(0, cut).replace(/\n+$/, ""),
    rest: text.slice(cut).replace(/^\n+/, ""),
  };
}

function topLevelItemStarts(text: string): number[] {
  // Indices in `text` where a top-level list item begins.
  // A top-level item starts at the beginning of a line whose leading whitespace
  // matches the leading whitespace of the very first item.
  const lines = text.split("\n");
  if (lines.length === 0) return [];
  const firstMatch = LIST_ITEM.exec(lines[0] ?? "");
  if (!firstMatch) return [0];
  const baseIndent = (firstMatch[0].match(/^\s*/)?.[0] ?? "").length;

  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    const m = LIST_ITEM.exec(line);
    if (m) {
      const indent = (m[0].match(/^\s*/)?.[0] ?? "").length;
      if (indent === baseIndent) starts.push(offset);
    }
    offset += line.length + 1; // +1 for the consumed "\n"
  }
  return starts;
}
