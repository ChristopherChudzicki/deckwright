import { describe, expect, test } from "vitest";
import {
  castingTimeLabel,
  classesLabel,
  componentsLabel,
  durationLabel,
  levelLabel,
} from "./spells";

describe("levelLabel", () => {
  test("level 0 → 'School cantrip' (capitalized)", () => {
    expect(levelLabel(0, "divination")).toBe("Divination cantrip");
  });
  test("level 1 → '1st-level school'", () => {
    expect(levelLabel(1, "Evocation")).toBe("1st-level evocation");
  });
  test("level 2 → '2nd-level …'", () => {
    expect(levelLabel(2, "evocation")).toBe("2nd-level evocation");
  });
  test("level 3 → '3rd-level …'", () => {
    expect(levelLabel(3, "evocation")).toBe("3rd-level evocation");
  });
  test.each([4, 5, 6, 7, 8, 9] as const)("level %i → 'Nth-level …'", (n) => {
    expect(levelLabel(n, "evocation")).toBe(`${n}th-level evocation`);
  });
});

describe("castingTimeLabel", () => {
  test.each([
    ["action", "1 action"],
    ["bonus-action", "1 bonus action"],
    ["reaction", "1 reaction"],
    ["minute", "1 minute"],
    ["hour", "1 hour"],
  ] as const)("2024 form %s → %s", (input, expected) => {
    expect(castingTimeLabel(input, false)).toBe(expected);
  });
  test.each([
    ["1minute", "1 minute"],
    ["10minutes", "10 minutes"],
    ["1hour", "1 hour"],
    ["8hours", "8 hours"],
  ] as const)("2014 concatenated %s → %s", (input, expected) => {
    expect(castingTimeLabel(input, false)).toBe(expected);
  });
  test("ritual=true appends ' (ritual)'", () => {
    expect(castingTimeLabel("action", true)).toBe("1 action (ritual)");
    expect(castingTimeLabel("10minutes", true)).toBe("10 minutes (ritual)");
  });
});

describe("durationLabel", () => {
  test("'instantaneous' is capitalized", () => {
    expect(durationLabel("instantaneous", false)).toBe("Instantaneous");
  });
  test("'10 minute' (2024 singular) → '10 minutes'", () => {
    expect(durationLabel("10 minute", false)).toBe("10 minutes");
  });
  test("'10 minutes' (2014 plural) stays '10 minutes'", () => {
    expect(durationLabel("10 minutes", false)).toBe("10 minutes");
  });
  test("'1 minute' stays singular", () => {
    expect(durationLabel("1 minute", false)).toBe("1 minute");
  });
  test("'until dispelled' is capitalized", () => {
    expect(durationLabel("until dispelled", false)).toBe("Until dispelled");
  });
  test("empty duration with concentration → 'Concentration'", () => {
    expect(durationLabel("", true)).toBe("Concentration");
  });
  test("empty duration without concentration → ''", () => {
    expect(durationLabel("", false)).toBe("");
  });
  test("concentration prefixes the duration", () => {
    expect(durationLabel("1 minute", true)).toBe("Concentration, up to 1 minute");
  });
  test("concentration with quantified plural", () => {
    expect(durationLabel("10 minute", true)).toBe("Concentration, up to 10 minutes");
  });
});

describe("componentsLabel", () => {
  test("V/S/M all true → 'V, S, M'", () => {
    expect(componentsLabel({ verbal: true, somatic: true, material: true })).toBe("V, S, M");
  });
  test("V only", () => {
    expect(componentsLabel({ verbal: true, somatic: false, material: false })).toBe("V");
  });
  test("all false → empty string", () => {
    expect(componentsLabel({ verbal: false, somatic: false, material: false })).toBe("");
  });
  test("material with materialSpecified appends in parens", () => {
    expect(
      componentsLabel({
        verbal: true,
        somatic: true,
        material: true,
        materialSpecified: "a tiny ball of bat guano and sulfur",
      }),
    ).toBe("V, S, M (a tiny ball of bat guano and sulfur)");
  });
  test("material false with materialSpecified ignores the spec", () => {
    expect(
      componentsLabel({
        verbal: true,
        somatic: false,
        material: false,
        materialSpecified: "should be ignored",
      }),
    ).toBe("V");
  });
  test("material true with empty materialSpecified renders 'M' only", () => {
    expect(
      componentsLabel({ verbal: true, somatic: false, material: true, materialSpecified: "" }),
    ).toBe("V, M");
  });
});

describe("classesLabel", () => {
  test("alphabetizes class names", () => {
    expect(classesLabel([{ name: "Wizard" }, { name: "Sorcerer" }])).toBe("Sorcerer, Wizard");
  });
  test("single class", () => {
    expect(classesLabel([{ name: "Cleric" }])).toBe("Cleric");
  });
  test("empty → ''", () => {
    expect(classesLabel([])).toBe("");
  });
});
