import { describe, expect, test } from "vitest";
import { pickRequested, responseSchema } from "./transport";

describe("responseSchema", () => {
  // Requiring every name is what turns a short response into a retry instead of
  // a silent shortfall that costs a whole extra invocation to close later. Only
  // the cli transport can afford it; see the output_config note in invoke-api.ts.
  test("requires every requested icon and forbids any other key", () => {
    expect(responseSchema(["fireball", "broadsword"])).toEqual({
      type: "object",
      properties: { fireball: { type: "string" }, broadsword: { type: "string" } },
      required: ["fireball", "broadsword"],
      additionalProperties: false,
    });
  });
});

describe("pickRequested", () => {
  test("trims surrounding whitespace", () => {
    expect(pickRequested({ fireball: "  A ball of flame.\n" }, ["fireball"])).toEqual({
      fireball: "A ball of flame.",
    });
  });

  // A wrong key silently lost butter-toast in a measured run, back when nothing
  // constrained the response shape.
  test("drops a key that names no requested icon and keeps the rest", () => {
    expect(
      pickRequested({ fireball: "A ball of flame.", "butter-toads": "Nonsense." }, [
        "fireball",
        "butter-toast",
      ]),
    ).toEqual({ fireball: "A ball of flame." });
  });

  test("drops a non-string value and keeps the rest", () => {
    expect(
      pickRequested({ fireball: "A ball of flame.", broadsword: null }, ["fireball", "broadsword"]),
    ).toEqual({ fireball: "A ball of flame." });
  });
});
