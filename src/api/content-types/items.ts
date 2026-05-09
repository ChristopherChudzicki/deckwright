import { useMemo } from "react";
import { useMagicItemIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import type { ContentType } from "./types";

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export const itemsContentType: ContentType = {
  id: "items",
  label: "Items",
  searchPlaceholder: "Search items…",
  supportedSources: ["2024", "2014"] as const,
  useResults: (source, query) => {
    const idx = useMagicItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: capitalize(entry.rarity.name),
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
