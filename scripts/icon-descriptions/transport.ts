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

// Deliberately says nothing about which icons were asked for, so that every
// request in a batch carries a byte-identical schema.
//
// It used to name each requested icon as a required property, which turned a
// short or renamed response into a schema violation to retry on. That made all
// 138 requests in a full run carry a *different* schema, and structured outputs
// compile one grammar per distinct schema against an organisation limit of 20
// compilations per minute. A batch is dispatched far faster than that: the first
// live run described 1,080 of 4,134 icons and errored the other 102 requests on
// `Grammar compilation rate limit exceeded`.
//
// Losing the completeness guarantee costs little, because three other things
// already cover it: `pickRequested` drops keys that name no requested icon,
// `validateEntry` gates every entry before it is merged, and selection reads the
// corpus — so an icon a response omitted is simply still undescribed and is
// picked up by the next run, at the price of those icons alone.
export function responseSchema(): Record<string, unknown> {
  return { type: "object", additionalProperties: { type: "string" } };
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
