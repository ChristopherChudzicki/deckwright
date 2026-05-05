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
  // list / table: atomic — emit the whole block and accept overflow.
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
