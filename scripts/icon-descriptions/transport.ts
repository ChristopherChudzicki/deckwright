export const DEFAULT_MODEL = "sonnet";

export type BatchResult = {
  descriptions: Record<string, string>;
  cost: number;
  thinkingTokens?: number;
};

export type DescribeBatch = (
  names: readonly string[],
  opts: { pngDir: string; model: string },
) => Promise<BatchResult>;

type FailureFields = {
  // A batch can fail after its request was billed. Without this the run's total
  // omits every paid-for failure.
  cost?: number;
  // Retrying would reproduce the same failure at full price.
  retryable?: boolean;
  // Nothing further can succeed either — a rejected key fails every remaining
  // batch the same way.
  fatal?: boolean;
  retryAfterMs?: number;
};

export type BatchFailure = Error & FailureFields;

export function batchFailure(message: string, fields: FailureFields = {}): BatchFailure {
  return Object.assign(new Error(message), fields);
}

// Naming every requested icon as a required property, with no additional ones
// allowed, makes a short or renamed response a schema violation to retry on
// rather than a silent shortfall we would pay to close in a later run.
//
// Only the `cli` transport uses this. Over HTTP the same schema costs more than
// it buys, because it varies per request — see the note on `output_config` in
// invoke-api.ts.
export function responseSchema(names: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(names.map((name) => [name, { type: "string" }])),
    required: [...names],
    additionalProperties: false,
  };
}

// Belt-and-braces behind the schema: a wrong key silently lost butter-toast in a
// measured run, back when nothing constrained the response shape.
export function pickRequested(
  output: object,
  requested: readonly string[],
): Record<string, string> {
  const wanted = new Set(requested);
  const descriptions: Record<string, string> = {};
  for (const [name, value] of Object.entries(output)) {
    if (!wanted.has(name) || typeof value !== "string") continue;
    descriptions[name] = value.trim();
  }
  return descriptions;
}
