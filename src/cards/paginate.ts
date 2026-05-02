export type PaginateMeasurer = (prefix: string) => boolean;

export function paginateBody(opts: {
  body: string;
  measureFirst: PaginateMeasurer;
  measureContinuation: PaginateMeasurer;
}): string[] {
  const { body, measureFirst, measureContinuation } = opts;

  if (body === "") return [""];
  if (measureFirst(body)) return [body];

  const chunks: string[] = [];

  const firstChunk = greedyFit(body, measureFirst);
  chunks.push(firstChunk);
  let remaining = body.slice(firstChunk.length).replace(/^\s+/, "");

  while (remaining.length > 0) {
    if (measureContinuation(remaining)) {
      chunks.push(remaining);
      break;
    }
    const next = greedyFit(remaining, measureContinuation);
    chunks.push(next);
    remaining = remaining.slice(next.length).replace(/^\s+/, "");
  }

  return chunks;
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
