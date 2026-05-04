import type { MagicItem } from "../../data/srd-schema";

export type Ruleset = "2014" | "2024";

export type MagicItemIndexEntry = MagicItem;
export type MagicItemDetail = MagicItem & { ruleset: Ruleset };

export type MagicItemIndex = {
  count: number;
  results: MagicItemIndexEntry[];
};

const loadData = async (ruleset: Ruleset): Promise<MagicItem[]> => {
  const m =
    ruleset === "2024"
      ? await import("../../data/srd-2024-magicitems.json")
      : await import("../../data/srd-2014-magicitems.json");
  return m.default as MagicItem[];
};

export const fetchMagicItemIndex = async (ruleset: Ruleset): Promise<MagicItemIndex> => {
  const results = await loadData(ruleset);
  return { count: results.length, results };
};
