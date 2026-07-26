import { describe, expect, test } from "vitest";
import { isNameEcho, mergeOverrides, validateEntry } from "./iconDescriptions";

const good = "A ball of flame, symbolizing fire magic and destructive spells.";

describe("validateEntry", () => {
  test("accepts a well-formed description", () => {
    expect(validateEntry("fireball", good)).toBeNull();
  });

  test("rejects a non-string", () => {
    expect(validateEntry("fireball", null)).toMatch(/string/);
  });

  test("rejects an empty or whitespace-only description", () => {
    expect(validateEntry("fireball", "   ")).toMatch(/empty/);
  });

  test("rejects a description below the minimum length", () => {
    expect(validateEntry("fireball", "A flame.")).toMatch(/15/);
  });

  test("rejects a description above the maximum length", () => {
    expect(validateEntry("fireball", "A ball of flame. ".repeat(20))).toMatch(/200/);
  });

  // The signature of a silently degraded call: the batch succeeded, the
  // envelope was clean, and the model declined.
  test.each([
    "I can't see the image at that path.",
    "I'm unable to read these files.",
    "Sorry, no image was provided here.",
  ])("rejects refusal boilerplate: %s", (description) => {
    expect(validateEntry("fireball", description)).toMatch(/refusal/);
  });
});

describe("isNameEcho", () => {
  test("flags a description whose content words are a subset of the name", () => {
    expect(isNameEcho("crossed-swords", "Crossed swords.")).toBe(true);
  });

  test("does not flag a description that adds a word the name lacks", () => {
    expect(isNameEcho("crossed-swords", "Two crossed longswords forming an X.")).toBe(false);
  });

  test("ignores stopwords when deciding", () => {
    expect(isNameEcho("lungs", "A pair of the lungs.")).toBe(true);
  });
});

describe("mergeOverrides", () => {
  test("returns the base entries when there are no overrides", () => {
    expect(mergeOverrides({ fireball: good }, {})).toEqual({ fireball: good });
  });

  test("lets an override win over the generated description", () => {
    expect(mergeOverrides({ fireball: good }, { fireball: "Corrected." })).toEqual({
      fireball: "Corrected.",
    });
  });

  test("includes an override for an icon the base file lacks", () => {
    expect(mergeOverrides({}, { fireball: "Corrected." })).toEqual({ fireball: "Corrected." });
  });

  test("does not mutate the base object", () => {
    const base = { fireball: good };
    mergeOverrides(base, { fireball: "Corrected." });
    expect(base).toEqual({ fireball: good });
  });
});
