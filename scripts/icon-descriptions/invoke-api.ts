import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildPrompt } from "./prompt";
import {
  type BatchResult,
  batchFailure,
  type DescribeBatch,
  pickRequested,
  responseSchema,
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

export function estimateCost(icons: number, price: Price): number {
  return (
    (icons * (INPUT_TOKENS_PER_ICON * price.input + OUTPUT_TOKENS_PER_ICON * price.output)) /
    1_000_000
  );
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
    output_tokens_details?: { thinking_tokens?: unknown };
  };
};

export function extractApiDescriptions(
  body: string,
  requested: readonly string[],
  price: Price,
): BatchResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw batchFailure(`response body is not JSON: ${body.slice(0, 200)}`);
  }
  return extractMessage(payload, requested, price);
}

// Takes a parsed message rather than a response body, because the Batch API
// delivers the same object nested inside a JSONL result line.
export function extractMessage(
  message: unknown,
  requested: readonly string[],
  price: Price,
): BatchResult {
  const payload = (message ?? {}) as Payload;
  const snippet = () => JSON.stringify(message)?.slice(0, 200);

  // Priced before anything else can throw. A 200 has already been billed, so
  // every failure below this line still has to carry its cost out.
  const { usage } = payload;
  if (typeof usage?.input_tokens !== "number" || typeof usage.output_tokens !== "number") {
    throw batchFailure(`response reported no token usage, so its cost is unknown: ${snippet()}`);
  }
  const cost = (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000;
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

  return { descriptions: pickRequested(output, requested), cost, thinkingTokens };
}

// The CLI reads the PNGs itself, so the pinned prompt names files rather than
// images. Over HTTP the bytes are inline and nothing carries a filename, so
// each image is preceded by its own name — that label, not position, is what
// ties a description back to an icon.
async function buildContent(names: readonly string[], pngDir: string): Promise<unknown[]> {
  const pngs = await Promise.all(names.map((name) => readFile(join(pngDir, `${name}.png`))));
  const content: unknown[] = [];
  for (const [index, name] of names.entries()) {
    content.push({ type: "text", text: `${name}.png` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: pngs[index].toString("base64") },
    });
  }
  content.push({ type: "text", text: buildPrompt(names, "attached") });
  return content;
}

// One request's worth of parameters. The Messages endpoint takes these as its
// whole body; the Batch endpoint takes the same object as a request's `params`.
export async function buildRequestParams(
  names: readonly string[],
  pngDir: string,
  modelId: string,
): Promise<Record<string, unknown>> {
  return {
    model: modelId,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: await buildContent(names, pngDir) }],
    // Constrained decoding pins the key set and the value types. It does not
    // pin content — structured outputs reject `minLength`, so an empty string
    // is schema-valid — which is why validateEntry still gates every entry.
    output_config: { format: { type: "json_schema", schema: responseSchema(names) } },
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

export const describeBatchApi: DescribeBatch = async (names, { pngDir, model }) => {
  const { id, price } = resolveModel(model);
  const key = assertApiKey();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: apiHeaders(key),
    body: JSON.stringify(await buildRequestParams(names, pngDir, id)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw batchFailure(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`, {
      fatal: FATAL_STATUSES.has(response.status),
      retryAfterMs: retryAfterMs(response.headers),
    });
  }
  return extractApiDescriptions(body, names, price);
};
