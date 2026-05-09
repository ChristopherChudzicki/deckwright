import type { SplitAt } from "./breakCandidates";

// Mutates `container`: removes the prefix up to the cut described by
// `splitAt` and returns it as serialized HTML. For mid-table cuts, the
// `<thead>` is cloned onto the residual container so both halves remain
// renderable as standalone tables.
export function sliceFirstChunk(container: HTMLElement, splitAt: SplitAt): string {
  // Capture an ancestor TABLE's <thead> on the cut path so we can re-attach
  // it to the residual after extractContents moves it into the prefix.
  const restoredThead = captureTheadIfTablePartial(container, splitAt);

  const range = document.createRange();
  range.setStart(container, 0);
  if (splitAt.kind === "between-children") {
    range.setEnd(splitAt.parent, splitAt.childIndex);
  } else {
    range.setEnd(splitAt.textNode, splitAt.charOffset);
  }

  const fragment = range.extractContents();

  if (restoredThead) {
    const { table, theadClone } = restoredThead;
    if (!table.querySelector(":scope > thead")) {
      table.prepend(theadClone);
    }
  }

  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

function captureTheadIfTablePartial(
  container: HTMLElement,
  splitAt: SplitAt,
): { table: HTMLElement; theadClone: HTMLElement } | null {
  const start: Element | null =
    splitAt.kind === "between-children" ? splitAt.parent : splitAt.textNode.parentElement;

  let cur: Element | null = start;
  while (cur && cur !== container) {
    if (cur.tagName === "TABLE") {
      const thead = cur.querySelector(":scope > thead") as HTMLElement | null;
      if (thead) {
        return {
          table: cur as HTMLElement,
          theadClone: thead.cloneNode(true) as HTMLElement,
        };
      }
      return null;
    }
    cur = cur.parentElement;
  }
  return null;
}
