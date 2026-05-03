import { useQuery } from "@tanstack/react-query";
import { fetchMagicItemDetail, fetchMagicItemIndex, type Ruleset } from "./endpoints/magicItems";

const DAY_MS = 24 * 60 * 60 * 1000;

export const useMagicItemIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["magic-items", ruleset, "index"],
    queryFn: () => fetchMagicItemIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

export const useMagicItemDetail = (ruleset: Ruleset, slug: string | null) =>
  useQuery({
    enabled: slug !== null,
    queryKey: ["magic-items", ruleset, "detail", slug],
    queryFn: () => fetchMagicItemDetail(ruleset, slug as string),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });
