import fuzzysort from "fuzzysort";
import { useMemo } from "react";
import type { MagicItem, MundaneItem, Spell } from "../../data/srd-schema";
import { levelLabel } from "../../lib/srd-format/spells";
import { useMagicItemIndex, useMundaneItemIndex, useSpellIndex } from "../hooks";
import { magicItemDetailToCard } from "../mappers/magicItems";
import { mundaneItemDetailToCard } from "../mappers/mundaneItems";
import { spellDetailToCard } from "../mappers/spells";
import type { ContentRow, ContentType } from "./types";

type TaggedEntry =
  | (MagicItem & { __source: "magic" })
  | (MundaneItem & { __source: "mundane" })
  | (Spell & { __source: "spell" });

export const allContentType: ContentType = {
  id: "all",
  label: "All",
  searchPlaceholder: "Search SRD…",
  emptyMessage: "No results match your search.",
  supportedSources: ["2024", "2014"],
  useResults: (source, query) => {
    const magic = useMagicItemIndex(source);
    const mundane = useMundaneItemIndex(source);
    const spells = useSpellIndex(source);
    const rows = useMemo<ContentRow[]>(() => {
      const q = query.trim();
      const tagged: TaggedEntry[] = [
        ...(magic.data?.results ?? []).map(
          (entry): TaggedEntry => ({ ...entry, __source: "magic" }),
        ),
        ...(mundane.data?.results ?? []).map(
          (entry): TaggedEntry => ({ ...entry, __source: "mundane" }),
        ),
        ...(spells.data?.results ?? []).map(
          (entry): TaggedEntry => ({ ...entry, __source: "spell" }),
        ),
      ];
      const ordered =
        q === ""
          ? [...tagged].sort((a, b) => a.name.localeCompare(b.name))
          : fuzzysort.go(q, tagged, { key: "name" }).map((r) => r.obj);
      return ordered.map((entry): ContentRow => {
        if (entry.__source === "magic") {
          return {
            key: entry.key,
            name: entry.name,
            meta: entry.rarity.name,
            kindLabel: "Item",
            toCard: () => magicItemDetailToCard({ ...entry, ruleset: source }),
          };
        }
        if (entry.__source === "mundane") {
          return {
            key: entry.key,
            name: entry.name,
            meta: entry.category.name,
            kindLabel: "Item",
            toCard: () => mundaneItemDetailToCard({ ...entry, ruleset: source }),
          };
        }
        return {
          key: entry.key,
          name: entry.name,
          meta: levelLabel(entry.level, entry.school.name),
          kindLabel: "Spell",
          toCard: () => spellDetailToCard({ ...entry, ruleset: source }),
        };
      });
    }, [magic.data, mundane.data, spells.data, query, source]);
    return {
      isLoading: magic.isLoading || mundane.isLoading || spells.isLoading,
      isError: magic.isError || mundane.isError || spells.isError,
      refetch: () => {
        magic.refetch();
        mundane.refetch();
        spells.refetch();
      },
      rows,
    };
  },
};
