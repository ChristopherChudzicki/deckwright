import { useQuery } from "@tanstack/react-query";
import { fetchMagicItemIndex, type Ruleset } from "./endpoints/magicItems";
import { DAY_MS } from "./timing";

export const useMagicItemIndex = (ruleset: Ruleset) =>
  useQuery({
    queryKey: ["magic-items", ruleset, "index"],
    queryFn: () => fetchMagicItemIndex(ruleset),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
  });
