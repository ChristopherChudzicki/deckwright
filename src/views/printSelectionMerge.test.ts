import { describe, expect, test } from "vitest";
import type { CardId } from "../cards/types";
import { mergeVisibleSelection } from "./printSelectionMerge";

const ids = (...xs: string[]) => xs as CardId[];

describe("mergeVisibleSelection", () => {
  test("keeps selected-but-hidden cards when the visible selection changes", () => {
    const draft = new Set(ids("a", "b", "hidden"));
    const visibleIds = ids("a", "b"); // 'hidden' is filtered out of the list
    const next = mergeVisibleSelection(draft, visibleIds, new Set(ids("a")));
    expect(next).toEqual(new Set(ids("a", "hidden")));
  });

  test('the "all" sentinel selects every visible id, plus hidden', () => {
    const draft = new Set(ids("hidden"));
    const visibleIds = ids("a", "b");
    const next = mergeVisibleSelection(draft, visibleIds, "all");
    expect(next).toEqual(new Set(ids("hidden", "a", "b")));
  });

  test("drops a key that is not in visibleIds (intersection invariant)", () => {
    const draft = new Set<CardId>();
    const visibleIds = ids("a", "b");
    const next = mergeVisibleSelection(draft, visibleIds, new Set(ids("a", "ghost")));
    expect(next).toEqual(new Set(ids("a")));
  });

  test("an empty visible set does not drop hidden-selected cards", () => {
    const draft = new Set(ids("hidden1", "hidden2"));
    const visibleIds: CardId[] = [];
    const next = mergeVisibleSelection(draft, visibleIds, new Set<CardId>());
    expect(next).toEqual(new Set(ids("hidden1", "hidden2")));
  });

  test("is idempotent: re-applying the current visible selection is content-equal", () => {
    const draft = new Set(ids("a", "hidden"));
    const visibleIds = ids("a", "b");
    const current = new Set(visibleIds.filter((id) => draft.has(id))); // { a }
    expect(mergeVisibleSelection(draft, visibleIds, current)).toEqual(draft);
  });
});
