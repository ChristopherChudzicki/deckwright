import { describe, expect, test } from "vitest";
import { spellCardSchema } from "../../decks/schema";
import { spellDetailFactory } from "../factories";
import { spellDetailToCard } from "./spells";

describe("spellDetailToCard", () => {
  test("output is a valid SpellCard", () => {
    const detail = spellDetailFactory.build();
    const card = spellDetailToCard(detail);
    expect(spellCardSchema.safeParse(card).success).toBe(true);
  });

  test("apiRef carries open5e system, the detail key as slug, and the ruleset", () => {
    const detail = spellDetailFactory.build({ key: "srd-2024_fireball" });
    const card = spellDetailToCard(detail);
    expect(card.apiRef).toEqual({ system: "open5e", slug: "srd-2024_fireball", ruleset: "2024" });
  });

  test("source is 'api', kind is 'spell', iconKey is 'magic-swirl'", () => {
    const detail = spellDetailFactory.build();
    const card = spellDetailToCard(detail);
    expect(card.kind).toBe("spell");
    expect(card.source).toBe("api");
    expect(card.iconKey).toBe("magic-swirl");
  });

  // --- Header tag 1: level + school ---
  test("level 0 → 'School cantrip' with capitalized school", () => {
    const detail = spellDetailFactory.build({ level: 0, school: { name: "divination" } });
    const card = spellDetailToCard(detail);
    expect(card.headerTags[0]).toBe("Divination cantrip");
  });

  test("level 1 → '1st-level school' with lowercase school", () => {
    const detail = spellDetailFactory.build({ level: 1, school: { name: "Evocation" } });
    const card = spellDetailToCard(detail);
    expect(card.headerTags[0]).toBe("1st-level evocation");
  });

  test("level 2 → '2nd-level …'", () => {
    const detail = spellDetailFactory.build({ level: 2, school: { name: "evocation" } });
    expect(spellDetailToCard(detail).headerTags[0]).toBe("2nd-level evocation");
  });

  test("level 3 → '3rd-level …'", () => {
    const detail = spellDetailFactory.build({ level: 3, school: { name: "evocation" } });
    expect(spellDetailToCard(detail).headerTags[0]).toBe("3rd-level evocation");
  });

  test("level 4..9 → 'Nth-level …'", () => {
    for (const level of [4, 5, 6, 7, 8, 9] as const) {
      const detail = spellDetailFactory.build({ level, school: { name: "evocation" } });
      expect(spellDetailToCard(detail).headerTags[0]).toBe(`${level}th-level evocation`);
    }
  });

  // --- Header tag 2: casting time ---
  test.each([
    ["action", "1 action"],
    ["bonus-action", "1 bonus action"],
    ["reaction", "1 reaction"],
    ["minute", "1 minute"],
    ["hour", "1 hour"],
  ] as const)("2024 casting_time %s → %s", (input, expected) => {
    const detail = spellDetailFactory.build({ casting_time: input, ritual: false });
    expect(spellDetailToCard(detail).headerTags[1]).toBe(expected);
  });

  test.each([
    ["1minute", "1 minute"],
    ["10minutes", "10 minutes"],
    ["1hour", "1 hour"],
    ["8hours", "8 hours"],
    ["12hours", "12 hours"],
    ["24hours", "24 hours"],
  ] as const)("2014 casting_time %s → %s", (input, expected) => {
    const detail = spellDetailFactory.build({ casting_time: input, ritual: false });
    expect(spellDetailToCard(detail).headerTags[1]).toBe(expected);
  });

  test("ritual: true appends ' (ritual)' to the casting time tag (2024 form)", () => {
    const detail = spellDetailFactory.build({ casting_time: "minute", ritual: true });
    expect(spellDetailToCard(detail).headerTags[1]).toBe("1 minute (ritual)");
  });

  test("ritual: true appends ' (ritual)' to the casting time tag (2014 form)", () => {
    const detail = spellDetailFactory.build({ casting_time: "10minutes", ritual: true });
    expect(spellDetailToCard(detail).headerTags[1]).toBe("10 minutes (ritual)");
  });

  // --- Header tag 3: range ---
  test("range tag is range_text verbatim", () => {
    const detail = spellDetailFactory.build({ range_text: "150 feet" });
    expect(spellDetailToCard(detail).headerTags[2]).toBe("150 feet");
  });

  // --- Header tag 4: duration ---
  test("duration 'instantaneous' is capitalized", () => {
    const detail = spellDetailFactory.build({ duration: "instantaneous", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Instantaneous");
  });

  test("duration '10 minute' pluralizes to '10 minutes'", () => {
    const detail = spellDetailFactory.build({ duration: "10 minute", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("10 minutes");
  });

  test("duration '8 hour' pluralizes to '8 hours'", () => {
    const detail = spellDetailFactory.build({ duration: "8 hour", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("8 hours");
  });

  test("singular duration '1 minute' stays singular", () => {
    const detail = spellDetailFactory.build({ duration: "1 minute", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("1 minute");
  });

  test("'until dispelled' is capitalized", () => {
    const detail = spellDetailFactory.build({ duration: "until dispelled", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Until dispelled");
  });

  test("empty duration drops the duration tag entirely (2024 has '' on some spells)", () => {
    const detail = spellDetailFactory.build({ duration: "", concentration: false });
    const card = spellDetailToCard(detail);
    expect(card.headerTags).toHaveLength(3);
  });

  test("'special' duration is capitalized", () => {
    const detail = spellDetailFactory.build({ duration: "special", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Special");
  });

  test("2014 already-pluralized '10 minutes' stays '10 minutes'", () => {
    const detail = spellDetailFactory.build({ duration: "10 minutes", concentration: false });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("10 minutes");
  });

  test("concentration prefixes the duration", () => {
    const detail = spellDetailFactory.build({ duration: "1 minute", concentration: true });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Concentration, up to 1 minute");
  });

  test("concentration with quantified plural duration", () => {
    const detail = spellDetailFactory.build({ duration: "10 minute", concentration: true });
    expect(spellDetailToCard(detail).headerTags[3]).toBe("Concentration, up to 10 minutes");
  });

  // --- Footer tag 1: components ---
  test("V/S/M booleans build the components tag in order, joined by ', '", () => {
    const detail = spellDetailFactory.build({
      verbal: true,
      somatic: true,
      material: true,
      material_specified: "a tiny ball of bat guano and sulfur",
    });
    expect(spellDetailToCard(detail).footerTags[0]).toBe(
      "V, S, M (a tiny ball of bat guano and sulfur)",
    );
  });

  test("only V + S → 'V, S'", () => {
    const detail = spellDetailFactory.build({
      verbal: true,
      somatic: true,
      material: false,
      material_specified: "",
    });
    expect(spellDetailToCard(detail).footerTags[0]).toBe("V, S");
  });

  test("material true with empty material_specified → 'M' without parens", () => {
    const detail = spellDetailFactory.build({
      verbal: false,
      somatic: false,
      material: true,
      material_specified: "",
    });
    expect(spellDetailToCard(detail).footerTags[0]).toBe("M");
  });

  // --- Footer tag 2: classes ---
  test("classes are joined alphabetically by name", () => {
    const detail = spellDetailFactory.build({
      classes: [{ name: "Wizard" }, { name: "Sorcerer" }],
    });
    expect(spellDetailToCard(detail).footerTags[1]).toBe("Sorcerer, Wizard");
  });

  test("single class still rendered", () => {
    const detail = spellDetailFactory.build({ classes: [{ name: "Cleric" }] });
    expect(spellDetailToCard(detail).footerTags[1]).toBe("Cleric");
  });

  test("no V/S/M components → empty components tag is dropped", () => {
    const detail = spellDetailFactory.build({
      verbal: false,
      somatic: false,
      material: false,
      material_specified: "",
      classes: [{ name: "Cleric" }],
    });
    expect(spellDetailToCard(detail).footerTags).toEqual(["Cleric"]);
  });

  test("empty classes → empty classes tag is dropped", () => {
    const detail = spellDetailFactory.build({
      verbal: true,
      somatic: false,
      material: false,
      material_specified: "",
      classes: [],
    });
    expect(spellDetailToCard(detail).footerTags).toEqual(["V"]);
  });

  // --- Body ---
  test("body is desc verbatim when higher_level is empty", () => {
    const detail = spellDetailFactory.build({ desc: "A bright streak.", higher_level: "" });
    expect(spellDetailToCard(detail).body).toBe("A bright streak.");
  });

  test("body appends an 'At Higher Levels' block when higher_level is non-empty", () => {
    const detail = spellDetailFactory.build({
      desc: "A bright streak.",
      higher_level: "When you cast this spell using a spell slot of 4th level or higher…",
    });
    expect(spellDetailToCard(detail).body).toBe(
      "A bright streak.\n\n***At Higher Levels.*** When you cast this spell using a spell slot of 4th level or higher…",
    );
  });

  // --- Full canonical Fireball-shaped example ---
  test("Fireball-shaped detail produces the canonical headerTags + footerTags", () => {
    const detail = spellDetailFactory.build({
      level: 3,
      school: { name: "evocation" },
      casting_time: "action",
      ritual: false,
      range_text: "150 feet",
      duration: "instantaneous",
      concentration: false,
      verbal: true,
      somatic: true,
      material: true,
      material_specified: "a tiny ball of bat guano and sulfur",
      classes: [{ name: "Wizard" }, { name: "Sorcerer" }],
    });
    const card = spellDetailToCard(detail);
    expect(card.headerTags).toEqual([
      "3rd-level evocation",
      "1 action",
      "150 feet",
      "Instantaneous",
    ]);
    expect(card.footerTags).toEqual([
      "V, S, M (a tiny ball of bat guano and sulfur)",
      "Sorcerer, Wizard",
    ]);
  });

  // --- Guidance-shaped (concentration cantrip) ---
  test("Guidance-shaped detail produces the canonical headerTags + footerTags", () => {
    const detail = spellDetailFactory.build({
      level: 0,
      school: { name: "divination" },
      casting_time: "action",
      ritual: false,
      range_text: "Touch",
      duration: "1 minute",
      concentration: true,
      verbal: true,
      somatic: true,
      material: false,
      material_specified: "",
      classes: [{ name: "Druid" }, { name: "Cleric" }],
    });
    const card = spellDetailToCard(detail);
    expect(card.headerTags).toEqual([
      "Divination cantrip",
      "1 action",
      "Touch",
      "Concentration, up to 1 minute",
    ]);
    expect(card.footerTags).toEqual(["V, S", "Cleric, Druid"]);
  });
});
