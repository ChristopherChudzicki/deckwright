import { type BreakCandidate, collectBreakCandidates } from "./breakCandidates";
import { sliceFirstChunk } from "./sliceAt";

export type LayoutPaginateOpts = {
  bodyHtml: string;
  width: number;
  firstHeight: number;
  continuationHeight: number;
  // Caller is responsible for nothing — the paginator removes the returned
  // element before returning.
  mount: (html: string, width: number) => HTMLElement;
};

export function layoutPaginate(opts: LayoutPaginateOpts): string[] {
  const { bodyHtml, width, firstHeight, continuationHeight, mount } = opts;
  if (bodyHtml === "") return [""];

  const container = mount(bodyHtml, width);
  const chunks: string[] = [];

  // No element children means there's nothing the walker can split (e.g.
  // whitespace-only HTML). Return the body as a single chunk so the card
  // renders with whatever it had — better than dropping the card entirely.
  if (container.children.length === 0) {
    container.replaceChildren();
    return [bodyHtml];
  }

  try {
    let budget = firstHeight;
    while (container.children.length > 0) {
      const candidates = collectBreakCandidates(container);
      if (candidates.length === 0) {
        // No structural splits available — flush the rest as one chunk.
        chunks.push(container.innerHTML);
        container.replaceChildren();
        break;
      }

      const chosen = pickBestFit(candidates, budget);
      const chunk = sliceFirstChunk(container, chosen.splitAt);
      chunks.push(chunk);

      budget = continuationHeight;
    }
  } finally {
    // Clear rather than remove — the measurer reuses the body slot it returns
    // from mountForPagination across paginations.
    container.replaceChildren();
  }

  return chunks;
}

function pickBestFit(candidates: BreakCandidate[], budget: number): BreakCandidate {
  let best: BreakCandidate | undefined;
  for (const c of candidates) {
    if (c.y <= budget) best = c;
    else break;
  }
  // No candidate fits — accept overflow on the first available split point so
  // the loop makes forward progress.
  return best ?? (candidates[0] as BreakCandidate);
}
