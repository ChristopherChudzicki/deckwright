import { useMemo } from "react";
import { fuzzyMatch } from "../../lib/fuzzyMatch";
import { useMagicItemIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import type { ContentType } from "./types";

export const itemsContentType: ContentType = {
  id: "items",
  label: "Magic Items",
  searchPlaceholder: "Search magic items…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useMagicItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim();
      const entries = idx.data?.results ?? [];
      const scored =
        q === ""
          ? entries.map((entry) => ({ entry, score: 0 }))
          : entries.flatMap((entry) => {
              const m = fuzzyMatch(q, entry.name);
              return m ? [{ entry, score: m.score }] : [];
            });
      return scored
        .sort((a, b) => b.score - a.score)
        .map(({ entry }) => ({
          key: entry.key,
          name: entry.name,
          meta: entry.rarity.name,
          toCard: () => magicItemDetailToCard({ ...entry, ruleset: source }),
        }));
    }, [idx.data, query, source]);
    return {
      isLoading: idx.isLoading,
      isError: idx.isError,
      refetch: idx.refetch,
      rows,
    };
  },
};
