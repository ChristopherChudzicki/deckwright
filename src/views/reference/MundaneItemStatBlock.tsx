import type { MundaneItem } from "../../data/srd-schema";
import {
  acFormula,
  formatCost,
  formatWeight,
  isShieldArmor,
  weaponPropertyLabel,
} from "../../lib/srd-format/items";
import { type StatItem, StatList } from "./StatList";

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function MundaneItemStatBlock({ item }: { item: MundaneItem }) {
  const items: StatItem[] = [];
  items.push({ label: "Category", value: item.category.name });

  if (item.weapon) {
    if (item.weapon.is_simple) items.push({ label: "Weapon type", value: "Simple" });
    else if (item.weapon.is_martial) items.push({ label: "Weapon type", value: "Martial" });
    items.push({
      label: "Damage",
      value: `${item.weapon.damage_dice} ${item.weapon.damage_type.name.toLowerCase()}`,
    });
    if (item.weapon.properties.length > 0) {
      items.push({
        label: "Properties",
        value: (
          <ul>
            {item.weapon.properties.map((p) => (
              <li key={`${p.property.name}-${p.detail ?? ""}`}>{weaponPropertyLabel(p)}</li>
            ))}
          </ul>
        ),
      });
    }
  }

  if (item.armor) {
    if (!isShieldArmor(item.armor)) {
      items.push({ label: "Armor tier", value: capitalize(item.armor.category) });
    }
    items.push({ label: "AC", value: acFormula(item.armor) });
    if (item.armor.grants_stealth_disadvantage) {
      items.push({ label: "Stealth", value: "Disadvantage" });
    }
    if (item.armor.strength_score_required !== null) {
      items.push({ label: "Strength", value: String(item.armor.strength_score_required) });
    }
  }

  const cost = formatCost(item.cost);
  if (cost) items.push({ label: "Cost", value: cost });
  const weight = formatWeight(item.weight, item.weight_unit);
  if (weight) items.push({ label: "Weight", value: weight });

  return <StatList items={items} />;
}
