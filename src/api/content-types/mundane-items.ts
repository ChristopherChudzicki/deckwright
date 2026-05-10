import { useMemo } from "react";
import { useMundaneItemIndex } from "../hooks";
import { mundaneItemDetailToCard } from "../mappers/mundaneItems";
import type { ContentType } from "./types";

export const mundaneItemsContentType: ContentType = {
  id: "mundane-items",
  label: "Mundane Items",
  searchPlaceholder: "Search mundane items…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useMundaneItemIndex(source);
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: entry.category.name,
          toCard: () => mundaneItemDetailToCard({ ...entry, ruleset: source }),
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
