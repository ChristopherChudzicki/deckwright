import type { EquipmentDetail } from "../endpoints/equipment";

export const equipmentToHeaderInsert = (e: EquipmentDetail | undefined): string | null => {
  if (!e) return null;
  if (e.damage) {
    return `${e.damage.damage_dice} ${e.damage.damage_type.name.toLowerCase()}`;
  }
  if (e.armor_class) {
    return `AC ${e.armor_class.base}`;
  }
  return null;
};

export const equipmentToFooterInsert = (e: EquipmentDetail | undefined): string | null => {
  if (!e) return null;
  if (!e.weight) return null;
  return `${e.weight} lb`;
};
