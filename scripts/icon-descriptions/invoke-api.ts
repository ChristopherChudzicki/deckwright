import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ATTACHED_INSTRUCTIONS } from "./prompt";
import {
  type CacheTtl,
  type CacheUsage,
  type DescribeIcon,
  type IconResult,
  pickDescription,
  RESPONSE_SCHEMA,
  requestFailure,
} from "./transport";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 600_000;
// A ceiling, not a reservation — unused headroom is not billed. The reply is one
// sentence, so this is almost entirely thinking headroom, and thinking draws on
// the same budget: a tight limit buys nothing and truncates the object
// mid-string.
const MAX_TOKENS = 32_000;

// Retrying these buys delay and nothing else: a malformed request, a rejected
// key, or an unknown model fails identically on every attempt.
const FATAL_STATUSES = new Set([400, 401, 403, 404]);

export type Price = { input: number; output: number };

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER: Record<Exclude<CacheTtl, "off">, number> = {
  "5m": 1.25,
  "1h": 2,
};

type ModelEntry = {
  id: string;
  price: Price;
  // Introductory rates lapse on a date rather than on a release, so without the
  // expiry encoded here every run would keep reporting the discounted spend
  // months after being billed the standard one.
  intro?: { price: Price; endsOn: string };
};

const SONNET: ModelEntry = {
  id: "claude-sonnet-5",
  price: { input: 3, output: 15 },
  intro: { price: { input: 2, output: 10 }, endsOn: "2026-08-31" },
};

const OPUS: ModelEntry = { id: "claude-opus-5", price: { input: 5, output: 25 } };

// The CLI takes a friendly alias and bills a subscription; the HTTP API needs a
// concrete id and bills per token, so both spellings resolve to one entry. Only
// models whose pricing was confirmed against the pricing page belong here — a
// guessed rate would report a run's spend as fact while being wrong about it.
const MODELS: Record<string, ModelEntry> = {
  sonnet: SONNET,
  "claude-sonnet-5": SONNET,
  opus: OPUS,
  "claude-opus-5": OPUS,
};

// The alias and the concrete id name one model, so a corpus stamped under one
// must not read as a different model under the other. A model with no price
// table entry is legal under `cli`, which bills no tokens, and keeps its name.
export function canonicalModel(model: string): string {
  return MODELS[model]?.id ?? model;
}

export function resolveModel(model: string, on: Date = new Date()): { id: string; price: Price } {
  const entry = MODELS[model];
  if (!entry) {
    throw new Error(`no pricing for model "${model}"; known: ${Object.keys(MODELS).join(", ")}`);
  }
  const { intro } = entry;
  const price = intro && on <= new Date(`${intro.endsOn}T23:59:59Z`) ? intro.price : entry.price;
  return { id: entry.id, price };
}

// The Batch API charges half the standard rate on both axes, in exchange for
// asynchronous processing.
export function batchPrice(price: Price): Price {
  return { input: price.input / 2, output: price.output / 2 };
}

// The rate a run will actually be billed at. Halving under the wrong transport
// misreports every run's spend by 2× in one direction or the other, and nothing
// downstream can catch it, so the branch is resolved here where it is testable
// rather than inline at the call site.
export function pricingFor(
  model: string,
  transport: string,
  on?: Date,
): { id: string; price: Price } {
  const resolved = resolveModel(model, on);
  return transport === "batch" ? { ...resolved, price: batchPrice(resolved.price) } : resolved;
}

// Rough, and printed as a range because nothing predicts the cache hit rate:
// image tokens for one 512px PNG plus a 30-word description, with nothing for
// thinking, so even the upper bound is not a hard ceiling.
const INPUT_TOKENS_PER_ICON = 361;
const OUTPUT_TOKENS_PER_ICON = 45;
// The invariant prefix, taken from what a live batch was billed for: 30 requests
// reported 18,420 cache-creation and 18,420 cache-read tokens, which is 15 writes
// and 15 reads of 1,228 tokens each. Two earlier figures were wrong — 793 from
// chars/3.7, then 948 from the token-counting endpoint — and only this one is
// what the prefix actually costs. Re-derive it the same way if the prompt changes.
const INSTRUCTION_TOKENS = 1_228;

// Two numbers, because a cached run's cost is not knowable before it runs. Every
// request after the first either re-reads the prefix at a tenth of an input
// token or writes it again at the ttl's premium, and which of those happens is
// what the run reports afterwards. The bounds coincide when no prefix is sent.
export type CostEstimate = { floor: number; ceiling: number };

