import { useMemo } from "react";
import { useSpellIndex } from "../hooks";
import { spellDetailToCard } from "../mappers/spells";
import type { ContentType } from "./types";

const ordinal = (n: number): string => {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const spellMeta = (level: number, schoolName: string): string => {
  const school = schoolName.toLowerCase();
  if (level === 0) return `${capitalize(school)} cantrip`;
  return `${ordinal(level)}-level ${school}`;
};

export const spellsContentType: ContentType = {
  id: "spells",
  label: "Spells",
  searchPlaceholder: "Search spells…",
  supportedSources: ["2014", "2024"] as const,
  useResults: (source, query) => {
    const idx = useSpellIndex(source);
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return (idx.data?.results ?? [])
        .filter((e) => q === "" || e.name.toLowerCase().includes(q))
        .map((entry) => ({
          key: entry.key,
          name: entry.name,
          meta: spellMeta(entry.level, entry.school.name),
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
