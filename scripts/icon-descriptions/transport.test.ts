import { describe, expect, test } from "vitest";
import { pickRequested, responseSchema } from "./transport";

describe("responseSchema", () => {
  // Naming the requested icons would give every request in a batch its own
  // schema, and one grammar compiles per distinct schema against a limit of 20
  // per minute. Taking no arguments is the guarantee: there is no way to make
  // two requests differ.
  test("describes a name-to-string map without naming any icon", () => {
    expect(responseSchema()).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
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