export function estimateCost(icons: number, price: Price, cacheTtl: CacheTtl): CostEstimate {
  const perIcon =
    icons * (INPUT_TOKENS_PER_ICON * price.input + OUTPUT_TOKENS_PER_ICON * price.output);
  const prefix = INSTRUCTION_TOKENS * price.input;
  const write = cacheTtl === "off" ? 1 : CACHE_WRITE_MULTIPLIER[cacheTtl];
  const ceiling = perIcon + icons * prefix * write;
  const floor =
    cacheTtl === "off"
      ? ceiling
      : perIcon + prefix * write + (icons - 1) * prefix * CACHE_READ_MULTIPLIER;
  return { floor: floor / 1_000_000, ceiling: ceiling / 1_000_000 };
}

export function assertApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set — export a key. The cli transport needs none.");
  }
  return key;
}

type ContentBlock = { type?: unknown; text?: unknown };
type Payload = {
  content?: unknown;
  stop_reason?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
    cache_read_input_tokens?: unknown;
    output_tokens_details?: { thinking_tokens?: unknown };
  };
};

// Cached tokens are reported outside `input_tokens`, so a run that ignores these
// bills itself for the uncached remainder and reads as far cheaper than it was —
// which would put the --max-cost rail under the real spend.
const tokenCount = (value: unknown): number => (typeof value === "number" ? value : 0);

export function extractApiDescription(
  body: string,
  name: string,
  price: Price,
  cacheTtl: CacheTtl,
): IconResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw requestFailure(`response body is not JSON: ${body.slice(0, 200)}`);
  }
  return extractMessage(payload, name, price, cacheTtl);
}

// Takes a parsed message rather than a response body, because the Batch API
// delivers the same object nested inside a JSONL result line.
//
// `cacheTtl` has no default on purpose: it has to be the ttl the request was
// actually sent with, and a wrong one silently reprices every cached token.
// What every request of every kind shares: price it, classify the ways it can
// fail before it says anything, and hand back the JSON object it did say. What
// that object is supposed to contain is the caller's business — the icon run
// wants a description, the cross-arm comparison wants a verdict, and neither
// concern belongs in the billing and stop_reason handling both depend on.
export type ExtractedPayload = {
  output: object;
  cost: number;
  thinkingTokens?: number;
  cache: CacheUsage;
};

export function extractPayload(
  message: unknown,
  price: Price,
  cacheTtl: CacheTtl,
): ExtractedPayload {
  const payload = (message ?? {}) as Payload;
  const snippet = () => JSON.stringify(message)?.slice(0, 200);

  // Priced before anything else can throw. A 200 has already been billed, so
  // every failure below this line still has to carry its cost out.
  const { usage } = payload;
  if (typeof usage?.input_tokens !== "number" || typeof usage.output_tokens !== "number") {
    throw requestFailure(`response reported no token usage, so its cost is unknown: ${snippet()}`);
  }
  const cache: CacheUsage = {
    created: tokenCount(usage.cache_creation_input_tokens),
    read: tokenCount(usage.cache_read_input_tokens),
  };
  const writeMultiplier = cacheTtl === "off" ? 1 : CACHE_WRITE_MULTIPLIER[cacheTtl];
  const cost =
    (usage.input_tokens * price.input +
      cache.created * price.input * writeMultiplier +
      cache.read * price.input * CACHE_READ_MULTIPLIER +
      usage.output_tokens * price.output) /
    1_000_000;
  const thinking = usage.output_tokens_details?.thinking_tokens;
  const thinkingTokens = typeof thinking === "number" ? thinking : undefined;
  // Both `cost` and `cache` ride out on every failure below: the request was
  // billed, and a total that counts one without the other reports its hit rate
  // over a different set of requests than its spend.
  const failed = (message: string, extra: { retryable?: boolean } = {}) =>
    requestFailure(message, { cost, cache, ...extra });

  // Truncation cuts the JSON off mid-object. Reporting it as its own failure
  // beats a parse error: one icon and one sentence cannot overrun a 32k budget
  // on their own, so this means thinking ran away, which a retry will not fix.
  if (payload.stop_reason === "max_tokens") {
    throw failed(`response hit max_tokens (${MAX_TOKENS}) before closing the JSON object`);
  }
  // A refusal is a decision about these exact images, so the retry ladder would
  // reproduce it twice at full price.
  if (payload.stop_reason === "refusal") {
    throw failed("the model declined to describe this icon", { retryable: false });
  }

  // Adaptive thinking emits a thinking block ahead of the answer, so the JSON is
  // the joined text blocks rather than content[0].
  const blocks: ContentBlock[] = Array.isArray(payload.content) ? payload.content : [];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  if (!text) {
    throw failed(
      `response carried no text block (stop_reason ${String(payload.stop_reason)}): ${snippet()}`,
    );
  }

  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    throw failed(`text block is not JSON: ${text.slice(0, 200)}`);
  }
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    throw failed(`text block is not a JSON object: ${text.slice(0, 200)}`);
  }
  return { output, cost, thinkingTokens, cache };
}

