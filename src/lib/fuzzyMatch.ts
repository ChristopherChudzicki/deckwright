export type FuzzyMatch = { score: number };

const BOUNDARY = new Set([" ", "-", "_"]);

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query === "") return { score: 0 };
  if (query.length > target.length) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastMatchTi = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let bonus = 1;
    if (ti === lastMatchTi + 1) bonus += 2;
    if (ti === 0 || BOUNDARY.has(t.charAt(ti - 1))) bonus += 3;

    score += bonus;
    lastMatchTi = ti;
    qi++;
  }

  return qi === q.length ? { score } : null;
}
