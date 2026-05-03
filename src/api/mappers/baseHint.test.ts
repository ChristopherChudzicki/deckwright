import { describe, expect, it } from "vitest";
import { parseBaseHint } from "./baseHint";

describe("parseBaseHint", () => {
  it("identifies a specific weapon base", () => {
    expect(parseBaseHint("Weapon (longsword), rare (requires attunement)")).toEqual({
      kind: "specific",
      hint: "longsword",
      source: "Weapon (longsword)",
    });
  });

  it("identifies an 'any X' weapon template", () => {
    expect(
      parseBaseHint("Weapon (any sword), legendary (requires attunement by a paladin)"),
    ).toEqual({ kind: "any", hint: "sword", source: "Weapon (any sword)" });
  });

  it("identifies a specific armor base", () => {
    expect(parseBaseHint("Armor (plate), very rare")).toEqual({
      kind: "specific",
      hint: "plate",
      source: "Armor (plate)",
    });
  });

  it("normalizes a mixed-case 2024-style 'any' hint", () => {
    expect(parseBaseHint("Weapon (Any Melee Weapon)")).toEqual({
      kind: "any",
      hint: "melee weapon",
      source: "Weapon (Any Melee Weapon)",
    });
  });

  it("normalizes a mixed-case 2024-style specific hint", () => {
    expect(parseBaseHint("Weapon (Longsword), Rare")).toEqual({
      kind: "specific",
      hint: "longsword",
      source: "Weapon (Longsword)",
    });
  });

  it("returns 'none' for non-weapon/armor descriptions", () => {
    expect(parseBaseHint("Wondrous item, rare (requires attunement)")).toEqual({
      kind: "none",
      hint: "",
      source: "",
    });
    expect(parseBaseHint("Wand, very rare")).toEqual({ kind: "none", hint: "", source: "" });
  });

  it("returns 'none' for empty / undefined input", () => {
    expect(parseBaseHint(undefined)).toEqual({ kind: "none", hint: "", source: "" });
    expect(parseBaseHint("")).toEqual({ kind: "none", hint: "", source: "" });
  });
});
