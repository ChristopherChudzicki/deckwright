import type { MagicItem } from "../../data/srd-schema";
import { acFormula, attunementLine, formatWeight } from "../../lib/srd-format/items";
import { type StatItem, StatList } from "./StatList";

export function MagicItemStatBlock({ item }: { item: MagicItem }) {
  const items: StatItem[] = [];
  items.push({ label: "Category", value: item.category.name });
  items.push({ label: "Rarity", value: item.rarity.name });

  const attunement = attunementLine(item);
  if (attunement) items.push({ label: "Attunement", value: attunement });

  if (item.weapon) {
    items.push({
      label: "Weapon",
      value: `${item.weapon.damage_dice} ${item.weapon.damage_type.name.toLowerCase()}`,
    });
  }
  if (item.armor) {
    items.push({ label: "Armor", value: acFormula(item.armor) });
  }
  const weight = formatWeight(item.weight, item.weight_unit);
  if (weight) items.push({ label: "Weight", value: weight });

  return <StatList items={items} />;
}
