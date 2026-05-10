import fuzzysort from "fuzzysort";
import { useMemo } from "react";
import { useMagicItemIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import type { ContentType } from "./types";

export const magicItemsContentType: ContentType = {
  id: "magic-items",
  label: "Magic Items",
  searchPlaceholder: "Search magic items…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useMagicItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim();
      const entries = idx.data?.results ?? [];
      const ordered =
        q === "" ? entries : fuzzysort.go(q, entries, { key: "name" }).map((r) => r.obj);
      return ordered.map((entry) => ({
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
