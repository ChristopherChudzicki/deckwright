import { useMemo, useSyncExternalStore } from "react";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import type { CardsPerPage } from "./Card";
import { expandCard, type PhysicalCard } from "./expandCard";
import { getMeasurer } from "./measurer";
import type { RenderableCard } from "./types";

export type { PhysicalCard };

// Why useSyncExternalStore: the measurer scaffold is module-level DOM living
// outside React (see measurer.ts). useSyncExternalStore reads it synchronously
// during render, so the first render already has correct chunks — an
// alternative useEffect+useState approach would flicker through one render of
// empty chunks. The store never changes, so subscribe is a no-op.
const subscribe = () => () => {};

export type UseExpandedCardsOpts = {
  // When > 0, re-pagination is delayed by this many ms after `items` changes.
  // Useful in editor previews to avoid running the layout walker on every
  // keystroke. Omit (or pass 0) for synchronous behavior, e.g. for print
  // rendering where the first paint must already be paginated.
  debounceMs?: number;
};

export function useExpandedCards(
  items: RenderableCard[],
  cardsPerPage: CardsPerPage,
  opts: UseExpandedCardsOpts = {},
): { physicalCards: PhysicalCard[]; isPending: boolean } {
  const measurer = useSyncExternalStore(subscribe, () => getMeasurer(cardsPerPage));
  const debounceMs = opts.debounceMs ?? 0;
  const debouncedItems = useDebouncedValue(items, debounceMs);
  const effectiveItems = debounceMs > 0 ? debouncedItems : items;
  const isPending = debounceMs > 0 && items !== debouncedItems;

  const physicalCards = useMemo<PhysicalCard[]>(
    () => effectiveItems.flatMap((item) => expandCard(item, measurer)),
    [effectiveItems, measurer],
  );

  return { physicalCards, isPending };
}
