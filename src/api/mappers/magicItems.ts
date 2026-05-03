import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MagicItemDetail } from "../endpoints/magicItems";

const IMAGE_BASE = "https://www.dnd5eapi.co";

const composeHeaderTags = (category: string, rarity: string, attunement: boolean): string[] => {
  const tags = [category, rarity.toLowerCase()];
  if (attunement) tags.push("requires attunement");
  return tags;
};

const detectAttunement2014 = (firstLine: string | undefined): boolean =>
  firstLine !== undefined && /requires attunement/i.test(firstLine);

export const magicItemDetailToCard = (detail: MagicItemDetail): ItemCard => {
  const now = nowIso();
  const common = {
    id: newId(),
    kind: "item" as const,
    name: detail.name,
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
    return {
      ...common,
      headerTags: composeHeaderTags(
        detail.equipment_category.name,
        detail.rarity.name,
        detail.attunement,
      ),
      body: detail.desc,
      footerTags: [],
    };
  }

  return {
    ...common,
    headerTags: composeHeaderTags(
      detail.equipment_category.name,
      detail.rarity.name,
      detectAttunement2014(detail.desc[0]),
    ),
    body: detail.desc.join("\n\n"),
    footerTags: [],
  };
};
