import fuzzysort from "fuzzysort";
import { useMemo } from "react";
import { useSpellIndex } from "../../api/hooks";
import { spellDetailToCard } from "../../api/mappers/spells";
import { levelLabel } from "../../lib/srd-format/spells";
import { ResultsView } from "./ResultsView";
import type { ContentType, ResultsProps } from "./types";

function SpellsResults({ source, query, ...rest }: ResultsProps) {
  const idx = useSpellIndex(source);
  const rows = useMemo(() => {
    const q = query.trim();
    const entries = idx.data?.results ?? [];
    const ordered =
      q === "" ? entries : fuzzysort.go(q, entries, { key: "name" }).map((r) => r.obj);
    return ordered.map((entry) => ({
      key: entry.key,
      name: entry.name,
      meta: levelLabel(entry.level, entry.school.name),
      toCard: () => spellDetailToCard({ ...entry, ruleset: source }),
    }));
  }, [idx.data, query, source]);

  return (
    <ResultsView
      results={{ isLoading: idx.isLoading, isError: idx.isError, refetch: idx.refetch, rows }}
      emptyMessage="No spells match your search."
      {...rest}
    />
  );
}

export const spellsContentType: ContentType = {
  id: "spells",
  label: "Spells",
  searchPlaceholder: "Search spells…",
  supportedSources: ["2024", "2014"],
  Results: SpellsResults,
};
