export const formatCost = (cost: string): string | null => {
  const gp = parseFloat(cost);
  if (gp <= 0) return null;
  if (gp >= 1) return `${Math.round(gp)} gp`;
  if (gp >= 0.1) {
    const sp = Math.round(gp * 10);
    return sp > 0 ? `${sp} sp` : null;
  }
  const cp = Math.round(gp * 100);
  return cp > 0 ? `${cp} cp` : null;
};

export const formatWeight = (weight: string, unit: string): string | null => {
  const n = parseFloat(weight);
  if (!Number.isFinite(n) || n <= 0) return null;
  const trimmed = n.toString();
  return `${trimmed} ${unit}`;
};

export type ArmorInput = {
  ac_base: number;
  ac_add_dexmod: boolean;
  ac_cap_dexmod: number | null;
};

// Open5e v2 srd-2024 places Shield into the armor schema with category="heavy"
// and ac_base=2 (the +2 bonus). Real armor starts at ac_base 11; ac_base<=5 is
// a shield-shaped record.
export const isShieldArmor = (armor: Pick<ArmorInput, "ac_base">): boolean => armor.ac_base <= 5;

export const acFormula = (armor: ArmorInput): string => {
  if (isShieldArmor(armor)) return `+${armor.ac_base} AC`;
  let ac = `AC ${armor.ac_base}`;
  if (armor.ac_add_dexmod) {
    ac += armor.ac_cap_dexmod !== null ? ` + dex mod (max ${armor.ac_cap_dexmod})` : " + dex mod";
  }
  return ac;
};

export type AttunementInput = {
  requires_attunement: boolean;
  attunement_detail: string | null;
};

export const attunementLine = (input: AttunementInput): string | null => {
  if (!input.requires_attunement) return null;
  const detail = input.attunement_detail?.trim();
  if (!detail) return "Requires attunement";
  return `Requires attunement ${detail}`;
};

export type WeaponPropertyEntry = {
  property: { name: string; type: string | null };
  detail: string | null;
};

export const weaponPropertyLabel = ({ property, detail }: WeaponPropertyEntry): string => {
  if (property.type === "Mastery") return `${property.name} (Mastery)`;
  if (detail !== null) return `${property.name} (${detail})`;
  return property.name;
};
