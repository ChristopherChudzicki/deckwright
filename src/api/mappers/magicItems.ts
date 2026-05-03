import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { EquipmentDetail } from "../endpoints/equipment";
import type { MagicItemDetail } from "../endpoints/magicItems";
import { equipmentToFooterInsert, equipmentToHeaderInsert } from "./equipment";

const IMAGE_BASE = "https://www.dnd5eapi.co";

const composeHeaderTags = (
  category: string,
  attunement: boolean,
  enrichment: EquipmentDetail | undefined,
): string[] => {
  const tags = [category];
  const insert = enrichment ? equipmentToHeaderInsert(enrichment) : null;
  if (insert) tags.push(insert);
  if (attunement) tags.push("requires attunement");
  return tags;
};

const composeFooterTags = (rarity: string, enrichment: EquipmentDetail | undefined): string[] => {
  const tags = [rarity.toLowerCase()];
  const insert = enrichment ? equipmentToFooterInsert(enrichment) : null;
  if (insert) tags.push(insert);
  return tags;
};

const detectAttunement2014 = (firstLine: string | undefined): boolean =>
  firstLine !== undefined && /requires attunement/i.test(firstLine);

export const magicItemDetailToCard = (
  detail: MagicItemDetail,
  enrichment?: EquipmentDetail,
): ItemCard => {
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
      headerTags: composeHeaderTags(detail.equipment_category.name, detail.attunement, enrichment),
      body: detail.desc,
      footerTags: composeFooterTags(detail.rarity.name, enrichment),
    };
  }

  return {
    ...common,
    headerTags: composeHeaderTags(
      detail.equipment_category.name,
      detectAttunement2014(detail.desc[0]),
      enrichment,
    ),
    body: detail.desc.join("\n\n"),
    footerTags: composeFooterTags(detail.rarity.name, enrichment),
  };
};
