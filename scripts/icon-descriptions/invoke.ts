import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildPrompt } from "./prompt";
import {
  type DescribeIcon,
  type IconResult,
  pickDescription,
  RESPONSE_SCHEMA,
  requestFailure,
} from "./transport";

const execFileP = promisify(execFile);

// A timeout yields nothing while still having consumed quota, so cutting off a
// slow-but-working invocation is a guaranteed loss. The ceiling is deliberately
// far above any observed invocation.
const INVOKE_TIMEOUT_MS = 600_000;

type Envelope = {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  subtype?: unknown;
  total_cost_usd?: number;
};

export function extractDescription(stdout: string, name: string): IconResult {
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
    throw requestFailure(`claude -p reported an error: ${String(envelope.result).slice(0, 300)}`, {
      cost,
    });
  }

  // A run can report subtype "success" and still carry no structured output;
  // that is a failure, not an empty reply.
  const output = envelope.structured_output;
  if (
    typeof output !== "object" ||
    output === null ||
    Array.isArray(output) ||
    !Array.isArray((output as { descriptions?: unknown }).descriptions)
  ) {
    throw requestFailure(
      `claude -p returned no structured_output (subtype ${String(envelope.subtype)}): ` +
        `${stdout.slice(0, 200)}`,
      { cost },
    );
  }

  const description = pickDescription(output, name);
  if (description === null) {
    throw requestFailure(`claude -p named no requested icon (${name}): ${stdout.slice(0, 200)}`, {
      cost,
    });
  }
  return { description, cost };
}

// Without this, a missing binary surfaces only after every PNG has been
// rendered, and then as 3 retries per request with real backoff between them.
export async function assertClaudeAvailable(): Promise<void> {
  try {
    await execFileP("claude", ["--version"]);
  } catch {
    throw new Error("`claude` binary not found on PATH — install the CLI and authenticate.");
  }
}

export const describeIcon: DescribeIcon = async (name, { pngDir, model }) => {
  let stdout: string;
  try {
    ({ stdout } = await execFileP(
      "claude",
      [
        "-p",
        buildPrompt([name]),
        "--allowedTools",
        "Read",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(RESPONSE_SCHEMA),
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
  return extractDescription(stdout, name);
};
