import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildPrompt } from "./prompt";
import {
  type BatchResult,
  batchFailure,
  type DescribeBatch,
  pickRequested,
  responseSchema,
} from "./transport";

const execFileP = promisify(execFile);

// A timeout yields nothing while still having consumed quota, so cutting off a
// slow-but-working invocation is a guaranteed loss. Measured mean for a batch
// of 30 is ~84s; the ceiling is deliberately far above it.
const INVOKE_TIMEOUT_MS = 600_000;

type Envelope = {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  subtype?: unknown;
  total_cost_usd?: number;
};

export function extractDescriptions(stdout: string, requested: readonly string[]): BatchResult {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(stdout) as Envelope;
  } catch {
    throw new Error(`stdout is not a claude -p JSON envelope: ${stdout.slice(0, 200)}`);
  }
  // The envelope parsed, so quota was consumed and every failure below this line
  // has to carry its cost out.
  const cost = envelope.total_cost_usd ?? 0;
  if (envelope.is_error) {
    throw batchFailure(`claude -p reported an error: ${String(envelope.result).slice(0, 300)}`, {
      cost,
    });
  }

  // A run can report subtype "success" and still carry no structured output;
  // that is a failure, not an empty batch.
  const output = envelope.structured_output;
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    throw batchFailure(
      `claude -p returned no structured_output (subtype ${String(envelope.subtype)}): ` +
        `${stdout.slice(0, 200)}`,
      { cost },
    );
  }

  return { descriptions: pickRequested(output, requested), cost };
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
        buildPrompt(names, "on-disk"),
        "--allowedTools",
        "Read",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(responseSchema()),
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
