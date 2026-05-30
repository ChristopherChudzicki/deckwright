import fuzzysort from "fuzzysort";
import { useMemo } from "react";
import { useMagicItemIndex, useMundaneItemIndex } from "../../api/hooks";
import { magicItemDetailToCard } from "../../api/mappers/magicItems";
import { mundaneItemDetailToCard } from "../../api/mappers/mundaneItems";
import type { MagicItem, MundaneItem } from "../../data/srd-schema";
import { ResultsView } from "./ResultsView";
import type { ContentRow, ContentType, ResultsProps } from "./types";

type TaggedEntry = (MagicItem & { __source: "magic" }) | (MundaneItem & { __source: "mundane" });

function ItemsResults({ source, query, ...rest }: ResultsProps) {
  const magic = useMagicItemIndex(source);
  const mundane = useMundaneItemIndex(source);
  const rows = useMemo<ContentRow[]>(() => {
    const q = query.trim();
    const tagged: TaggedEntry[] = [
      ...(magic.data?.results ?? []).map((entry): TaggedEntry => ({ ...entry, __source: "magic" })),
      ...(mundane.data?.results ?? []).map(
        (entry): TaggedEntry => ({ ...entry, __source: "mundane" }),
      ),
    ];
    const ordered =
      q === ""
        ? [...tagged].sort((a, b) => a.name.localeCompare(b.name))
        : fuzzysort.go(q, tagged, { key: "name" }).map((r) => r.obj);
    return ordered.map((entry) =>
      entry.__source === "magic"
        ? {
            key: entry.key,
            name: entry.name,
            meta: entry.rarity.name,
            toCard: () => magicItemDetailToCard({ ...entry, ruleset: source }),
          }
        : {
            key: entry.key,
            name: entry.name,
            meta: entry.category.name,
            toCard: () => mundaneItemDetailToCard({ ...entry, ruleset: source }),
          },
    );
  }, [magic.data, mundane.data, query, source]);

  return (
    <ResultsView
      results={{
        isLoading: magic.isLoading || mundane.isLoading,
        // OR-merge: if either endpoint errors the tab shows the error banner.
        // In practice both load from bundled JSON so partial failure is rare.
        isError: magic.isError || mundane.isError,
        // Both refetches fire-and-forget; React Query manages the loading state.
        refetch: () => {
          magic.refetch();
          mundane.refetch();
        },
        rows,
      }}
      emptyMessage="No items match your search."
      {...rest}
    />
  );
}

export const itemsContentType: ContentType = {
  id: "items",
  label: "Items",
  searchPlaceholder: "Search items…",
  supportedSources: ["2024", "2014"],
  Results: ItemsResults,
};
