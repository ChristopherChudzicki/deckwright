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

// A list of name/description pairs rather than the obvious object keyed by icon
// name, because the keys of that object are the request's own data: it is a
// different schema every request, and compiled grammars are cached per schema
// structure, against an organisation limit of 20 compilations a minute. A live
// 138-request arm errored 102 of its requests on that limit. Names moved into
// values make one schema serve every request and every transport, so the grammar
// compiles once and the rest hit cache.
//
// An open-ended map is not expressible anyway: structured outputs require
// `additionalProperties: false`, so there is no way to say "arbitrary string
// keys".
export const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    descriptions: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["descriptions"],
  additionalProperties: false,
};

type Described = { name?: unknown; description?: unknown };

// The schema guarantees the shape but not the contents: `minItems` accepts only
// 0 and 1, so it cannot require all 30 icons, and nothing stops the model
// returning a name nobody asked for. A wrong name silently lost butter-toast in
// a measured run. Unrequested and duplicate names are dropped here; a shortfall
// is left to the caller, which reports it and re-describes what is missing.
export function pickRequested(
  output: object,
  requested: readonly string[],
): Record<string, string> {
  const wanted = new Set(requested);
  const { descriptions: listed } = output as { descriptions?: unknown };
  const descriptions: Record<string, string> = {};
  for (const entry of Array.isArray(listed) ? (listed as Described[]) : []) {
    const { name, description } = entry ?? {};
    if (typeof name !== "string" || typeof description !== "string") continue;
    if (!wanted.has(name) || name in descriptions) continue;
    descriptions[name] = description.trim();
  }
  return descriptions;
}
