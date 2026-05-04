import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MagicItemDetail } from "../endpoints/magicItems";

export const magicItemDetailToCard = (detail: MagicItemDetail): ItemCard => {
  const now = nowIso();
  const headerTags: string[] = [detail.category.name];
  if (detail.weapon) {
    headerTags.push(`${detail.weapon.damage_dice} ${detail.weapon.damage_type.name.toLowerCase()}`);
  }
  if (detail.armor) {
    const { ac_base, ac_add_dexmod, ac_cap_dexmod } = detail.armor;
    let ac = `AC ${ac_base}`;
    if (ac_add_dexmod) {
      ac += ac_cap_dexmod !== null ? ` + dex mod (max ${ac_cap_dexmod})` : " + dex mod";
    }
    headerTags.push(ac);
  }
  if (detail.requires_attunement) {
    headerTags.push(
      detail.attunement_detail
        ? `requires attunement ${detail.attunement_detail}`
        : "requires attunement",
    );
  }
  const footerTags: string[] = [detail.rarity.name.toLowerCase()];
  const weight = parseFloat(detail.weight);
  if (weight > 0) {
    footerTags.push(`${weight} ${detail.weight_unit}`);
  }
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
