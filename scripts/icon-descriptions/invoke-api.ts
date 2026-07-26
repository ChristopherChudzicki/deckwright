import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BatchResult, DescribeBatch } from "./invoke";
import { responseSchema } from "./invoke";
import { buildPrompt } from "./prompt";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 600_000;
const MAX_TOKENS = 8192;

export type Price = { input: number; output: number };

// The CLI accepts a friendly alias and bills against a subscription; the HTTP
// API needs a concrete id and bills per token, so each entry has to carry both.
// Only models with pricing confirmed against the pricing page belong here — a
// guessed rate would silently misreport the run's spend.
const MODELS: Record<string, { id: string; price: Price }> = {
  // Introductory rate through 2026-08-31, after which Sonnet 5 is 3/15.
  sonnet: { id: "claude-sonnet-5", price: { input: 2, output: 10 } },
};

export function resolveModel(model: string): { id: string; price: Price } {
  const entry = MODELS[model];
  if (!entry) {
    throw new Error(
      `--transport api has no pricing for model "${model}"; known: ${Object.keys(MODELS).join(", ")}`,
    );
  }
  return entry;
}

export function assertApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set — export a key, or pass --transport cli.");
  }
  return key;
}

type ContentBlock = { type?: unknown; text?: unknown };
type Payload = {
  type?: unknown;
  error?: { message?: unknown };
  content?: unknown;
  stop_reason?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
};

const asCount = (value: unknown): number => (typeof value === "number" ? value : 0);

export function extractApiDescriptions(
  body: string,
  requested: readonly string[],
  price: Price,
): BatchResult {
  let payload: Payload;
  try {
    payload = JSON.parse(body) as Payload;
  } catch {
    throw new Error(`response body is not JSON: ${body.slice(0, 200)}`);
  }
  if (payload.type === "error") {
    throw new Error(`API error: ${String(payload.error?.message).slice(0, 300)}`);
  }

  // Truncation cuts the JSON off mid-object. Reporting it as its own failure
  // beats a parse error, because the fix is a smaller batch, not a retry.
  if (payload.stop_reason === "max_tokens") {
    throw new Error(`response hit max_tokens (${MAX_TOKENS}) before closing the JSON object`);
  }

  const blocks: ContentBlock[] = Array.isArray(payload.content) ? payload.content : [];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  if (!text) {
    throw new Error(
      `response carried no text block (stop_reason ${String(payload.stop_reason)}): ` +
        `${body.slice(0, 200)}`,
    );
  }

  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error(`text block is not JSON: ${text.slice(0, 200)}`);
  }
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    throw new Error(`text block is not a JSON object: ${text.slice(0, 200)}`);
  }

  const wanted = new Set(requested);
  const descriptions: Record<string, string> = {};
  for (const [name, value] of Object.entries(output)) {
    if (!wanted.has(name) || typeof value !== "string") continue;
    descriptions[name] = value.trim();
  }

  const cost =
    (asCount(payload.usage?.input_tokens) * price.input +
      asCount(payload.usage?.output_tokens) * price.output) /
    1_000_000;
  return { descriptions, cost };
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
  content.push({ type: "text", text: buildPrompt(names) });
  return content;
}

export const describeBatchApi: DescribeBatch = async (names, { pngDir, model }) => {
  const { id, price } = resolveModel(model);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": assertApiKey(),
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: id,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: await buildContent(names, pngDir) }],
      // Constrained decoding, so a short or renamed response is impossible
      // rather than a shortfall we would pay to close in a later run.
      output_config: { format: { type: "json_schema", schema: responseSchema(names) } },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }
  return extractApiDescriptions(body, names, price);
};
