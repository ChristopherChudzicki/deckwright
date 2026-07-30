import { describe, expect, test } from "vitest";
import { buildFlagPrompt, chunk, extractVerdicts, pairArms, pickVerdicts } from "./flag";

const PRICE = { input: 3, output: 15 };

const verdict = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  conflict: false,
  nameConflict: false,
  note: "",
  ...over,
});

const replied = (verdicts: unknown[]) => ({
  usage: { input_tokens: 1000, output_tokens: 500 },
  content: [{ type: "text", text: JSON.stringify({ verdicts }) }],
});

describe("pairArms", () => {
  test("pairs only icons both arms describe, and names the rest", () => {
    const { pairs, unpaired } = pairArms(
      { fireball: "a-fire", broadsword: "a-sword" },
      { fireball: "b-fire" },
    );

    expect(pairs).toEqual([{ name: "fireball", a: "a-fire", b: "b-fire" }]);
    expect(unpaired).toEqual(["broadsword"]);
  });
});

describe("buildFlagPrompt", () => {
  // The judge is told nothing about which model wrote which, because it is one
  // of the two and the question is not which is better.
  test("labels the two descriptions by position, never by model", () => {
    const prompt = buildFlagPrompt([{ name: "fireball", a: "A ball of flame.", b: "A sphere." }]);

    expect(prompt).toContain("### fireball\na: A ball of flame.\nb: A sphere.");
    expect(prompt).not.toMatch(/sonnet|opus/i);
  });
});

describe("pickVerdicts", () => {
  // A clean icon still gets an entry — that is what makes it "judged" rather
  // than "not reached" — but stores as {} so the file reads as a queue.
  test("stores a clean verdict as an empty object", () => {
    expect(pickVerdicts({ verdicts: [verdict("fireball")] }, ["fireball"])).toEqual({
      fireball: {},
    });
  });

  test("keeps the note only on a flagged icon", () => {
    const output = {
      verdicts: [
        verdict("fireball", { conflict: true, note: "  a says flame, b says water  " }),
        verdict("broadsword", { note: "looks fine to me" }),
      ],
    };

    expect(pickVerdicts(output, ["fireball", "broadsword"])).toEqual({
      fireball: { conflict: true, note: "a says flame, b says water" },
      broadsword: {},
    });
  });

  test("drops a name nobody asked about", () => {
    expect(pickVerdicts({ verdicts: [verdict("unrequested")] }, ["fireball"])).toEqual({});
  });

  test("keeps the first of a repeated name", () => {
    const output = { verdicts: [verdict("fireball", { conflict: true }), verdict("fireball")] };
    expect(pickVerdicts(output, ["fireball"])).toEqual({ fireball: { conflict: true } });
  });
});

describe("extractVerdicts", () => {
  test("prices the reply from its reported usage", () => {
    const { cost } = extractVerdicts(replied([verdict("fireball")]), ["fireball"], PRICE);
    expect(cost).toBeCloseTo((1000 * 3 + 500 * 15) / 1_000_000);
  });

  // Same reasoning as the description pass: a reply with no array is a paid
  // request that would otherwise bank as "judged nothing wrong".
  test("fails a reply carrying no verdicts array", () => {
    const message = {
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };

    expect(() => extractVerdicts(message, ["fireball"], PRICE)).toThrow(/no "verdicts" array/);
  });

  // The fix is a smaller --chunk, not a retry, so it is worth its own message.
  test("names truncation rather than reporting a parse error", () => {
    const message = {
      usage: { input_tokens: 10, output_tokens: 10 },
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"verdicts":[' }],
    };

    expect(() => extractVerdicts(message, ["fireball"], PRICE)).toThrow(/smaller --chunk/);
  });
});

test("chunk splits into runs of at most the given size", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});
