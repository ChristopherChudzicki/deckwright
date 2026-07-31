import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ATTACHED_INSTRUCTIONS } from "./prompt";
import {
  type BatchResult,
  batchFailure,
  type CacheTtl,
  type CacheUsage,
  type DescribeBatch,
  pickRequested,
  RESPONSE_SCHEMA,
} from "./transport";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 600_000;
// A ceiling, not a reservation — unused headroom is not billed. Thinking tokens
// draw on the same budget as the ~3k tokens of JSON a 30-icon batch emits, so a
// tight limit buys nothing and truncates the object mid-string.
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

// Rough, and deliberately labelled as a floor where it is printed: image tokens
// for one 512px PNG plus a 30-word description, with nothing for thinking.
const INPUT_TOKENS_PER_ICON = 361;
const OUTPUT_TOKENS_PER_ICON = 45;
// The invariant prefix, ~2,900 characters. Billed once per request rather than
// once per icon, which is what makes the group size a term in the estimate: at
// one icon per request it is the largest input the run sends.
const INSTRUCTION_TOKENS = 793;

// Two numbers, because a cached run's cost is not knowable before it runs. Every
// request after the first either re-reads the prefix at a tenth of an input
// token or writes it again at the ttl's premium, and which of those happens is
// what the run reports afterwards. The bounds coincide when no prefix is sent.
export type CostEstimate = { floor: number; ceiling: number };

export function estimateCost(
  icons: number,
  price: Price,
  opts: { batchSize: number; cacheTtl: CacheTtl },
): CostEstimate {
  const { batchSize, cacheTtl } = opts;
  const requests = Math.ceil(icons / batchSize);
  const perIcon =
    icons * (INPUT_TOKENS_PER_ICON * price.input + OUTPUT_TOKENS_PER_ICON * price.output);
  const prefix = INSTRUCTION_TOKENS * price.input;
  const write = cacheTtl === "off" ? 1 : CACHE_WRITE_MULTIPLIER[cacheTtl];
  const ceiling = perIcon + requests * prefix * write;
  const floor =
    cacheTtl === "off"
      ? ceiling
      : perIcon + prefix * write + (requests - 1) * prefix * CACHE_READ_MULTIPLIER;
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

export function extractApiDescriptions(
  body: string,
  requested: readonly string[],
  price: Price,
  cacheTtl: CacheTtl,
): BatchResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw batchFailure(`response body is not JSON: ${body.slice(0, 200)}`);
  }
  return extractMessage(payload, requested, price, cacheTtl);
}

// Takes a parsed message rather than a response body, because the Batch API
// delivers the same object nested inside a JSONL result line.
//
// `cacheTtl` has no default on purpose: it has to be the ttl the request was
// actually sent with, and a wrong one silently reprices every cached token.
export function extractMessage(
  message: unknown,
  requested: readonly string[],
  price: Price,
  cacheTtl: CacheTtl,
): BatchResult {
  const payload = (message ?? {}) as Payload;
  const snippet = () => JSON.stringify(message)?.slice(0, 200);

  // Priced before anything else can throw. A 200 has already been billed, so
  // every failure below this line still has to carry its cost out.
  const { usage } = payload;
  if (typeof usage?.input_tokens !== "number" || typeof usage.output_tokens !== "number") {
    throw batchFailure(`response reported no token usage, so its cost is unknown: ${snippet()}`);
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
  const failed = (message: string, extra: { retryable?: boolean } = {}) =>
    batchFailure(message, { cost, ...extra });

  // Truncation cuts the JSON off mid-object. Reporting it as its own failure
  // beats a parse error, because the fix is a smaller batch, not a retry.
  if (payload.stop_reason === "max_tokens") {
    throw failed(`response hit max_tokens (${MAX_TOKENS}) before closing the JSON object`);
  }
  // A refusal is a decision about these exact images, so the retry ladder would
  // reproduce it twice at full price.
  if (payload.stop_reason === "refusal") {
    throw failed("the model declined to describe this batch", { retryable: false });
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
  // Without this a reply carrying no `descriptions` array is indistinguishable
  // from one carrying an empty list, and under `batch` that is recorded as a
  // succeeded request with nothing merged and nothing in `failures` — a paid
  // request lost silently, which is what the schema exists to prevent.
  if (!Array.isArray((output as { descriptions?: unknown }).descriptions)) {
    throw failed(`text block carries no "descriptions" array: ${text.slice(0, 200)}`);
  }

  const descriptions = pickRequested(output, requested);
  // At one image per request the harness already knows which icon the reply is
  // about, so a name it did not ask for is not a shortfall to re-describe later
  // — it is a paid answer that would otherwise be dropped without a word.
  // Ambiguous above one image, where the same reply may be a partial answer.
  if (requested.length === 1 && Object.keys(descriptions).length === 0) {
    throw failed(`response named no requested icon (${requested.join()}): ${text.slice(0, 200)}`);
  }

  return { descriptions, cost, thinkingTokens, cache };
}

// Over HTTP the bytes are inline and nothing carries a filename, so each image
// is preceded by its own name. With one image per request that label is
// redundant with the request itself, which is the point: the harness owns the
// correspondence rather than asking the model to keep track of it.
//
// The instructions lead so they can be cached. That inverts the order the first
// arms ran under, where the prompt trailed the images and no two requests shared
// a prefix.
async function buildContent(
  names: readonly string[],
  pngDir: string,
  cache: CacheTtl,
): Promise<unknown[]> {
  const pngs = await Promise.all(names.map((name) => readFile(join(pngDir, `${name}.png`))));
  const instructions: Record<string, unknown> = { type: "text", text: ATTACHED_INSTRUCTIONS };
  if (cache !== "off") {
    instructions.cache_control =
      cache === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
  }
  const content: unknown[] = [instructions];
  for (const [index, name] of names.entries()) {
    content.push({ type: "text", text: `${name}.png` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: pngs[index].toString("base64") },
    });
  }
  return content;
}

// One request's worth of parameters. The Messages endpoint takes these as its
// whole body; the Batch endpoint takes the same object as a request's `params`.
export async function buildRequestParams(
  names: readonly string[],
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
    messages: [{ role: "user", content: await buildContent(names, pngDir, cache) }],
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

// The one place `cache` may default, because here the same value both decides
// what is sent and prices what comes back — a caller that omits it gets a
// consistent 5m run rather than a mispriced one.
export const describeBatchApi: DescribeBatch = async (names, { pngDir, model, cache = "5m" }) => {
  const { id, price } = resolveModel(model);
  const key = assertApiKey();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: apiHeaders(key),
    body: JSON.stringify(await buildRequestParams(names, pngDir, id, cache)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw batchFailure(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`, {
      fatal: FATAL_STATUSES.has(response.status),
      retryAfterMs: retryAfterMs(response.headers),
    });
  }
  return extractApiDescriptions(body, names, price, cache);
};
