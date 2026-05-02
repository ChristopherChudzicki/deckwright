import { useMemo, useSyncExternalStore } from "react";
import type { CardsPerPage } from "./Card";
import { expandCard, type PhysicalCard } from "./expandCard";
import { getMeasurer } from "./measurer";
import type { ItemCard } from "./types";

export type { PhysicalCard };

// Why useSyncExternalStore: the measurer scaffold is module-level DOM living
// outside React (see measurer.ts). useSyncExternalStore reads it synchronously
// during render, so the first render already has correct chunks — an
// alternative useEffect+useState approach would flicker through one render of
// empty chunks. The store never changes, so subscribe is a no-op.
const subscribe = () => () => {};

export function useExpandedCards(
  items: ItemCard[],
  cardsPerPage: CardsPerPage,
): { physicalCards: PhysicalCard[] } {
  const measurer = useSyncExternalStore(subscribe, () => getMeasurer(cardsPerPage));

  const physicalCards = useMemo<PhysicalCard[]>(
    () => items.flatMap((item) => expandCard(item, measurer)),
    [items, measurer],
  );

  return { physicalCards };
}
