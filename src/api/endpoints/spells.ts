import type { Spell } from "../../data/srd-schema";
import type { Ruleset } from "./magicItems";

export type { Ruleset };
export type SpellDetail = Spell & { ruleset: Ruleset };

export type SpellIndex = {
  count: number;
  results: Spell[];
};

const loadData = async (ruleset: Ruleset): Promise<Spell[]> => {
  const m =
    ruleset === "2024"
      ? await import("../../data/srd-2024-spells.json")
      : await import("../../data/srd-2014-spells.json");
  return m.default as Spell[];
};

export const fetchSpellIndex = async (ruleset: Ruleset): Promise<SpellIndex> => {
  const results = await loadData(ruleset);
  return { count: results.length, results };
};
