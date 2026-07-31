import { describe, expect, test } from "vitest";
import { formatCacheUsage, pickRequested, RESPONSE_SCHEMA } from "./transport";

const described = (entries: unknown[]) => ({ descriptions: entries });

describe("formatCacheUsage", () => {
  // The hit rate is what the whole one-image-per-request design turns on, and
  // the raw totals sit beside it because a short run can only ever write.
  test("reports the split and the rate it implies", () => {
    expect(formatCacheUsage({ created: 800, read: 7_200 })).toBe(
      "prompt cache: 7200 read, 800 written (90.0% hit rate)",
    );
  });

  // Nothing cached is not a 0% hit rate — it is a run that never asked, and
  // dividing by the total would report NaN.
  test("says nothing when no prefix was cached", () => {
    expect(formatCacheUsage({ created: 0, read: 0 })).toBeNull();
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
