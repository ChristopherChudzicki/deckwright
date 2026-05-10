import { useQuery } from "@tanstack/react-query";
import { fetchMagicItemIndex, type Ruleset } from "./endpoints/magicItems";
import { fetchMundaneItemIndex } from "./endpoints/mundaneItems";
import { fetchSpellIndex } from "./endpoints/spells";
import { DAY_MS } from "./timing";

export const useMagicItemIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["magic-items", ruleset, "index"],
    queryFn: () => fetchMagicItemIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

export const useMundaneItemIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["mundane-items", ruleset, "index"],
    queryFn: () => fetchMundaneItemIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });

export const useSpellIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["spells", ruleset, "index"],
    queryFn: () => fetchSpellIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });
