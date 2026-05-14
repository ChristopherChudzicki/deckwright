import type { Card } from "../../cards/types";
import type { Ruleset } from "../endpoints/magicItems";

export type ContentRow = {
  key: string;
  name: string;
  meta: string;
  kindLabel?: string;
  toCard: () => Card;
};

export type ContentTypeResults = {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  rows: ReadonlyArray<ContentRow>;
};

export type ContentType = {
  id: string;
  label: string;
  searchPlaceholder: string;
  supportedSources: readonly [Ruleset, ...Ruleset[]];
  useResults: (source: Ruleset, query: string) => ContentTypeResults;
};
