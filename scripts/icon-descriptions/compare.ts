import { apiHeaders, extractPayload, type Price } from "./invoke-api";
import type { Arms } from "./promote";
import { type CacheTtl, requestFailure } from "./transport";

const COUNT_TOKENS_URL = "https://api.anthropic.com/v1/messages/count_tokens";

// The reply is a verdict and a phrase, so this is almost entirely thinking
// headroom. Unused headroom is not billed; a tight limit would only truncate the
// object mid-string.
const MAX_TOKENS = 8_192;

export const VERDICTS = ["agree", "trivial", "substantial"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Comparison = { verdict: Verdict; difference: string };

// The arms are unlabelled on purpose. Told which model wrote which sentence, the
// judge has a reason to prefer one that has nothing to do with the sentences, and
// the whole point of the pass is to rank pairs for a human to look at.
export const COMPARE_INSTRUCTIONS = `Two descriptions of the same icon, written independently from the same artwork. You cannot see the artwork. Judge only whether a reader of each would picture the same thing.

agree — the same subject and the same salient details, however differently worded.
trivial — the same subject, differing only in details a reader would not act on: the count of a repeated element, an orientation word, or how much one leaves unsaid.
substantial — they name different subjects, or disagree about a detail that changes what a reader pictures.

When the verdict is not "agree", name what differs in a few words; when it is, leave "difference" empty. Write nothing else.`;

// One text block, unmarked. Sonnet's minimum cacheable length is 1,024 tokens and
// these instructions are nowhere near it, so a cache_control marker here would be
// ignored without an error. Padding up to the floor is a loss on a prompt this
// short: 1,024 tokens cached at an 80% hit rate still bill ~492 per request, more
// than the whole prompt costs uncached.
export const comparePrompt = (a: string, b: string): string =>
  `${COMPARE_INSTRUCTIONS}\n\nA: ${a}\nB: ${b}`;

export const COMPARE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: [...VERDICTS] },
    difference: { type: "string" },
  },
  required: ["verdict", "difference"],
  additionalProperties: false,
};

export type Pair = { name: string; a: string; b: string };

export function buildCompareParams(pair: Pair, modelId: string): Record<string, unknown> {
  return {
    model: modelId,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: comparePrompt(pair.a, pair.b) }],
    output_config: { format: { type: "json_schema", schema: COMPARE_SCHEMA } },
  };
}

const isVerdict = (value: unknown): value is Verdict => VERDICTS.includes(value as Verdict);

export function extractVerdict(message: unknown, name: string, price: Price, cacheTtl: CacheTtl) {
  const { output, cost, cache } = extractPayload(message, price, cacheTtl);
  const { verdict, difference } = output as { verdict?: unknown; difference?: unknown };
  // A reply that named no verdict is a paid request with nothing in it. Recorded
  // as a failure rather than defaulted to `agree`, which would file it under the
  // one bucket nobody reads.
  if (!isVerdict(verdict)) {
    throw requestFailure(
      `${name}: reply carried no verdict: ${JSON.stringify(output).slice(0, 200)}`,
      { cost, cache },
    );
  }
  return {
    value: { verdict, difference: typeof difference === "string" ? difference.trim() : "" },
    cost,
    cache,
  };
}

// Only an icon both arms describe can disagree. One that only one arm has is a
// gap in that arm, which `--validate` already reports, and pairing it against
// nothing would spend a request to be told so again.
export function pairArms(arms: Arms, a: string, b: string): Pair[] {
  const left = arms[a];
  const right = arms[b];
  for (const [model, arm] of [
    [a, left],
    [b, right],
  ] as const) {
    if (!arm) throw new Error(`no corpus loaded for ${model}`);
  }
  const pairs: Pair[] = [];
  for (const name of Object.keys(left ?? {}).sort()) {
    const first = left?.[name];
    const second = right?.[name];
    if (first === undefined || second === undefined) continue;
    pairs.push({ name, a: first, b: second });
  }
  return pairs;
}

// Counted by the API rather than guessed from character length: an earlier
// estimate here divided characters by 3.7 and came out 35% under what the same
// prompt was billed for. The output side is still a guess, so the total is a
// floor — thinking tokens are billed as output and nothing predicts them.
const OUTPUT_TOKENS_PER_PAIR = 40;

export async function countPromptTokens(
  params: Record<string, unknown>,
  key: string,
): Promise<number> {
  const response = await fetch(COUNT_TOKENS_URL, {
    method: "POST",
    headers: apiHeaders(key),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw requestFailure(`Counting tokens failed: HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const { input_tokens: tokens } = JSON.parse(body) as { input_tokens?: unknown };
  if (typeof tokens !== "number") {
    throw requestFailure(`Token count carried no input_tokens: ${body.slice(0, 200)}`);
  }
  return tokens;
}

export function estimateCompareCost(pairs: number, price: Price, inputTokens: number): number {
  return (pairs * (inputTokens * price.input + OUTPUT_TOKENS_PER_PAIR * price.output)) / 1_000_000;
}

const heading = (verdict: Verdict, count: number): string => `## ${verdict} (${count})`;

// Markdown, and the substantial pairs carry both sentences inline. The file
// exists to be read straight through by a human deciding which arm to ship for
// an icon, and sending them back to two corpus files to look each one up is what
// would stop that happening.
export function formatReport(opts: {
  a: string;
  b: string;
  pairs: readonly Pair[];
  comparisons: Record<string, Comparison>;
  failures: readonly string[];
}): string {
  const { a, b, pairs, comparisons, failures } = opts;
  const byName = new Map(pairs.map((pair) => [pair.name, pair]));
  const judged = Object.entries(comparisons);
  const of = (verdict: Verdict) => judged.filter(([, entry]) => entry.verdict === verdict);

  const lines: string[] = [
    `# Cross-arm disagreements`,
    "",
    `A is \`${a}\`; B is \`${b}\`. ${judged.length} of ${pairs.length} pairs judged.`,
    "",
    // The one thing a reader of this file could get wrong: an icon both arms
    // misread the same way agrees, and agreement is the bucket this file does
    // not quote. Measured at 7.8x chance on style words — see the README — so
    // it is a real gap, not a formality.
    "Agreement is not evidence: two arms sharing a prompt can be wrong together, and those pairs sort into `agree` unquoted. Use this to choose what to open in the gallery, not to decide what is right.",
    "",
  ];

  for (const verdict of ["substantial", "trivial"] as const) {
    const entries = of(verdict);
    lines.push(heading(verdict, entries.length), "");
    for (const [name, entry] of entries) {
      const pair = byName.get(name);
      lines.push(`### ${name}`, "");
      if (entry.difference) lines.push(`_${entry.difference}_`, "");
      lines.push(`- **A** ${pair?.a ?? ""}`, `- **B** ${pair?.b ?? ""}`, "");
    }
  }

  lines.push(heading("agree", of("agree").length), "");
  lines.push(
    of("agree")
      .map(([name]) => name)
      .join(" "),
    "",
  );

  if (failures.length) {
    lines.push(`## failed (${failures.length})`, "", ...failures.map((line) => `- ${line}`), "");
  }
  return lines.join("\n");
}
