import { describe, expect, test } from "vitest";
import { pickRequested, RESPONSE_SCHEMA } from "./transport";

const described = (entries: unknown[]) => ({ descriptions: entries });

describe("RESPONSE_SCHEMA", () => {
  // Two properties this pins, both of which a live run has already broken:
  // the schema names no icon, so it is the same schema every request, and
  // `additionalProperties` is false on both objects, which structured outputs
  // reject any other value for.
  test("names no icon and forbids additional properties throughout", () => {
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

  // `.trim()` on a non-string throws, which would lose the whole billed request
  // over one bad entry.
  test("drops an entry whose description is not a string and keeps the rest", () => {
    expect(
      pickRequested(
        described([
          { name: "fireball", description: "A ball of flame." },
          { name: "broadsword", description: null },
        ]),
        ["fireball", "broadsword"],
      ),
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
