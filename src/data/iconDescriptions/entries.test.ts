import { describe, expect, test } from "vitest";
import {
  isNameEcho,
  isTautologicalAssociation,
  mergeOverrides,
  styleWord,
  validateEntry,
} from "./entries";

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
    "I'm unable to describe this icon.",
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
  test("accepts a legitimate description that brushes a refusal pattern", () => {
    expect(
      validateEntry("fireball", "A cracked white square tile, marking a broken floor trap."),
    ).toBeNull();
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

describe("styleWord", () => {
  test("reports the style word it found", () => {
    expect(styleWord("A rounded bush silhouette dotted with berries.")).toBe("silhouette");
  });

  test("passes a description that names only what is shown", () => {
    expect(styleWord("A rounded bush dotted with small berry shapes on short stems.")).toBeNull();
  });

  // The collection contains hieroglyph icons, and a style word buried inside a
  // longer subject word says nothing about how the icon was drawn.
  test("does not flag a style word occurring inside a longer word", () => {
    expect(styleWord("An Egyptian hieroglyph of a seated scribe.")).toBeNull();
  });
});

describe("isTautologicalAssociation", () => {
  test("flags a closing clause that renames the subject", () => {
    expect(
      isTautologicalAssociation(
        "bowling-pin",
        "A single bowling pin, symbolizing the sport of bowling.",
      ),
    ).toBe(true);
  });

  // The literal half is what the clause has to add to, so restating it counts
  // even when the icon's own name shares none of the words.
  test("flags a clause that restates the literal half rather than the name", () => {
    expect(
      isTautologicalAssociation(
        "defibrilate",
        "A heart struck by lightning, symbolizing a shock to the heart.",
      ),
    ).toBe(true);
  });

  // The mirror case: the repeated word reaches the clause only from the icon's
  // name. Without a case where the literal half cannot supply it, dropping the
  // name from the comparison leaves every other case here still passing.
  test("flags a clause that restates the name rather than the literal half", () => {
    expect(isTautologicalAssociation("bowling-pin", "A single pin, symbolizing bowling.")).toBe(
      true,
    );
  });

  test("passes an association that names something the image does not show", () => {
    expect(
      isTautologicalAssociation(
        "bat-wing",
        "A single bat wing, an emblem of vampires and nocturnal creatures.",
      ),
    ).toBe(false);
  });

  test("passes a bare literal description with no association at all", () => {
    expect(isTautologicalAssociation("berry-bush", "A rounded bush dotted with berries.")).toBe(
      false,
    );
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
