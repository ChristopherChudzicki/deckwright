export const DEFAULT_MODEL = "sonnet";

export type IconResult = {
  description: string;
  cost: number;
  thinkingTokens?: number;
  cache?: CacheUsage;
};

// Whether the cached prefix was written or re-read. The run reports the ratio,
// which is the only way to know whether caching paid: a write costs more than an
// uncached token, so a run that never re-reads its prefix is worse off for
// having asked. Absent on transports that cannot cache.
export type CacheUsage = { created: number; read: number };

export type DescribeIcon = (
  name: string,
  opts: { pngDir: string; model: string; cache: CacheTtl },
) => Promise<IconResult>;

// How long a cached prefix survives, or `off` to send none. Reads cost a tenth
// of an ordinary input token under either window, so the choice is only about
// the write — and the windows compare against each other rather than against no
// cache at all. Per write 5m bills 1.15x where 1h bills 1.9x, so 5m is cheaper
// only if it writes fewer than 1.65 times as often. Every hit refreshes the
// window for free, so a run that keeps touching its prefix holds either one; but
// the batch endpoint schedules requests as it likes and promises no such
// continuity. Winning that bet saves cents and losing it costs dollars, which is
// why the default takes the longer window.
export type CacheTtl = "5m" | "1h" | "off";

export const addCacheUsage = (total: CacheUsage, next?: CacheUsage): CacheUsage => ({
  created: total.created + (next?.created ?? 0),
  read: total.read + (next?.read ?? 0),
});

// In tokens rather than requests, because tokens are what is billed, and with
// the raw totals beside the ratio, because the ratio is meaningless on a short
// run — the first request can only write.
export function formatCacheUsage(cache: CacheUsage, ttl: CacheTtl): string | null {
  const total = cache.created + cache.read;
  if (total === 0) {
    // A run that asked for caching and cached nothing has found something, and
    // reporting it as silence hides it: below a model's minimum cacheable
    // length the marker is ignored without an error, which looks exactly like
    // never having asked. Sonnet 5 needs 1024 tokens and this prefix is 948.
    return ttl === "off"
      ? null
      : "prompt cache: nothing cached — the prefix is below this model's minimum cacheable length";
  }
  const rate = ((cache.read / total) * 100).toFixed(1);
  return `prompt cache: ${cache.read} read, ${cache.created} written (${rate}% hit rate)`;
}

type FailureFields = {
  // A request can fail after it was billed. Without this the run's total omits
  // every paid-for failure.
  cost?: number;
  // Billed the same way, and left out of the totals for the same reason.
  cache?: CacheUsage;
  // Retrying would reproduce the same failure at full price.
  retryable?: boolean;
  // Nothing further can succeed either — a rejected key fails every remaining
  // request the same way.
  fatal?: boolean;
  retryAfterMs?: number;
};

export type RequestFailure = Error & FailureFields;

export function requestFailure(message: string, fields: FailureFields = {}): RequestFailure {
  return Object.assign(new Error(message), fields);
}

// A list of name/description pairs rather than an object keyed by icon name,
// because the keys of that object would be the request's own data: a different
// schema every request, and compiled grammars are cached per schema structure
// against an organisation limit of 20 compilations a minute. A live 138-request
// arm errored 102 of its requests on that limit. Names moved into values make
// one schema serve every request and every transport, so the grammar compiles
// once and the rest hit cache — which matters more at 4,134 requests than it did
// at 138.
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

// The schema guarantees the shape but not the contents: nothing stops the model
// returning a name nobody asked for, and a wrong name silently lost butter-toast
// in a measured run. One image per request turns that name from a channel the
// model has to keep straight into a redundant one the harness checks by string
// equality — anything else is not this icon's description, so there is nothing
// to salvage from it.
export function pickDescription(output: object, name: string): string | null {
  const { descriptions: listed } = output as { descriptions?: unknown };
  for (const entry of Array.isArray(listed) ? (listed as Described[]) : []) {
    const { name: entryName, description } = entry ?? {};
    if (typeof entryName !== "string" || typeof description !== "string") continue;
    if (entryName === name) return description.trim();
  }
  return null;
}
