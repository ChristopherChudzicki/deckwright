import type { MundaneItem } from "../../data/srd-schema";
import type { Ruleset } from "./magicItems";

export type { Ruleset };

export type MundaneItemDetail = MundaneItem & { ruleset: Ruleset };

export type MundaneItemIndex = {
  count: number;
  results: MundaneItem[];
};

// JSON shape is validated at write time by scripts/fetch-srd.ts; the cast is
// the trust boundary into the bundled file.
const loadData = async (ruleset: Ruleset): Promise<MundaneItem[]> => {
  const m =
    ruleset === "2024"
      ? await import("../../data/srd-2024-mundane-items.json")
      : await import("../../data/srd-2014-mundane-items.json");
  return m.default as MundaneItem[];
};

export const fetchMundaneItemIndex = async (ruleset: Ruleset): Promise<MundaneItemIndex> => {
  const results = await loadData(ruleset);
  return { count: results.length, results };
};
