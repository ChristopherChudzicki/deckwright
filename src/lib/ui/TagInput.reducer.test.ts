import { describe, expect, test } from "vitest";
import { initialState, normalizeDraft, type State, tagInputReducer } from "./TagInput.reducer";

const VALUE = ["a", "b", "c"];

function idle(activeSlot = VALUE.length * 2): State {
  return { mode: { kind: "idle" }, activeSlot };
}

describe("normalizeDraft", () => {
  test("collapses newlines to spaces then trims", () => {
    expect(normalizeDraft("  foo\nbar\r baz  ")).toBe("foo bar  baz");
  });
  test("trims pure whitespace to empty", () => {
    expect(normalizeDraft("   ")).toBe("");
  });
});

describe("tagInputReducer", () => {
  test("openEdit captures original and moves activeSlot to chip", () => {
    const { state } = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 1,
        value: VALUE,
      },
      VALUE,
    );
    expect(state.mode).toEqual({
      kind: "editing",
      index: 1,
      draft: "b",
      original: "b",
    });
    expect(state.activeSlot).toBe(3);
  });

  test("openInsert enters inserting at the gap with initialDraft", () => {
    const { state } = tagInputReducer(
      initialState(VALUE),
      {
        type: "openInsert",
        at: 2,
        initialDraft: "x",
      },
      VALUE,
    );
    expect(state.mode).toEqual({ kind: "inserting", at: 2, draft: "x" });
    expect(state.activeSlot).toBe(4);
  });

  test("updateDraft mutates editing.draft", () => {
    let result = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 0,
        value: VALUE,
      },
      VALUE,
    );
    result = tagInputReducer(result.state, { type: "updateDraft", draft: "A" }, VALUE);
    expect(result.state.mode).toEqual({
      kind: "editing",
      index: 0,
      draft: "A",
      original: "a",
    });
  });

  test("commit on non-empty edit updates value", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 1,
        value: VALUE,
      },
      VALUE,
    );
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "B" }, VALUE);
    const committed = tagInputReducer(typed.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["a", "B", "c"]);
    expect(committed.state).toEqual(idle(3));
  });

  test("commit on empty edit removes the chip and points active to the gap", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 1,
        value: VALUE,
      },
      VALUE,
    );
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "" }, VALUE);
    const committed = tagInputReducer(typed.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["a", "c"]);
    expect(committed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 2 });
  });

  test("commit on whitespace-only edit removes the chip", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 0,
        value: VALUE,
      },
      VALUE,
    );
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "   " }, VALUE);
    const committed = tagInputReducer(typed.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["b", "c"]);
  });

  test("commit on no-change edit is a noop with nextValue undefined", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 0,
        value: VALUE,
      },
      VALUE,
    );
    const committed = tagInputReducer(open.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toBeUndefined();
    expect(committed.state).toEqual(idle(1));
  });

  test("commit on non-empty insert places value at index and advances active", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openInsert",
        at: 1,
        initialDraft: "X",
      },
      VALUE,
    );
    const committed = tagInputReducer(open.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["a", "X", "b", "c"]);
    expect(committed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 4 });
  });

  test("commit on empty insert is a noop", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openInsert",
        at: 1,
      },
      VALUE,
    );
    const committed = tagInputReducer(open.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toBeUndefined();
    expect(committed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 2 });
  });

  test("commitAndOpenEdit on empty-edit-removal adjusts target index left of removed", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 2,
        value: VALUE,
      },
      VALUE,
    );
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "" }, VALUE);
    const trans = tagInputReducer(
      typed.state,
      {
        type: "commitAndOpenEdit",
        index: 0,
        value: VALUE,
      },
      VALUE,
    );
    expect(trans.nextValue).toEqual(["a", "b"]);
    expect(trans.state.mode).toEqual({
      kind: "editing",
      index: 0,
      draft: "a",
      original: "a",
    });
  });

  test("commitAndOpenEdit on empty-edit-removal adjusts target index right of removed (shift -1)", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 0,
        value: VALUE,
      },
      VALUE,
    );
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "" }, VALUE);
    const trans = tagInputReducer(
      typed.state,
      {
        type: "commitAndOpenEdit",
        index: 2,
        value: VALUE,
      },
      VALUE,
    );
    expect(trans.nextValue).toEqual(["b", "c"]);
    expect(trans.state.mode).toEqual({
      kind: "editing",
      index: 1,
      draft: "c",
      original: "c",
    });
  });

  test("commitAndOpenInsert after successful insert shifts insert position right (+1)", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openInsert",
        at: 1,
        initialDraft: "X",
      },
      VALUE,
    );
    const trans = tagInputReducer(
      open.state,
      {
        type: "commitAndOpenInsert",
        at: 2,
      },
      VALUE,
    );
    expect(trans.nextValue).toEqual(["a", "X", "b", "c"]);
    expect(trans.state.mode).toEqual({ kind: "inserting", at: 3, draft: "" });
    expect(trans.state.activeSlot).toBe(6);
  });

  test("cancel from editing returns to idle with active on the chip slot", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 1,
        value: VALUE,
      },
      VALUE,
    );
    const cancelled = tagInputReducer(open.state, { type: "cancel" }, VALUE);
    expect(cancelled.nextValue).toBeUndefined();
    expect(cancelled.state).toEqual(idle(3));
  });

  test("cancel from inserting returns to idle with active on the gap", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openInsert",
        at: 1,
      },
      VALUE,
    );
    const cancelled = tagInputReducer(open.state, { type: "cancel" }, VALUE);
    expect(cancelled.state).toEqual(idle(2));
  });

  test("removeChip removes index, moves active to gap at that index", () => {
    const removed = tagInputReducer(
      initialState(VALUE),
      {
        type: "removeChip",
        index: 1,
      },
      VALUE,
    );
    expect(removed.nextValue).toEqual(["a", "c"]);
    expect(removed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 2 });
  });

  test("removeChip from a single-element value lands active on trailing input (slot 0)", () => {
    const removed = tagInputReducer(
      initialState(["a"]),
      {
        type: "removeChip",
        index: 0,
      },
      ["a"],
    );
    expect(removed.nextValue).toEqual([]);
    expect(removed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 0 });
  });

  test("setActiveSlot only changes activeSlot, leaves mode untouched", () => {
    const open = tagInputReducer(
      initialState(VALUE),
      {
        type: "openEdit",
        index: 1,
        value: VALUE,
      },
      VALUE,
    );
    const moved = tagInputReducer(open.state, { type: "setActiveSlot", slot: 0 }, VALUE);
    expect(moved.state.mode).toEqual(open.state.mode);
    expect(moved.state.activeSlot).toBe(0);
  });
});
