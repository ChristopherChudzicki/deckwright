export type SplitAt =
  | { kind: "between-children"; parent: Element; childIndex: number }
  | { kind: "between-line-boxes"; textNode: Text; charOffset: number };

export type BreakCandidate = {
  y: number;
  splitAt: SplitAt;
};

export type LineBox = { bottom: number; charOffset: number };
export type LineBoxProvider = (textNode: Text) => LineBox[];

const ATOMIC_TAGS = new Set(["IMG", "PRE", "HR", "FIGURE"]);
const LINE_FLOW_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE"]);

export function collectBreakCandidates(
  root: HTMLElement,
  opts: { lineBoxes?: LineBoxProvider } = {},
): BreakCandidate[] {
  const out: BreakCandidate[] = [];
  const originY = root.getBoundingClientRect().top;
  const lineBoxes = opts.lineBoxes ?? defaultLineBoxes;

  for (const child of Array.from(root.children)) {
    handleChild(child as HTMLElement, root, originY, lineBoxes, out);
  }

  return out.sort((a, b) => a.y - b.y);
}

// Returns the index in parent.childNodes immediately after `child`. Range
// boundaries on Element parents use childNodes offsets (not element-only
// offsets), so all SplitAt childIndex values must be computed this way.
function indexAfter(parent: Element, child: Node): number {
  return Array.prototype.indexOf.call(parent.childNodes, child) + 1;
}

function handleChild(
  child: HTMLElement,
  parent: Element,
  originY: number,
  lineBoxes: LineBoxProvider,
  out: BreakCandidate[],
): void {
  const tag = child.tagName;

  if (ATOMIC_TAGS.has(tag)) {
    emitAfter(child, parent, originY, out);
    return;
  }

  if (tag === "TABLE") {
    handleTable(child, parent, originY, out);
    return;
  }

  if (tag === "DL") {
    handleDefinitionList(child, parent, originY, out);
    return;
  }

  if (tag === "UL" || tag === "OL") {
    handleListLike(child, parent, originY, out);
    return;
  }

  if (LINE_FLOW_TAGS.has(tag)) {
    handleInlineFlow(child, parent, originY, lineBoxes, out);
    return;
  }

  emitAfter(child, parent, originY, out);
}

function emitAfter(
  child: HTMLElement,
  parent: Element,
  originY: number,
  out: BreakCandidate[],
): void {
  out.push({
    y: child.getBoundingClientRect().bottom - originY,
    splitAt: {
      kind: "between-children",
      parent,
      childIndex: indexAfter(parent, child),
    },
  });
}

function handleTable(
  table: HTMLElement,
  parent: Element,
  originY: number,
  out: BreakCandidate[],
): void {
  const tbody = (table.querySelector(":scope > tbody") as HTMLElement | null) ?? table;
  const rows = Array.from(tbody.children).filter((c): c is HTMLElement => c.tagName === "TR");

  // Emit between adjacent rows (skip after the last row — that coincides with
  // the after-table candidate).
  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i] as HTMLElement;
    out.push({
      y: row.getBoundingClientRect().bottom - originY,
      splitAt: {
        kind: "between-children",
        parent: tbody,
        childIndex: indexAfter(tbody, row),
      },
    });
  }

  emitAfter(table, parent, originY, out);
}

function handleDefinitionList(
  dl: HTMLElement,
  parent: Element,
  originY: number,
  out: BreakCandidate[],
): void {
  const kids = Array.from(dl.children);
  // Only emit between (dd, dt) pairs — never split dt from its dd.
  for (let i = 0; i < kids.length - 1; i++) {
    const here = kids[i] as HTMLElement;
    const next = kids[i + 1] as HTMLElement;
    if (here.tagName === "DD" && next.tagName === "DT") {
      out.push({
        y: here.getBoundingClientRect().bottom - originY,
        splitAt: {
          kind: "between-children",
          parent: dl,
          childIndex: indexAfter(dl, here),
        },
      });
    }
  }
  emitAfter(dl, parent, originY, out);
}

function handleListLike(
  list: HTMLElement,
  parent: Element,
  originY: number,
  out: BreakCandidate[],
): void {
  const items = Array.from(list.children);
  for (let i = 0; i < items.length - 1; i++) {
    const item = items[i] as HTMLElement;
    out.push({
      y: item.getBoundingClientRect().bottom - originY,
      splitAt: {
        kind: "between-children",
        parent: list,
        childIndex: indexAfter(list, item),
      },
    });
  }
  emitAfter(list, parent, originY, out);
}

function handleInlineFlow(
  block: HTMLElement,
  parent: Element,
  originY: number,
  lineBoxes: LineBoxProvider,
  out: BreakCandidate[],
): void {
  const blockBottom = block.getBoundingClientRect().bottom - originY;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node !== null) {
    const lines = lineBoxes(node);
    for (const line of lines) {
      const y = line.bottom - originY;
      // Skip the final line box if it coincides with the block's bottom — the
      // after-block candidate covers it.
      if (y >= blockBottom - 0.5) continue;
      out.push({
        y,
        splitAt: { kind: "between-line-boxes", textNode: node, charOffset: line.charOffset },
      });
    }
    node = walker.nextNode() as Text | null;
  }

  out.push({
    y: blockBottom,
    splitAt: {
      kind: "between-children",
      parent,
      childIndex: indexAfter(parent, block),
    },
  });
}

const defaultLineBoxes: LineBoxProvider = (textNode) => {
  const range = document.createRange();
  range.selectNodeContents(textNode);
  // jsdom does not implement Range.getClientRects; fall back to no line boxes
  // there. Real browsers (and Playwright) exercise the full path.
  if (typeof range.getClientRects !== "function") return [];
  const rects = Array.from(range.getClientRects());
  if (rects.length <= 1) return [];

  // Walk the text content character-by-character to find offsets where each
  // line box ends. The last char whose end-rect bottom matches a given line's
  // bottom is the line's break point.
  const text = textNode.data;
  const out: LineBox[] = [];
  for (let lineIdx = 0; lineIdx < rects.length - 1; lineIdx++) {
    const target = rects[lineIdx]?.bottom;
    if (target === undefined) continue;
    let lastOffset = 0;
    for (let i = 1; i <= text.length; i++) {
      const r = document.createRange();
      r.setStart(textNode, 0);
      r.setEnd(textNode, i);
      const rs = Array.from(r.getClientRects());
      const last = rs[rs.length - 1];
      if (last && Math.abs(last.bottom - target) < 0.5) {
        lastOffset = i;
      } else if (rs.length > lineIdx + 1) {
        break;
      }
    }
    if (lastOffset > 0) out.push({ bottom: target, charOffset: lastOffset });
  }
  return out;
};
