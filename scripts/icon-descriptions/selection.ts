import { SHUFFLE_SEED, shuffleSeeded } from "../../src/data/iconDescriptions/shuffle";

export function selectIcons(opts: {
  all: readonly string[];
  existing: ReadonlySet<string>;
  only?: readonly string[];
  force?: boolean;
  limit?: number;
}): string[] {
  const { all, existing, only, force, limit } = opts;

  if (only?.length) {
    const known = new Set(all);
    const unknown = only.filter((name) => !known.has(name));
    if (unknown.length) {
      throw new Error(`--only names icons not in the collection: ${unknown.join(", ")}`);
    }
  }

  const onlySet = only?.length ? new Set(only) : null;
  const kept = shuffleSeeded(all, SHUFFLE_SEED).filter((name) => {
    if (onlySet) return onlySet.has(name);
    if (force) return true;
    return !existing.has(name);
  });

  return limit === undefined ? kept : kept.slice(0, limit);
}
