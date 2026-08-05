import { describe, expect, test } from "vitest";
import {
  buildCompareParams,
  COMPARE_INSTRUCTIONS,
  type Comparison,
  estimateCompareCost,
  extractVerdict,
  formatReport,
  pairArms,
} from "./compare";

const PRICE = { input: 1, output: 5 };

const reply = (output: unknown, usage: Record<string, number> = {}) => ({
  content: [{ type: "text", text: JSON.stringify(output) }],
  usage: { input_tokens: 100, output_tokens: 20, ...usage },
});

describe("pairArms", () => {
  const arms = {
    alpha: { sword: "A blade.", shield: "A shield." },
    beta: { sword: "A sharp blade.", helm: "A helm." },
  };

  test("pairs only the icons both arms describe", () => {
    expect(pairArms(arms, "alpha", "beta")).toEqual([
      { name: "sword", a: "A blade.", b: "A sharp blade." },
    ]);
  });

  test("names an arm that was never loaded", () => {
    expect(() => pairArms(arms, "alpha", "gamma")).toThrow(/no corpus loaded for gamma/);
  });
});

describe("extractVerdict", () => {
  test("reads the verdict and the difference", () => {
    const { value } = extractVerdict(
      reply({ verdict: "substantial", difference: " a fish, not a bird " }),
      "sword",
      PRICE,
      "off",
    );
    expect(value).toEqual({ verdict: "substantial", difference: "a fish, not a bird" });
  });

  // Defaulting to `agree` would file a paid request with nothing in it under the
  // one bucket the report does not list.
  test("rejects a reply whose verdict is not one of the three", () => {
    expect(() => extractVerdict(reply({ verdict: "maybe" }), "sword", PRICE, "off")).toThrow(
      /sword: reply carried no verdict/,
    );
  });

  test("carries the cost of a rejected reply out with the failure", () => {
    try {
      extractVerdict(reply({}), "sword", PRICE, "off");
      expect.unreachable();
    } catch (err) {
      expect((err as { cost?: number }).cost).toBeGreaterThan(0);
    }
  });
});

// The name goes with them because the picker searches a description together
// with its name, so an arm that leans on the name rather than repeating it is
// not describing something else.
test("buildCompareParams sends the name and both descriptions, unlabelled", () => {
  const params = buildCompareParams({ name: "sword", a: "A blade.", b: "A sharp blade." }, "judge");
  const [message] = params.messages as [{ content: string }];
  expect(message.content).toBe(
    `${COMPARE_INSTRUCTIONS}\n\nname: sword\nA: A blade.\nB: A sharp blade.`,
  );
  expect(message.content).not.toContain("claude-");
});

// The whole prompt is one unmarked block: below the model's minimum cacheable
// length a marker is ignored silently, and padding up to it costs more than the
// prompt does.
test("buildCompareParams marks nothing for caching", () => {
  const params = buildCompareParams({ name: "sword", a: "A blade.", b: "A blade." }, "judge");
  expect(JSON.stringify(params)).not.toContain("cache_control");
});

test("estimateCompareCost prices every pair at the counted input tokens", () => {
  expect(estimateCompareCost(1_000, PRICE, 200)).toBeCloseTo(0.4);
});

describe("formatReport", () => {
  const pairs = [
    { name: "sword", a: "A blade.", b: "A sharp blade." },
    { name: "kite", a: "A bird of prey.", b: "A diamond kite on a string." },
    { name: "helm", a: "A helm.", b: "A helm with three plumes." },
  ];
  const comparisons: Record<string, Comparison> = {
    sword: { verdict: "agree", difference: "" },
    kite: { verdict: "substantial", difference: "a bird, not a kite" },
    helm: { verdict: "trivial", difference: "plume count" },
  };
  const report = (failures: string[] = []) =>
    formatReport({
      a: "alpha",
      b: "beta",
      judge: "gamma",
      judgedAt: "2026-08-01T14:55:42.207Z",
      pairs,
      comparisons,
      failures,
    });

  test("quotes both descriptions under each disagreement", () => {
    expect(report()).toContain("### kite");
    expect(report()).toContain("_a bird, not a kite_");
    expect(report()).toContain("- **A** A bird of prey.");
    expect(report()).toContain("- **B** A diamond kite on a string.");
  });

  // The list is what gets pasted into the gallery's name filter, so the
  // separator is part of the contract between the two.
  test("heads each section with its names, comma-separated", () => {
    expect(report()).toContain("## substantial (1)\n\n```\nkite\n```");
    expect(report()).toContain("## agree (1)\n\n```\nsword\n```");
  });

  test("counts the agreements without quoting them", () => {
    expect(report()).toContain("## agree (1)");
    expect(report()).not.toContain("A blade.");
  });

  // The judge defaults to the same model as arm A, so a reader who cannot see
  // which model graded the file cannot weigh that confound.
  test("records the judge and the date the pairs were judged", () => {
    expect(report()).toContain("Judged by `gamma` on 2026-08-01.");
  });

  test("lists the requests that failed, so a short collection is visible", () => {
    expect(report(["axe: errored"])).toContain("## failed (1)");
    expect(report(["axe: errored"])).toContain("- axe: errored");
  });
});
