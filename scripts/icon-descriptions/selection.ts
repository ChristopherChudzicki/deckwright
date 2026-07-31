import { SHUFFLE_SEED, shuffleSeeded } from "../../src/data/iconDescriptions/shuffle";

// One image per request. Grouping made name↔image correspondence the model's
// job, and it got it wrong: an Opus run shifted every description in a request
// onto the following icon's name, producing valid prose under a real name that
// nothing downstream could see was wrong. At one image per request the harness
// establishes the mapping, so the failure is unrepresentable rather than rare.
export const DEFAULT_BATCH_SIZE = 1;

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

  const onlySet = only?.length ? new Set(only) : null;
  let kept = shuffleSeeded(all, SHUFFLE_SEED).filter((name) => {
    if (onlySet) return onlySet.has(name);
    if (force) return true;
    return !existing.has(name);
  });

  if (limit !== undefined) kept = kept.slice(0, limit);

  // Packed densely rather than preserving whole-collection batch boundaries.
  // Nothing consumes a batch index, and preserving boundaries would leave a
  // resume running mostly-singleton invocations — each paying the same fixed
  // per-invocation cost as a full batch, and singletons make the
  // consecutive-failure abort trivially reachable.
  const packed: string[][] = [];
  for (let i = 0; i < kept.length; i += batchSize) packed.push(kept.slice(i, i + batchSize));
  return packed;
}
