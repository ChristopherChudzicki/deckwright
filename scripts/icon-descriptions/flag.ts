import { batchFailure } from "./transport";

// One entry per icon that has been judged. Absent fields mean "not flagged", so
// a clean icon stores as `{}` — which keeps the file readable, since every icon
// with content in it is one that wants a human, and keeps the diff to real
// findings when the pass is re-run.
export type Verdict = { conflict?: true; nameConflict?: true; note?: string };

export type Pair = { name: string; a: string; b: string };

// Same constraint as the description schema: one static shape for every request,
// because a grammar is compiled and cached per schema structure against an
// org-wide limit. Names live in values, never in keys.
//
// Every field is required, including a `note` that is empty on a clean icon.
// Listing only the flagged icons would be cheaper, but then a chunk the model
// under-answered is indistinguishable from a chunk with nothing wrong — and
// silently judging 40 of 50 icons is the one failure this pass exists to not
// have. A verdict per icon makes a shortfall countable.
export const FLAG_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          conflict: { type: "boolean" },
          nameConflict: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["name", "conflict", "nameConflict", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

export const INSTRUCTIONS = `You are checking machine-generated descriptions of icons for likely errors. Each icon below has a name and two descriptions, "a" and "b", written independently from the artwork by two different models. You cannot see the artwork, and neither description is authoritative.

For each icon, answer two questions.

conflict: do a and b disagree about what the artwork depicts? Different wording, length, detail or emphasis is not a conflict, and neither is one description mentioning something the other omits. Naming a different object, or describing arrangements that cannot both be true of one image, is.

nameConflict: could what "a" describes not plausibly be the thing the icon's name refers to? The name is a hint about intent, not a caption: an icon may depict a symbol, an abstraction, a single part of the named thing, or a scene loosely associated with it, and none of those are conflicts. Flag only a real mismatch.

note: one short clause naming the discrepancy, or an empty string when neither flag is set.

Judge every icon listed. Reply with ONLY a JSON object with a "verdicts" array holding one entry per icon, where "name" is the icon's name exactly as given.`;

export function buildFlagPrompt(pairs: readonly Pair[]): string {
  const listed = pairs.map(({ name, a, b }) => `### ${name}\na: ${a}\nb: ${b}`).join("\n\n");
  return `${INSTRUCTIONS}\n\n${listed}`;
}

// Icons described by both arms, which are the only ones a disagreement can be
// read from. A name in one arm and not the other is returned rather than
// dropped, so a partial arm shows up as a count instead of a quietly shorter run.
export function pairArms(
  a: Record<string, string>,
  b: Record<string, string>,
): { pairs: Pair[]; unpaired: string[] } {
  const pairs: Pair[] = [];
  const unpaired: string[] = [];
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const left = a[name];
    const right = b[name];
    if (left === undefined || right === undefined) unpaired.push(name);
    else pairs.push({ name, a: left, b: right });
  }
  pairs.sort((x, y) => x.name.localeCompare(y.name));
  return { pairs, unpaired: unpaired.sort() };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

type Listed = { name?: unknown; conflict?: unknown; nameConflict?: unknown; note?: unknown };

// Mirrors `pickRequested`: the schema fixes the shape but not the contents, so an
// unrequested or repeated name is dropped here and a shortfall is left for the
// caller to report.
export function pickVerdicts(
  output: object,
  requested: readonly string[],
): Record<string, Verdict> {
  const wanted = new Set(requested);
  const { verdicts: listed } = output as { verdicts?: unknown };
  const verdicts: Record<string, Verdict> = {};
  for (const entry of Array.isArray(listed) ? (listed as Listed[]) : []) {
    const { name, conflict, nameConflict, note } = entry ?? {};
    if (typeof name !== "string" || !wanted.has(name) || name in verdicts) continue;
    const flagged = conflict === true || nameConflict === true;
    verdicts[name] = {
      ...(conflict === true ? { conflict: true } : {}),
      ...(nameConflict === true ? { nameConflict: true } : {}),
      ...(flagged && typeof note === "string" && note.trim() !== "" ? { note: note.trim() } : {}),
    };
  }
  return verdicts;
}

export function extractVerdicts(
  message: unknown,
  requested: readonly string[],
  price: { input: number; output: number },
): {
  verdicts: Record<string, Verdict>;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
} {
  const payload = (message ?? {}) as {
    content?: unknown;
    stop_reason?: unknown;
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      output_tokens_details?: { thinking_tokens?: unknown };
    };
  };
  const snippet = () => JSON.stringify(message)?.slice(0, 200);

  const { usage } = payload;
  if (typeof usage?.input_tokens !== "number" || typeof usage.output_tokens !== "number") {
    throw batchFailure(`response reported no token usage, so its cost is unknown: ${snippet()}`);
  }
  const cost = (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000;
  const failed = (message: string, extra: { retryable?: boolean } = {}) =>
    batchFailure(message, { cost, ...extra });

  if (payload.stop_reason === "max_tokens") {
    throw failed("response hit max_tokens before closing the JSON object; use a smaller --chunk");
  }
  if (payload.stop_reason === "refusal") {
    throw failed("the model declined to judge this chunk", { retryable: false });
  }

  const blocks: { type?: unknown; text?: unknown }[] = Array.isArray(payload.content)
    ? payload.content
    : [];
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  if (!text) throw failed(`response carried no text block: ${snippet()}`);

  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    throw failed(`text block is not JSON: ${text.slice(0, 200)}`);
  }
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    throw failed(`text block is not a JSON object: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray((output as { verdicts?: unknown }).verdicts)) {
    throw failed(`text block carries no "verdicts" array: ${text.slice(0, 200)}`);
  }

  const thinking = usage.output_tokens_details?.thinking_tokens;
  return {
    verdicts: pickVerdicts(output, requested),
    cost,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    // Billed inside output_tokens, not alongside them. Reported because a
    // verdict is ~25 tokens of JSON and a measured run spent four times that
    // per icon — without the split there is no way to tell an expensive
    // response from an expensive deliberation.
    thinkingTokens: typeof thinking === "number" ? thinking : undefined,
  };
}

// Measured over a 50-icon chunk at the default --effort, not derived from
// character counts: an estimate built from the text alone came in at a quarter
// of the bill, because the judge thinks before it answers and thinking is billed
// inside output_tokens. Two thirds of the output below is deliberation, so the
// estimate tracks effort — `low` runs about a third cheaper, `high` about 10%
// dearer.
const INPUT_TOKENS_PER_ICON = 98;
const OUTPUT_TOKENS_PER_ICON = 88;

export function estimateFlagCost(icons: number, price: { input: number; output: number }): number {
  return (
    (icons * (INPUT_TOKENS_PER_ICON * price.input + OUTPUT_TOKENS_PER_ICON * price.output)) /
    1_000_000
  );
}

export function readVerdicts(parsed: unknown, path: string): Record<string, Verdict> {
  const entries =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? Object.entries(parsed)
      : undefined;
  if (
    !entries?.every(
      ([, value]) => typeof value === "object" && value !== null && !Array.isArray(value),
    )
  ) {
    throw new Error(`${path} is not a flag file: expected an object of verdicts.`);
  }
  return Object.fromEntries(entries) as Record<string, Verdict>;
}
