import { describe, expect, test } from "vitest";
import {
  acFormula,
  attunementLine,
  formatCost,
  formatWeight,
  isShieldArmor,
  weaponPropertyLabel,
} from "./items";

describe("formatCost", () => {
  test.each([
    ["10.00", "10 gp"],
    ["1.00", "1 gp"],
    ["400.00", "400 gp"],
    ["0.50", "5 sp"],
    ["0.40", "4 sp"],
    ["0.10", "1 sp"],
    ["0.05", "5 cp"],
    ["0.04", "4 cp"],
    ["0.01", "1 cp"],
  ] as const)("'%s' → '%s'", (input, expected) => {
    expect(formatCost(input)).toBe(expected);
  });
  test("'0.00' → null", () => {
    expect(formatCost("0.00")).toBeNull();
  });
});

describe("formatWeight", () => {
  test("non-zero numeric weight → '<n> <unit>' with trailing zeros stripped", () => {
    expect(formatWeight("7.000", "lb")).toBe("7 lb");
    expect(formatWeight("1.5", "lb")).toBe("1.5 lb");
  });
  test("'0.000' → null", () => {
    expect(formatWeight("0.000", "lb")).toBeNull();
  });
  test("'0' → null", () => {
    expect(formatWeight("0", "lb")).toBeNull();
  });
});

describe("isShieldArmor", () => {
  test("ac_base <= 5 is treated as shield (Open5e quirk)", () => {
    expect(isShieldArmor({ ac_base: 2 })).toBe(true);
    expect(isShieldArmor({ ac_base: 5 })).toBe(true);
  });
  test("ac_base >= 6 is real armor", () => {
    expect(isShieldArmor({ ac_base: 6 })).toBe(false);
    expect(isShieldArmor({ ac_base: 18 })).toBe(false);
  });
});

describe("acFormula", () => {
  test("heavy: no dex bonus → 'AC X'", () => {
    expect(acFormula({ ac_base: 18, ac_add_dexmod: false, ac_cap_dexmod: null })).toBe("AC 18");
  });
  test("medium: dex bonus capped → 'AC X + dex mod (max N)'", () => {
    expect(acFormula({ ac_base: 14, ac_add_dexmod: true, ac_cap_dexmod: 2 })).toBe(
      "AC 14 + dex mod (max 2)",
    );
  });
  test("light: uncapped dex → 'AC X + dex mod'", () => {
    expect(acFormula({ ac_base: 11, ac_add_dexmod: true, ac_cap_dexmod: null })).toBe(
      "AC 11 + dex mod",
    );
  });
  test("dex add false ignores cap silently", () => {
    expect(acFormula({ ac_base: 16, ac_add_dexmod: false, ac_cap_dexmod: 2 })).toBe("AC 16");
  });
  test("shield form: '+N AC' when ac_base <= 5", () => {
    expect(acFormula({ ac_base: 2, ac_add_dexmod: false, ac_cap_dexmod: null })).toBe("+2 AC");
    expect(acFormula({ ac_base: 5, ac_add_dexmod: false, ac_cap_dexmod: null })).toBe("+5 AC");
  });
});

describe("attunementLine", () => {
  test("requires=false → null (caller omits the stat line entirely)", () => {
    expect(attunementLine({ requires_attunement: false, attunement_detail: null })).toBeNull();
    expect(
      attunementLine({ requires_attunement: false, attunement_detail: "should be ignored" }),
    ).toBeNull();
  });
  test("requires=true, no detail → 'Requires attunement'", () => {
    expect(attunementLine({ requires_attunement: true, attunement_detail: null })).toBe(
      "Requires attunement",
    );
    expect(attunementLine({ requires_attunement: true, attunement_detail: "" })).toBe(
      "Requires attunement",
    );
  });
  test("requires=true with detail → 'Requires attunement <detail>'", () => {
    expect(
      attunementLine({
        requires_attunement: true,
        attunement_detail: "by a spellcaster",
      }),
    ).toBe("Requires attunement by a spellcaster");
  });
});

describe("weaponPropertyLabel", () => {
  test("name only → 'Name'", () => {
    expect(weaponPropertyLabel({ property: { name: "Finesse", type: null }, detail: null })).toBe(
      "Finesse",
    );
  });
  test("name + detail → 'Name (detail)'", () => {
    expect(
      weaponPropertyLabel({ property: { name: "Versatile", type: null }, detail: "1d10" }),
    ).toBe("Versatile (1d10)");
  });
  test("type='Mastery' → 'Name (Mastery)' regardless of detail", () => {
    expect(
      weaponPropertyLabel({ property: { name: "Cleave", type: "Mastery" }, detail: null }),
    ).toBe("Cleave (Mastery)");
  });
});
