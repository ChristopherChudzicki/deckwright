import { useEffect, useRef, useState } from "react";
import type { CardId } from "../cards/types";

export type PrintSelection = {
  selected: Set<CardId>;
  setSelected: (next: Set<CardId>) => void;
  selectAll: () => void;
};

/**
 * Owns the print selection as a Set of card ids. Initializes to "all
 * renderable" exactly once per deckId (when `ready` first turns true),
 * so a background refetch — which hands us a new `renderableIds` array
 * identity — does not silently wipe a narrowed selection. Switching to a
 * different deckId re-initializes.
 */
export function usePrintSelection(
  deckId: string,
  renderableIds: CardId[],
  ready: boolean,
): PrintSelection {
  const [selected, setSelected] = useState<Set<CardId>>(() => new Set());
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (ready && initializedFor.current !== deckId) {
      initializedFor.current = deckId;
      setSelected(new Set(renderableIds));
    }
  }, [ready, deckId, renderableIds]);

  return {
    selected,
    setSelected,
    selectAll: () => setSelected(new Set(renderableIds)),
  };
}