export function extractMessage(
  message: unknown,
  name: string,
  price: Price,
  cacheTtl: CacheTtl,
): IconResult {
  const { output, cost, thinkingTokens, cache } = extractPayload(message, price, cacheTtl);
  const failed = (detail: string) => requestFailure(detail, { cost, cache });
  const snippet = JSON.stringify(output).slice(0, 200);

  // Without this a reply carrying no `descriptions` array is indistinguishable
  // from one carrying an empty list, and under `batch` that is recorded as a
  // succeeded request with nothing merged and nothing in `failures` — a paid
  // request lost silently, which is what the schema exists to prevent.
  if (!Array.isArray((output as { descriptions?: unknown }).descriptions)) {
    throw failed(`text block carries no "descriptions" array: ${snippet}`);
  }

  const description = pickDescription(output, name);
  // The harness already knows which icon the reply is about, so a name it did
  // not ask for is not a shortfall to re-describe later — it is a paid answer
  // with nothing in it, which would otherwise be dropped without a word.
  if (description === null) {
    throw failed(`response named no requested icon (${name}): ${snippet}`);
  }

  return { description, cost, thinkingTokens, cache };
}

// The shape `readResults` consumes, so `batch.ts` carries nothing icon-specific.
export const extractDescription = (
  message: unknown,
  name: string,
  price: Price,
  cacheTtl: CacheTtl,
): { value: string; cost: number; cache: CacheUsage } => {
  const { description, cost, cache } = extractMessage(message, name, price, cacheTtl);
  return { value: description, cost, cache: cache ?? { created: 0, read: 0 } };
};

// Over HTTP the bytes are inline and nothing carries a filename, so each image
// is preceded by its own name. With one image per request that label is
// redundant with the request itself, which is the point: the harness owns the
// correspondence rather than asking the model to keep track of it.
//
// The instructions lead so they can be cached. That inverts the order the first
// arms ran under, where the prompt trailed the images and no two requests shared
// a prefix.
async function buildContent(name: string, pngDir: string, cache: CacheTtl): Promise<unknown[]> {
  const png = await readFile(join(pngDir, `${name}.png`));
  const instructions: Record<string, unknown> = { type: "text", text: ATTACHED_INSTRUCTIONS };
  if (cache !== "off") {
    instructions.cache_control =
      cache === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
  }
  // The filename still precedes the image even though the request names only one
  // icon: it is what the reply echoes back, and that echo is the redundant
  // channel `extractMessage` checks.
  return [
    instructions,
    { type: "text", text: `${name}.png` },
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
    },
  ];
}

// One request's worth of parameters. The Messages endpoint takes these as its
// whole body; the Batch endpoint takes the same object as a request's `params`.
export async function buildRequestParams(
  name: string,
  pngDir: string,
  modelId: string,
  cache: CacheTtl,
): Promise<Record<string, unknown>> {
  // Constrained decoding is what makes a fenced or prose-wrapped reply
  // impossible rather than merely discouraged — truncation and refusals still
  // reach the parse, which is why extractMessage names them. Asking in the prompt
  // alone is not enough: with the schema removed, a live batch wrapped its object
  // in a markdown fence and lost 46 of its 50 icons at the parse, all of them
  // well formed and paid for.
  return {
    model: modelId,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: await buildContent(name, pngDir, cache) }],
    output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
  };
}

export function apiHeaders(key: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": API_VERSION,
  };
}

// `retry-after` is in seconds, and on a 429 it is the server stating exactly
// what the fixed backoff ladder was guessing at.
function retryAfterMs(headers: Headers): number | undefined {
  const seconds = Number(headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : undefined;
}

// `cache` has no default: the same value decides what is sent and prices what
// comes back, so a caller that forgot it would send a marked prefix and pay the
// write premium even under `--cache-ttl off`.
export const describeIconApi: DescribeIcon = async (name, { pngDir, model, cache }) => {
  const { id, price } = resolveModel(model);
  const key = assertApiKey();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: apiHeaders(key),
    body: JSON.stringify(await buildRequestParams(name, pngDir, id, cache)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw requestFailure(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`, {
      fatal: FATAL_STATUSES.has(response.status),
      retryAfterMs: retryAfterMs(response.headers),
    });
  }
  return extractApiDescription(body, name, price, cache);
};
