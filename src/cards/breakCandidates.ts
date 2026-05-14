export type SplitAt =
  | { kind: "between-children"; parent: Element; childIndex: number }
  | { kind: "between-line-boxes"; textNode: Text; charOffset: number };

export type BreakCandidate = {
  y: number;
  splitAt: SplitAt;
};

export type LineBox = { bottom: number; charOffset: number };
export type LineBoxProvider = (textNode: Text) => LineBox[];

// The walker only handles top-level children of `root`. Containers it knows
// about (TABLE, DL, UL/OL, P) emit candidates between their immediate
// children. Containers nested *inside* another container (e.g. a UL inside
// an LI, a P inside a BLOCKQUOTE) are not recursed into — their break points
// fall through to the parent's between-child boundaries. This is sufficient
// for everything renderBody currently emits; adding deeper recursion is the
// follow-up if that allowlist expands.
export function collectBreakCandidates(
  root: HTMLElement,
  opts: { lineBoxes?: LineBoxProvider } = {},
): BreakCandidate[] {
  const out: BreakCandidate[] = [];
  const originY = root.getBoundingClientRect().top;
  const lineBoxes = opts.lineBoxes ?? defaultLineBoxes;

  for (const child of Array.from(root.children)) {
    // Floated decorations (e.g. the QR-corner reserve in Card.tsx) carry
    // data-pagination-skip="true". They are out of normal flow and must not
    // appear as candidate split points — their getBoundingClientRect would
    // otherwise emit a y at body-bottom and steer the paginator into an
    // empty-chunk loop.
    // Shallow by design: this check runs only at the top-level loop, not
    // inside handleChild's recursion. Today's only skip-targets (the QR
    // floats) are direct children of .body; nested decorations would need
    // their own opt-out path.
    if ((child as HTMLElement).dataset.paginationSkip === "true") continue;
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

  if (tag === "P") {
    handleInlineFlow(child, parent, originY, lineBoxes, out);
    return;
  }

  // Unknown / unhandled tag (PRE, IMG, HR, headings, ...). Treat as opaque:
  // one candidate immediately after the element, no internal split points.
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
  const text = textNode.data;
  if (text.length === 0) return [];
  const whole = document.createRange();
  whole.selectNodeContents(textNode);
  // jsdom does not implement Range.getClientRects; fall back to no line boxes
  // there. Real browsers (and Playwright) exercise the full path.
  if (typeof whole.getClientRects !== "function") return [];
  const wholeRects = Array.from(whole.getClientRects());
  if (wholeRects.length <= 1) return [];

  // For each line K (except the last), binary-search for the largest offset
  // where range(0, offset) is contained within lines 0..K — i.e., its
  // getClientRects().length is at most K + 1. That offset is the line's break
  // point. Total work: O(L · log N) Range queries instead of O(L · N).
  const out: LineBox[] = [];
  const probe = document.createRange();
  for (let lineIdx = 0; lineIdx < wholeRects.length - 1; lineIdx++) {
    const targetBottom = (wholeRects[lineIdx] as DOMRect).bottom;
    let lo = 1;
    let hi = text.length;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      probe.setStart(textNode, 0);
      probe.setEnd(textNode, mid);
      if (probe.getClientRects().length <= lineIdx + 1) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best > 0) out.push({ bottom: targetBottom, charOffset: best });
  }
  return out;
};
