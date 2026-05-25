import type { Key } from "react-aria-components";
import type { CardId } from "../cards/types";

/**
 * Merge the ListBox's visible selection back into the full print draft,
 * preserving cards that are selected but currently hidden by a filter/search.
 * RAC's `onSelectionChange` emits "all" (Cmd/Ctrl+A) or a Set of the visible keys.
 */
export function mergeVisibleSelection(
  draft: ReadonlySet<CardId>,
  visibleIds: readonly CardId[],
  keys: "all" | ReadonlySet<Key>,
): Set<CardId> {
  const visible = new Set<CardId>(visibleIds);
  const next = new Set<CardId>();
  // Selected-but-hidden cards (in the draft, not currently visible) survive untouched.
  for (const id of draft) {
    if (!visible.has(id)) next.add(id);
  }
  // Add back the visible selection — intersection with visibleIds narrows Key -> CardId
  // and guarantees the result is a subset of (hidden ∪ visibleIds).
  for (const id of visibleIds) {
    if (keys === "all" || keys.has(id)) next.add(id);
  }
  return next;
}
