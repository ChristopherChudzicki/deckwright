import type { ItemCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { EquipmentDetail } from "../endpoints/equipment";
import type { MagicItemDetail } from "../endpoints/magicItems";
import { type BaseHint, parseBaseHint } from "./baseHint";
import { equipmentToFooterInsert, equipmentToHeaderInsert } from "./equipment";

const IMAGE_BASE = "https://www.dnd5eapi.co";

// Tags are built from structured fields (equipment_category, attunement, rarity)
// plus an optional insert derived from the enrichment base item. The enrichment
// insert lets callers see "1d8 slashing" or "AC 18" in the header without
// reaching into the body prose.
const composeHeaderTags = (
  category: string,
  attunement: boolean,
  enrichment: EquipmentDetail | undefined,
): string[] => {
  const tags = [category];
  const insert = equipmentToHeaderInsert(enrichment);
  if (insert) tags.push(insert);
  if (attunement) tags.push("requires attunement");
  return tags;
};

const composeFooterTags = (rarity: string, enrichment: EquipmentDetail | undefined): string[] => {
  const tags = [rarity.toLowerCase()];
  const insert = equipmentToFooterInsert(enrichment);
  if (insert) tags.push(insert);
  return tags;
};

const detectAttunement2014 = (firstLine: string | undefined): boolean =>
  firstLine !== undefined && /requires attunement/i.test(firstLine);

// dnd5eapi 2024 magic-item desc is a single string whose first line is
// a metadata header like "Weapon (Any Melee Weapon)" followed by two
// trailing spaces (Markdown hard-break) and a newline, then the body.
// We strip that header line so it doesn't duplicate the tags + "Described
// as:" surface elsewhere in the UI. If the first line doesn't match a
// known type prefix we leave the desc unchanged — defensive against the
// API returning a shape we haven't observed.
const TYPE_PREFIX_2024 = /^(Weapon|Armor|Wondrous Item|Wand|Rod|Staff|Ring|Potion|Scroll)\b/i;

const stripBodyPrefix2024 = (desc: string): string => {
  const idx = desc.indexOf("\n");
  if (idx < 0) return desc;
  const head = desc.slice(0, idx).trim();
  if (!TYPE_PREFIX_2024.test(head)) return desc;
  return desc.slice(idx + 1).trim();
};

// dnd5eapi 2014 magic-item desc is a string[]. desc[0] is the metadata
// header line ("Weapon (any sword), rare (requires attunement)"); body
// content starts at desc[1]. Pattern verified across all observed types.
const stripBodyPrefix2014 = (desc: string[]): string => desc.slice(1).join("\n\n");

// For "any X" templates (Flame Tongue's "Weapon (Any Melee Weapon)",
// Holy Avenger 2024's "Weapon (Any Simple or Martial)"), the API name
// alone doesn't say which base the user picked. Append the base name in
// parens so the title reads "Flame Tongue (Trident)". For "specific"
// items (Sun Blade is always a longsword) and non-enrichable items, the
// API name is already complete and we leave it unchanged.
const composeName = (
  baseName: string,
  hint: BaseHint,
  enrichment: EquipmentDetail | undefined,
): string => {
  if (!enrichment) return baseName;
  if (hint.kind !== "any") return baseName;
  return `${baseName} (${enrichment.name})`;
};

/**
 * Maps a dnd5eapi magic-item detail response to an ItemCard.
 *
 * Key API contract differences between rulesets:
 * - 2024: `attunement` is a boolean field; `desc` is a single string whose
 *   first line is a metadata header (stripped here).
 * - 2014: attunement must be regex-detected from `desc[0]` prose; `desc` is
 *   a string[] where `desc[0]` is the metadata header and body starts at
 *   `desc[1]`.
 */
export const magicItemDetailToCard = (
  detail: MagicItemDetail,
  enrichment?: EquipmentDetail,
): ItemCard => {
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
    const hint = parseBaseHint(
      detail.desc.slice(0, detail.desc.indexOf("\n")).trim() || detail.desc,
    );
    return {
      ...common,
      name: composeName(detail.name, hint, enrichment),
      headerTags: composeHeaderTags(detail.equipment_category.name, detail.attunement, enrichment),
      body: stripBodyPrefix2024(detail.desc),
      footerTags: composeFooterTags(detail.rarity.name, enrichment),
    };
  }

  const hint = parseBaseHint(detail.desc[0]);
  return {
    ...common,
    name: composeName(detail.name, hint, enrichment),
    headerTags: composeHeaderTags(
      detail.equipment_category.name,
      detectAttunement2014(detail.desc[0]),
      enrichment,
    ),
    body: stripBodyPrefix2014(detail.desc),
    footerTags: composeFooterTags(detail.rarity.name, enrichment),
  };
};
