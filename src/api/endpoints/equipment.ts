import { apiGet } from "../apiClient";
import type { Ruleset } from "./magicItems";

export type EquipmentIndexEntry = {
  index: string;
  name: string;
  url: string;
};

export type EquipmentIndex = {
  count: number;
  results: EquipmentIndexEntry[];
};

export type EquipmentDamage = {
  damage_dice: string;
  damage_type: { name: string };
};

export type EquipmentArmorClass = {
  base: number;
  dex_bonus?: boolean;
  max_bonus?: number;
};

export type EquipmentDetail = {
  index: string;
  name: string;
  damage?: EquipmentDamage;
  armor_class?: EquipmentArmorClass;
  weight?: number;
  cost?: { quantity: number; unit: string };
};

export const fetchEquipmentIndex = (ruleset: Ruleset): Promise<EquipmentIndex> =>
  apiGet<EquipmentIndex>(`/api/${ruleset}/equipment`);

export const fetchEquipmentDetail = (ruleset: Ruleset, slug: string): Promise<EquipmentDetail> =>
  apiGet<EquipmentDetail>(`/api/${ruleset}/equipment/${slug}`);
