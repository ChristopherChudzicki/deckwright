import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { usePrintSelection } from "./usePrintSelection";

describe("usePrintSelection", () => {
  test("initializes to all renderable ids once data is ready", () => {
    const { result } = renderHook(({ ids, ready }) => usePrintSelection("d1", ids, ready), {
      initialProps: { ids: ["a", "b", "c"], ready: true },
    });
    expect([...result.current.selected].sort()).toEqual(["a", "b", "c"]);
  });

  test("does not initialize until ready is true", () => {
    const { result, rerender } = renderHook(
      ({ ids, ready }) => usePrintSelection("d1", ids, ready),
      { initialProps: { ids: [] as string[], ready: false } },
    );
    expect(result.current.selected.size).toBe(0);
    rerender({ ids: ["a", "b"], ready: true });
    expect([...result.current.selected].sort()).toEqual(["a", "b"]);
  });

  test("a refetch of the same deck does not reset a narrowed selection", () => {
    const { result, rerender } = renderHook(
      ({ ids, ready }) => usePrintSelection("d1", ids, ready),
      { initialProps: { ids: ["a", "b", "c"], ready: true } },
    );
    act(() => result.current.setSelected(new Set(["a"])));
    expect([...result.current.selected]).toEqual(["a"]);
    rerender({ ids: ["a", "b", "c"], ready: true });
    expect([...result.current.selected]).toEqual(["a"]);
  });

  test("switching deckId re-initializes to all", () => {
    const { result, rerender } = renderHook(
      ({ deckId, ids }) => usePrintSelection(deckId, ids, true),
      { initialProps: { deckId: "d1", ids: ["a", "b"] } },
    );
    act(() => result.current.setSelected(new Set(["a"])));
    rerender({ deckId: "d2", ids: ["x", "y", "z"] });
    expect([...result.current.selected].sort()).toEqual(["x", "y", "z"]);
  });

  test("selectAll restores the full renderable set", () => {
    const { result } = renderHook(() => usePrintSelection("d1", ["a", "b", "c"], true));
    act(() => result.current.setSelected(new Set(["a"])));
    act(() => result.current.selectAll());
    expect([...result.current.selected].sort()).toEqual(["a", "b", "c"]);
  });
});
