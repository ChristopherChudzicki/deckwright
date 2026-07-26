import { SHUFFLE_SEED, shuffleSeeded } from "../../src/data/iconShuffle";

export const DEFAULT_BATCH_SIZE = 30;

export function selectBatches(opts: {
  all: readonly string[];
  existing: ReadonlySet<string>;
  only?: readonly string[];
  force?: boolean;
  limit?: number;
  batchSize: number;
}): string[][] {
  const { all, existing, only, force, limit, batchSize } = opts;

  if (only?.length) {
    const known = new Set(all);
    const unknown = only.filter((name) => !known.has(name));
    if (unknown.length) {
      throw new Error(`--only names icons not in the collection: ${unknown.join(", ")}`);
    }
  }

  // Batch index is fixed over the whole collection before any filtering, so a
  // resumed run shrinks its batches instead of shifting every boundary.
  const indexed = shuffleSeeded(all, SHUFFLE_SEED).map((name, position) => ({
    name,
    batch: Math.floor(position / batchSize),
  }));

  const onlySet = only?.length ? new Set(only) : null;
  let kept = indexed.filter(({ name }) => {
    if (onlySet) return onlySet.has(name);
    if (force) return true;
    return !existing.has(name);
  });

  if (limit !== undefined) kept = kept.slice(0, limit);

  const grouped = new Map<number, string[]>();
  for (const { name, batch } of kept) {
    const bucket = grouped.get(batch);
    if (bucket) bucket.push(name);
    else grouped.set(batch, [name]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([, names]) => names);
}
