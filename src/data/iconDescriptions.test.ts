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
    expect(validateEntry("fireball", "A ball of flame. ".repeat(20))).toMatch(/260/);
  });

  // The signature of a silently degraded call: the batch succeeded, the
  // envelope was clean, and the model declined. One row per pattern — the
  // curly-apostrophe row is the form the comment claims is the more common
  // one, and the impersonal rows are what a JSON-only instruction elicits.
  test.each([
    "I can't see the image at that path.",
    "I can’t see the image at that path.",
    "I'm unable to read these files.",
    "Sorry, this one is not legible.",
    "Unable to read the file at this path.",
    "The image could not be loaded from disk.",
    "No image was provided for this filename.",
    "A blank white square with no discernible content.",
  ])("rejects refusal boilerplate: %s", (description) => {
    expect(validateEntry("fireball", description)).toMatch(/refusal/);
  });

  // The impersonal patterns must not swallow ordinary descriptions of icons
  // that legitimately depict squares, failure, or absence.
  test.each([
    "A blank scroll beside a quill, symbolizing an unwritten contract.",
    "A cracked white square tile, conventionally marking a broken floor trap.",
  ])("accepts a legitimate description that brushes a refusal pattern: %s", (description) => {
    expect(validateEntry("fireball", description)).toBeNull();
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
