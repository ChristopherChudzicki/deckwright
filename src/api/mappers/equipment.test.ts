import { describe, expect, it } from "vitest";
import type { EquipmentDetail } from "../endpoints/equipment";
import { equipmentToFooterInsert, equipmentToHeaderInsert } from "./equipment";

const longsword: EquipmentDetail = {
  index: "longsword",
  name: "Longsword",
  damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
  weight: 3,
};

const plateArmor: EquipmentDetail = {
  index: "plate-armor",
  name: "Plate Armor",
  armor_class: { base: 18 },
  weight: 65,
};

const noShape: EquipmentDetail = { index: "abacus", name: "Abacus" };

describe("equipmentToHeaderInsert", () => {
  it("formats weapon damage", () => {
    expect(equipmentToHeaderInsert(longsword)).toBe("1d8 slashing");
  });

  it("formats armor AC", () => {
    expect(equipmentToHeaderInsert(plateArmor)).toBe("AC 18");
  });

  it("returns null for items with neither damage nor AC", () => {
    expect(equipmentToHeaderInsert(noShape)).toBeNull();
  });

  it("returns null when given undefined", () => {
    expect(equipmentToHeaderInsert(undefined)).toBeNull();
  });
});

describe("equipmentToFooterInsert", () => {
  it("formats weight in lb", () => {
    expect(equipmentToFooterInsert(longsword)).toBe("3 lb");
    expect(equipmentToFooterInsert(plateArmor)).toBe("65 lb");
  });

  it("returns null when weight is missing", () => {
    expect(equipmentToFooterInsert(noShape)).toBeNull();
  });

  it("returns null when weight is zero", () => {
    expect(equipmentToFooterInsert({ ...longsword, weight: 0 })).toBeNull();
  });

  it("returns null when given undefined", () => {
    expect(equipmentToFooterInsert(undefined)).toBeNull();
  });
});
