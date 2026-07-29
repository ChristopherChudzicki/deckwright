import { describe, expect, test } from "vitest";
import { pickRequested, RESPONSE_SCHEMA } from "./transport";

const described = (entries: unknown[]) => ({ descriptions: entries });

describe("RESPONSE_SCHEMA", () => {
  // The whole point of the array shape is that the schema names no icon, so one
  // compiled grammar serves every request. A schema that varied per request cost
  // a live arm 102 of its 138 requests.
  test("names no icon, so every request shares one schema", () => {
    expect(RESPONSE_SCHEMA).toEqual({
      type: "object",
      properties: {
        descriptions: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, description: { type: "string" } },
            required: ["name", "description"],
            additionalProperties: false,
          },
        },
      },
      required: ["descriptions"],
      additionalProperties: false,
    });
  });
});

describe("pickRequested", () => {
  test("keys the descriptions by name and trims surrounding whitespace", () => {
    expect(
      pickRequested(described([{ name: "fireball", description: "  A ball of flame.\n" }]), [
        "fireball",
      ]),
    ).toEqual({ fireball: "A ball of flame." });
  });

  // The schema constrains the shape, not the contents: nothing stops the model
  // naming an icon nobody asked for, and a wrong name silently lost butter-toast
  // in a measured run.
  test("drops an entry naming no requested icon and keeps the rest", () => {
    expect(
      pickRequested(
        described([
          { name: "fireball", description: "A ball of flame." },
          { name: "butter-toads", description: "Nonsense." },
        ]),
        ["fireball", "butter-toast"],
      ),
    ).toEqual({ fireball: "A ball of flame." });
  });

  // `minItems` accepts only 0 and 1, so the schema cannot require one entry per
  // icon. A short response is reported and re-described, not treated as a failure.
  test("returns only what came back when the response is short", () => {
    expect(
      pickRequested(described([{ name: "fireball", description: "A ball of flame." }]), [
        "fireball",
        "broadsword",
      ]),
    ).toEqual({ fireball: "A ball of flame." });
  });

  // Nothing in the schema forbids naming one icon twice, and a later duplicate
  // would otherwise overwrite the description already accepted for it.
  test("keeps the first of two entries naming the same icon", () => {
    expect(
      pickRequested(
        described([
          { name: "fireball", description: "A ball of flame." },
          { name: "fireball", description: "A second attempt." },
        ]),
        ["fireball"],
      ),
    ).toEqual({ fireball: "A ball of flame." });
  });
});
