import type { ComponentType } from "react";
import type { Ruleset } from "../../api/endpoints/magicItems";
import type { Card } from "../../cards/types";

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

export type ResultsProps = {
  source: Ruleset;
  query: string;
  pickingKey: string | null;
  pickError: string | null;
  onPick: (rowKey: string, card: Card) => void;
  onCount: (count: number | null) => void;
};

export type ContentType = {
  id: string;
  label: string;
  searchPlaceholder: string;
  supportedSources: readonly [Ruleset, ...Ruleset[]];
  // A component (not a hook) so that switching types renders a different
  // component type and React remounts it — the per-type hook sets never collide.
  Results: ComponentType<ResultsProps>;
};
