import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildPrompt } from "./prompt";

const execFileP = promisify(execFile);

export const DEFAULT_MODEL = "sonnet";
const INVOKE_TIMEOUT_MS = 300_000;

export type BatchResult = { descriptions: Record<string, string>; cost: number };
export type DescribeBatch = (
  names: readonly string[],
  opts: { pngDir: string; model: string },
) => Promise<BatchResult>;

type Envelope = { is_error?: boolean; result?: unknown; total_cost_usd?: number };

function scanJsonObject(body: string): unknown {
  const start = body.indexOf("{");
  if (start === -1) throw new Error(`no JSON object in model response: ${body.slice(0, 200)}`);

  // Brace counting must skip string literals: a description containing "}"
  // would otherwise close the object early and truncate the JSON.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error(`unbalanced JSON object in model response: ${body.slice(start, start + 200)}`);
}

// Try every fenced block, then the raw text. Committing to the first fence
// loses the answer whenever the model fences something else too — a narrated
// filename before the JSON, or an inline `Read` span after it.
function firstJsonObject(text: string): unknown {
  const body = text.trim();
  const candidates = [...body.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
    .map((match) => match[1]?.trim())
    .filter((block): block is string => Boolean(block));
  candidates.push(body);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return scanJsonObject(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function extractDescriptions(stdout: string, requested: readonly string[]): BatchResult {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(stdout) as Envelope;
  } catch {
    throw new Error(`stdout is not a claude -p JSON envelope: ${stdout.slice(0, 200)}`);
  }
  if (typeof envelope.result !== "string") {
    throw new Error(`claude -p envelope has no result string: ${stdout.slice(0, 200)}`);
  }
  if (envelope.is_error) throw new Error(`claude -p reported an error: ${envelope.result}`);

  const parsed = firstJsonObject(envelope.result) as Record<string, unknown>;
  const wanted = new Set(requested);
  const descriptions: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(parsed)) {
    const key = rawKey.replace(/\.png$/, "");
    if (!wanted.has(key) || typeof value !== "string") continue;
    descriptions[key] = value;
  }
  return { descriptions, cost: envelope.total_cost_usd ?? 0 };
}

// Without this, a missing binary surfaces only after every PNG has been
// rendered, and then as 3 retries per batch with real backoff between them.
export async function assertClaudeAvailable(): Promise<void> {
  try {
    await execFileP("claude", ["--version"]);
  } catch {
    throw new Error("`claude` binary not found on PATH — install the CLI and authenticate.");
  }
}

export const describeBatch: DescribeBatch = async (names, { pngDir, model }) => {
  let stdout: string;
  try {
    ({ stdout } = await execFileP(
      "claude",
      [
        "-p",
        buildPrompt(names),
        "--allowedTools",
        "Read",
        "--output-format",
        "json",
        "--model",
        model,
      ],
      {
        cwd: pngDir,
        maxBuffer: 64 * 1024 * 1024,
        timeout: INVOKE_TIMEOUT_MS,
        killSignal: "SIGKILL",
      },
    ));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("`claude` binary not found on PATH — install the CLI and authenticate.");
    }
    throw err;
  }
  return extractDescriptions(stdout, names);
};
