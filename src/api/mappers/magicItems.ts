import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MagicItemDetail } from "../endpoints/magicItems";

const IMAGE_BASE = "https://www.dnd5eapi.co";

const detectAttunement2014 = (firstLine: string | undefined): boolean =>
  firstLine !== undefined && /requires attunement/i.test(firstLine);

// dnd5eapi 2024 magic-item desc is a single string whose first line is
// a metadata header like "Weapon (Any Melee Weapon)" followed by two
// trailing spaces (Markdown hard-break) and a newline, then the body.
const TYPE_PREFIX_2024 = /^(Weapon|Armor|Wondrous Item|Wand|Rod|Staff|Ring|Potion|Scroll)\b/i;

const stripBodyPrefix2024 = (desc: string): string => {
  const idx = desc.indexOf("\n");
  if (idx < 0) return desc;
  const head = desc.slice(0, idx).trim();
  if (!TYPE_PREFIX_2024.test(head)) return desc;
  return desc.slice(idx + 1).trim();
};

const stripBodyPrefix2014 = (desc: string[]): string => desc.slice(1).join("\n\n");

export const magicItemDetailToCard = (detail: MagicItemDetail): ItemCard => {
  const now = nowIso();
  const common = {
    id: newId(),
    kind: "item" as const,
    source: "api" as const,
    apiRef: {
      system: "dnd5eapi" as const,
      slug: detail.index,
      ruleset: detail.ruleset,
    },
    imageUrl: detail.image ? `${IMAGE_BASE}${detail.image}` : undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (detail.ruleset === "2024") {
    const headerTags: string[] = [detail.equipment_category.name];
    if (detail.attunement) headerTags.push("requires attunement");
    return {
      ...common,
      name: detail.name,
      headerTags,
      body: stripBodyPrefix2024(detail.desc),
      footerTags: [detail.rarity.name.toLowerCase()],
    };
  }

  const headerTags: string[] = [detail.equipment_category.name];
  if (detectAttunement2014(detail.desc[0])) headerTags.push("requires attunement");
  return {
    ...common,
    name: detail.name,
    headerTags,
    body: stripBodyPrefix2014(detail.desc),
    footerTags: [detail.rarity.name.toLowerCase()],
  };
};
