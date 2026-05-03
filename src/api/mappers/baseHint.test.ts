import { describe, expect, it } from "vitest";
import { parseBaseHint } from "./baseHint";

describe("parseBaseHint", () => {
  it("identifies a specific weapon base", () => {
    expect(parseBaseHint("Weapon (longsword), rare (requires attunement)")).toEqual({
      kind: "specific",
      hint: "longsword",
    });
  });

  it("identifies an 'any X' weapon template", () => {
    expect(
      parseBaseHint("Weapon (any sword), legendary (requires attunement by a paladin)"),
    ).toEqual({ kind: "any", hint: "sword" });
  });

  it("identifies a specific armor base", () => {
    expect(parseBaseHint("Armor (plate), very rare")).toEqual({
      kind: "specific",
      hint: "plate",
    });
  });

  it("normalizes mixed-case 2024-style hints", () => {
    expect(parseBaseHint("Weapon (Any Melee Weapon)")).toEqual({
      kind: "any",
      hint: "melee weapon",
    });
    expect(parseBaseHint("Weapon (Longsword), Rare")).toEqual({
      kind: "specific",
      hint: "longsword",
    });
  });

  it("returns 'none' for non-weapon/armor descriptions", () => {
    expect(parseBaseHint("Wondrous item, rare (requires attunement)")).toEqual({
      kind: "none",
      hint: "",
    });
    expect(parseBaseHint("Wand, very rare")).toEqual({ kind: "none", hint: "" });
  });

  it("returns 'none' for empty / undefined input", () => {
    expect(parseBaseHint(undefined)).toEqual({ kind: "none", hint: "" });
    expect(parseBaseHint("")).toEqual({ kind: "none", hint: "" });
  });
});
