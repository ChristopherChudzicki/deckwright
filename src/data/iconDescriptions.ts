const MIN_LENGTH = 15;
// Measured max across 299 generated descriptions is 191, and a response that
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

export function mergeOverrides(
  base: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, string> {
  return { ...base, ...overrides };
}
