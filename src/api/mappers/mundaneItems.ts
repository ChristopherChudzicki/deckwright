import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MundaneItemDetail } from "../endpoints/mundaneItems";

const formatCost = (cost: string): string | null => {
  const gp = parseFloat(cost);
  if (gp <= 0) return null;
  if (gp >= 1) return `${gp} gp`;
  if (gp >= 0.1) return `${Math.round(gp * 10)} sp`;
  return `${Math.round(gp * 100)} cp`;
};

type WeaponPropertyEntry = {
  property: { name: string; type: string | null };
  detail: string | null;
};

const propertyTag = ({ property, detail }: WeaponPropertyEntry): string => {
  if (property.type === "Mastery") return `${property.name} (Mastery)`;
  if (detail !== null) return `${property.name} (${detail})`;
  return property.name;
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const mundaneItemDetailToCard = (detail: MundaneItemDetail): ItemCard => {
  const now = nowIso();
  const headerTags: string[] = [detail.category.name];

  if (detail.weapon) {
    if (detail.weapon.is_simple) headerTags.push("Simple");
    else if (detail.weapon.is_martial) headerTags.push("Martial");
    headerTags.push(`${detail.weapon.damage_dice} ${detail.weapon.damage_type.name.toLowerCase()}`);
    for (const p of detail.weapon.properties) headerTags.push(propertyTag(p));
  }

  if (detail.armor) {
    headerTags.push(capitalize(detail.armor.category));
    const { ac_base, ac_add_dexmod, ac_cap_dexmod } = detail.armor;
    let ac = `AC ${ac_base}`;
    if (ac_add_dexmod) {
      ac += ac_cap_dexmod !== null ? ` + dex mod (max ${ac_cap_dexmod})` : " + dex mod";
    }
    headerTags.push(ac);
    if (detail.armor.grants_stealth_disadvantage) headerTags.push("Stealth disadvantage");
    if (detail.armor.strength_score_required !== null) {
      headerTags.push(`Str ${detail.armor.strength_score_required}`);
    }
  }

  const footerTags: string[] = [];
  const cost = formatCost(detail.cost);
  if (cost !== null) footerTags.push(cost);
  const weight = parseFloat(detail.weight);
  if (weight > 0) footerTags.push(`${weight} ${detail.weight_unit}`);

  return {
    id: newId(),
    kind: "item",
    name: detail.name,
    headerTags,
    body: detail.desc,
    footerTags,
    source: "api",
    apiRef: { system: "open5e", slug: detail.key, ruleset: detail.ruleset },
    createdAt: now,
    updatedAt: now,
  };
};
