import { describe, expect, test } from "vitest";
import { extractDescriptions } from "./invoke";
import { buildPrompt } from "./prompt";

const envelope = (result: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "result",
    is_error: false,
    result,
    total_cost_usd: 0.31,
    ...extra,
  });

describe("buildPrompt", () => {
  test("lists each requested icon as a .png filename", () => {
    expect(buildPrompt(["fireball", "broadsword"])).toContain("fireball.png\nbroadsword.png");
  });

  test("keeps the authority clause that makes the image outrank the name", () => {
    expect(buildPrompt(["fireball"])).toContain("the image is authoritative");
  });
});

describe("extractDescriptions", () => {
  test("unwraps the envelope rather than parsing it as the answer", () => {
    const { descriptions, cost } = extractDescriptions(
      envelope('{"fireball": "A ball of flame."}'),
      ["fireball"],
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
    expect(cost).toBe(0.31);
  });

  test("strips a fenced code block", () => {
    const { descriptions } = extractDescriptions(
      envelope('```json\n{"fireball": "A ball of flame."}\n```'),
      ["fireball"],
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
  });

  test("skips a prose preamble", () => {
    const { descriptions } = extractDescriptions(
      envelope('Here are the descriptions:\n\n{"fireball": "A ball of flame."}'),
      ["fireball"],
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
  });

  test("tolerates a nested brace by matching depth rather than the first close", () => {
    const { descriptions } = extractDescriptions(envelope('{"a": "x {y} z", "b": "plain"}'), [
      "a",
      "b",
    ]);
    expect(descriptions).toEqual({ a: "x {y} z", b: "plain" });
  });

  test("accepts keys that kept the .png extension", () => {
    const { descriptions } = extractDescriptions(envelope('{"fireball.png": "A ball of flame."}'), [
      "fireball",
    ]);
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
  });

  // Measured: the batch-60 run returned an object of the right size in which
  // one key matched no requested file, silently losing butter-toast.
  test("drops a key that names no requested icon and keeps the rest", () => {
    const { descriptions } = extractDescriptions(
      envelope('{"fireball": "A ball of flame.", "butter-toads": "Nonsense."}'),
      ["fireball", "butter-toast"],
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
  });

  test("drops a non-string value and keeps the rest", () => {
    const { descriptions } = extractDescriptions(
      envelope('{"fireball": "A ball of flame.", "broadsword": null}'),
      ["fireball", "broadsword"],
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
  });

  test("throws when the envelope reports an error", () => {
    expect(() =>
      extractDescriptions(envelope("Credit balance too low", { is_error: true }), ["fireball"]),
    ).toThrow(/Credit balance too low/);
  });

  test("throws when the response contains no object", () => {
    expect(() =>
      extractDescriptions(envelope("I could not read the files."), ["fireball"]),
    ).toThrow(/no JSON object/);
  });

  test("throws when the object never closes", () => {
    expect(() => extractDescriptions(envelope('{"fireball": "A ball'), ["fireball"])).toThrow(
      /unbalanced/,
    );
  });

  test("throws when stdout is not the expected envelope", () => {
    expect(() => extractDescriptions("command not found", ["fireball"])).toThrow(/envelope/);
  });
});
