const MIN_LENGTH = 15;
const MAX_LENGTH = 200;

// The apostrophe class covers the typographic form, which the model emits in
// prose more often than the ASCII one.
const REFUSAL_PATTERNS = [/\bI can['’]?t\b/i, /\bI['’]?m unable\b/i, /\bsorry\b/i];

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
