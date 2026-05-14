import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { acFormula, formatWeight } from "../../lib/srd-format/items";
import { nowIso } from "../../lib/time";
import type { MagicItemDetail } from "../endpoints/magicItems";

export const magicItemDetailToCard = (detail: MagicItemDetail): ItemCard => {
  const now = nowIso();
  const headerTags: string[] = [detail.category.name];
  if (detail.weapon) {
    headerTags.push(`${detail.weapon.damage_dice} ${detail.weapon.damage_type.name.toLowerCase()}`);
  }
  if (detail.armor) {
    headerTags.push(acFormula(detail.armor));
  }
  if (detail.requires_attunement) {
    headerTags.push(
      detail.attunement_detail
        ? `requires attunement ${detail.attunement_detail}`
        : "requires attunement",
    );
  }
  const footerTags: string[] = [detail.rarity.name.toLowerCase()];
  const weight = formatWeight(detail.weight, detail.weight_unit);
  if (weight) footerTags.push(weight);
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
