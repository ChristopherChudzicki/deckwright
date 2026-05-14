import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import {
  acFormula,
  formatCost,
  formatWeight,
  isShieldArmor,
  weaponPropertyLabel,
} from "../../lib/srd-format/items";
import { nowIso } from "../../lib/time";
import { referenceAbsoluteUrl } from "../../views/reference/routeUrl";
import type { MundaneItemDetail } from "../endpoints/mundaneItems";

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const mundaneItemDetailToCard = (detail: MundaneItemDetail): ItemCard => {
  const now = nowIso();
  const headerTags: string[] = [detail.category.name];

  if (detail.weapon) {
    if (detail.weapon.is_simple) headerTags.push("Simple");
    else if (detail.weapon.is_martial) headerTags.push("Martial");
    headerTags.push(`${detail.weapon.damage_dice} ${detail.weapon.damage_type.name.toLowerCase()}`);
    for (const p of detail.weapon.properties) headerTags.push(weaponPropertyLabel(p));
  }

  if (detail.armor) {
    if (!isShieldArmor(detail.armor)) headerTags.push(capitalize(detail.armor.category));
    headerTags.push(acFormula(detail.armor));
    if (detail.armor.grants_stealth_disadvantage) headerTags.push("Stealth disadvantage");
    if (detail.armor.strength_score_required !== null) {
      headerTags.push(`Str ${detail.armor.strength_score_required}`);
    }
  }

  const footerTags: string[] = [];
  const cost = formatCost(detail.cost);
  if (cost !== null) footerTags.push(cost);
  const weight = formatWeight(detail.weight, detail.weight_unit);
  if (weight !== null) footerTags.push(weight);

  return {
    id: newId(),
    kind: "item",
    name: detail.name,
    headerTags,
    body: detail.desc,
    footerTags,
    source: "api",
    apiRef: {
      system: "open5e",
      slug: detail.key,
      ruleset: detail.ruleset,
      kind: "mundane-items",
    },
    referenceUrl: referenceAbsoluteUrl("mundane-items", detail.key),
    createdAt: now,
    updatedAt: now,
  };
};
