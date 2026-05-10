import { useMemo } from "react";
import { fuzzyMatch } from "../../lib/fuzzyMatch";
import { useSpellIndex } from "../hooks";
import { levelTag, spellDetailToCard } from "../mappers/spells";
import type { ContentType } from "./types";

export const spellsContentType: ContentType = {
  id: "spells",
  label: "Spells",
  searchPlaceholder: "Search spells…",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const idx = useSpellIndex(source);
    const rows = useMemo(() => {
      const q = query.trim();
      const entries = idx.data?.results ?? [];
      const ordered =
        q === ""
          ? entries
          : entries
              .flatMap((entry) => {
                const m = fuzzyMatch(q, entry.name);
                return m ? [{ entry, score: m.score }] : [];
              })
              .sort((a, b) => b.score - a.score)
              .map(({ entry }) => entry);
      return ordered.map((entry) => ({
        key: entry.key,
        name: entry.name,
        meta: levelTag(entry.level, entry.school.name),
        toCard: () => spellDetailToCard({ ...entry, ruleset: source }),
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
