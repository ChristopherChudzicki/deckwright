import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { MagicItemDetail } from "../endpoints/magicItems";

export const magicItemDetailToCard = (detail: MagicItemDetail): ItemCard => {
  const now = nowIso();
  const headerTags: string[] = [detail.category.name];
  if (detail.requires_attunement) {
    headerTags.push(
      detail.attunement_detail
        ? `requires attunement ${detail.attunement_detail}`
        : "requires attunement",
    );
  }
  return {
    id: newId(),
    kind: "item",
    name: detail.name,
    headerTags,
    body: detail.desc,
    footerTags: [detail.rarity.name.toLowerCase()],
    source: "api",
    apiRef: { system: "open5e", slug: detail.key, ruleset: detail.ruleset },
    createdAt: now,
    updatedAt: now,
  };
};
