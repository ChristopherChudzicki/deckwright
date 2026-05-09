import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { itemCardFactory } from "./factories";
import { useExpandedCards } from "./useExpandedCards";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 200;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 300;
    },
  });
});

describe("useExpandedCards", () => {
  test("returns one PhysicalCard per item when bodies fit", () => {
    const items = itemCardFactory.buildList(3);
    const { result } = renderHook(() => useExpandedCards(items, 4));
    expect(result.current.physicalCards).toHaveLength(3);
    expect(result.current.physicalCards.every((p) => p.pagination === undefined)).toBe(true);
  });

  test("layout change re-runs measurement", () => {
    const items = itemCardFactory.buildList(2);
    const { result, rerender } = renderHook(
      ({ cardsPerPage }: { cardsPerPage: 4 | 2 }) => useExpandedCards(items, cardsPerPage),
      { initialProps: { cardsPerPage: 4 as 4 | 2 } },
    );
    const before = result.current.physicalCards;
    rerender({ cardsPerPage: 2 });
    expect(result.current.physicalCards).toHaveLength(before.length);
  });

  describe("with debounceMs", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("does not re-paginate until debounce elapses on items change", () => {
      const itemsA = itemCardFactory.buildList(1);
      const itemsB = itemCardFactory.buildList(2);
      const { result, rerender } = renderHook(
        ({ items }: { items: typeof itemsA }) => useExpandedCards(items, 4, { debounceMs: 300 }),
        { initialProps: { items: itemsA } },
      );
      expect(result.current.physicalCards).toHaveLength(1);

      rerender({ items: itemsB });
      // Still showing the pre-change pagination immediately after rerender.
      expect(result.current.physicalCards).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(result.current.physicalCards).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.physicalCards).toHaveLength(2);
    });

    test("debounceMs of 0 is synchronous (no extra render lag)", () => {
      const itemsA = itemCardFactory.buildList(1);
      const itemsB = itemCardFactory.buildList(2);
      const { result, rerender } = renderHook(
        ({ items }: { items: typeof itemsA }) => useExpandedCards(items, 4, { debounceMs: 0 }),
        { initialProps: { items: itemsA } },
      );
      expect(result.current.physicalCards).toHaveLength(1);

      rerender({ items: itemsB });
      // Synchronous: change visible immediately on next render.
      expect(result.current.physicalCards).toHaveLength(2);
    });
  });
});

vi.mock("./Card.module.css", () => ({
  default: new Proxy({}, { get: (_, k) => String(k) }),
}));
