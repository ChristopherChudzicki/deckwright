const MIN_LENGTH = 15;
// Measured max across 418 generated descriptions is 203, and a response that
// honours the prompt's 30-word budget tops out near 210. The headroom is
// deliberate: a reject never enters the file, but it does burn two retries and
// then re-fail identically, stranding that icon in a paid re-invocation.
const MAX_LENGTH = 260;

// The apostrophe class covers the typographic form, which the model emits in
// prose more often than the ASCII one. The impersonal patterns matter because
// the prompt demands JSON only, which makes a terse third-person failure string
// the likelier degradation than a first-person refusal.
const REFUSAL_PATTERNS = [
  /\bI can['’]?t\b/i,
  /\bI['’]?m unable\b/i,
  /\bsorry\b/i,
  /\b(?:unable|failed) to (?:read|load|open|access)\b/i,
  /\b(?:could not|couldn['’]?t|cannot) be (?:read|loaded|opened|accessed|displayed)\b/i,
  /\bno image (?:was )?(?:provided|found|available)\b/i,
  /\bblank (?:white |black )?(?:square|image)\b/i,
];

const STOPWORDS = new Set(["a", "an", "and", "of", "or", "the", "with", "shown", "pair"]);

export function validateEntry(name: string, description: unknown): string | null {
  if (typeof description !== "string") return `${name}: description is not a string`;
  if (description.trim() === "") return `${name}: description is empty`;
  if (description.length < MIN_LENGTH) {
    return `${name}: description is ${description.length} chars, below the ${MIN_LENGTH} minimum`;
  }
  if (description.length > MAX_LENGTH) {
    return `${name}: description is ${description.length} chars, above the ${MAX_LENGTH} maximum`;
  }
  if (REFUSAL_PATTERNS.some((pattern) => pattern.test(description))) {
    return `${name}: description looks like refusal boilerplate`;
  }
  return null;
}

const contentWords = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 0 && !STOPWORDS.has(word)),
  );

export function isNameEcho(name: string, description: string): boolean {
  const fromName = contentWords(name.replaceAll("-", " "));
  return [...contentWords(description)].every((word) => fromName.has(word));
}

// Words about how an icon is drawn rather than what it depicts. Every icon in
// the collection is a flat black-and-white shape, so these are true of all of
// them and distinguish none — in a search index they are pure noise. The prompt
// forbids them; this counts the residue that survives it.
const STYLE_WORDS =
  /\b(?:silhouett\w*|styli[sz]ed|line[ -]art|minimalist|pictogram|glyph|monochrome|black[ -]and[ -]white|flat design)\b/i;

export function styleWord(description: string): string | null {
  return description.match(STYLE_WORDS)?.[0] ?? null;
}

const ASSOCIATION =
  /\b(?:symboli[sz]\w+|representing|signifying|denoting|evoking|an? (?:symbol|emblem) of|shorthand for|the (?:standard|usual) sign for)\b/i;

const stem = (word: string): string => word.replace(/(?:ing|ers|er|es|s)$/, "");

// The prompt's second clause has to earn its place: it is redundant when it
// names something the literal half, or the icon's own name, already named.
//
// A count to watch across prompt revisions rather than a verdict on any one
// entry, so stable precision matters more than exact precision. It over-flags
// the case where naming the referent *is* the description — "a teardrop-shaped
// landmass representing Sri Lanka" — which is a class of about 36 icons.
export function isTautologicalAssociation(name: string, description: string): boolean {
  const at = description.search(ASSOCIATION);
  if (at < 0) return false;
  const claimed = new Set([...contentWords(description.slice(at))].map(stem));
  const stated = contentWords(`${name.replaceAll("-", " ")} ${description.slice(0, at)}`);
  return [...stated].some((word) => word.length > 3 && claimed.has(stem(word)));
}

export function mergeOverrides(
  base: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, string> {
  return { ...base, ...overrides };
}
