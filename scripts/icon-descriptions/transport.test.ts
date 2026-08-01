import { describe, expect, test } from "vitest";
import { formatCacheUsage, pickDescription, RESPONSE_SCHEMA } from "./transport";

const described = (entries: unknown[]) => ({ descriptions: entries });

describe("formatCacheUsage", () => {
  // The hit rate is what the whole one-image-per-request design turns on, and
  // the raw totals sit beside it because a short run can only ever write.
  test("reports the split and the rate it implies", () => {
    expect(formatCacheUsage({ created: 800, read: 7_200 }, "1h")).toBe(
      "prompt cache: 7200 read, 800 written (90.0% hit rate)",
    );
  });

  // A run that asked and cached nothing has found something — a prefix under the
  // model's minimum is ignored silently — so reporting it as absence would hide
  // the one thing the smoke test exists to catch.
  test("says a run that asked for caching and got none cached nothing", () => {
    expect(formatCacheUsage({ created: 0, read: 0 }, "1h")).toMatch(/nothing cached/);
  });

  // Under `off` there is nothing to report rather than something to chase, and
  // dividing by the total would give NaN.
  test("says nothing when no prefix was asked for", () => {
    expect(formatCacheUsage({ created: 0, read: 0 }, "off")).toBeNull();
  });
});

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

describe("pickDescription", () => {
  test("returns the matching description with surrounding whitespace trimmed", () => {
    expect(
      pickDescription(
        described([{ name: "fireball", description: "  A ball of flame.\n" }]),
        "fireball",
      ),
    ).toBe("A ball of flame.");
  });

  // The prompt asks for the name without the extension and a live run got
  // `logging.png` back anyway, losing a paid, correct description. That string is
  // the label the request sends ahead of the image, so it names this icon and
  // nothing else.
  test("accepts the name echoed back with the .png the request labelled it with", () => {
    expect(
      pickDescription(
        described([{ name: "logging.png", description: "A cut tree stump." }]),
        "logging",
      ),
    ).toBe("A cut tree stump.");
  });

  // The other live failure was `olt-drop` for `bolt-drop`. It stays a failure:
  // 455 pairs of real icon names are one deletion apart, so tolerating a dropped
  // character could accept another icon's description.
  test("returns null for a name one deleted character away", () => {
    expect(
      pickDescription(described([{ name: "olt-drop", description: "A droplet." }]), "bolt-drop"),
    ).toBeNull();
  });

  // The schema constrains the shape, not the contents: nothing stops the model
  // naming an icon nobody asked for, and a wrong name silently lost butter-toast
  // in a measured run. At one icon per request there is nothing else in the
  // reply to fall back on.
  test("returns null when no entry names the requested icon", () => {
    expect(
      pickDescription(
        described([{ name: "butter-toads", description: "Nonsense." }]),
        "butter-toast",
      ),
    ).toBeNull();
  });

  // `.trim()` on a non-string throws, which would lose the whole billed request.
  test("skips an entry whose description is not a string", () => {
    expect(
      pickDescription(
        described([
          { name: "fireball", description: null },
          { name: "fireball", description: "A ball of flame." },
        ]),
        "fireball",
      ),
    ).toBe("A ball of flame.");
  });

  // Nothing in the schema forbids naming one icon twice, and reading the last
  // would let a retraction overwrite the answer already given.
  test("keeps the first of two entries naming the same icon", () => {
    expect(
      pickDescription(
        described([
          { name: "fireball", description: "A ball of flame." },
          { name: "fireball", description: "A second attempt." },
        ]),
        "fireball",
      ),
    ).toBe("A ball of flame.");
  });
});
