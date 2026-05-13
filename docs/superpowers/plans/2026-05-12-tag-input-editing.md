# TagInput Inline Editing & Mid-list Insertion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `src/lib/ui/TagInput.tsx` to support in-place chip editing and mid-list insertion via gap slots, while preserving the public API and existing append behavior.

**Architecture:** Drop `react-aria-components` `TagGroup`/`TagList`/`Tag`. Build a focus-managed list with a pure reducer for `mode` state (idle / editing / inserting) and a roving-tabindex slot model (gaps interleaved with chips, trailing input as the end-insert slot). Read the full spec at `docs/superpowers/specs/2026-05-12-tag-input-editing-design.md` before starting — it is the source of truth.

**Tech Stack:** React 19, TypeScript, CSS modules, Vitest + RTL + `@testing-library/user-event`.

**Working directory:** `/Users/cchudzicki/dev/dnd-cards/.worktrees/tag-input-edit` (already a feature worktree). Run all commands from this directory.

**File structure:**
- `src/lib/ui/TagInput.tsx` — modified: the component, slot rendering, keyboard handlers, focus management.
- `src/lib/ui/TagInput.module.css` — modified: add `.gap`, `.chipEdit`, `.trailingHidden`, `.srOnly` plus tweaks.
- `src/lib/ui/TagInput.test.tsx` — modified: 10 preserved tests stay; 31 new tests added across tasks.
- `src/lib/ui/TagInput.reducer.ts` — **created**: pure reducer + helpers + types (independently testable).
- `src/lib/ui/TagInput.reducer.test.ts` — **created**: reducer unit tests.

---

## Task 1: Pure reducer + helpers

**Files:**
- Create: `src/lib/ui/TagInput.reducer.ts`
- Create: `src/lib/ui/TagInput.reducer.test.ts`

The reducer owns transitions for `mode` and `activeSlot`. The component owns `value` (controlled prop). Each reducer call returns `{ state, nextValue? }`; the component applies `nextValue` via `onChange`.

Why a separate file: the state machine has many branches (commit semantics, index adjustment after commit) that are awkward to test through the component. A pure reducer unit-tests cleanly.

- [ ] **Step 1: Create the reducer file**

Create `src/lib/ui/TagInput.reducer.ts`:

```ts
export type Mode =
  | { readonly kind: "idle" }
  | {
      readonly kind: "editing";
      readonly index: number;
      readonly draft: string;
      readonly original: string;
    }
  | { readonly kind: "inserting"; readonly at: number; readonly draft: string };

export type State = {
  readonly mode: Mode;
  readonly activeSlot: number;
};

export type Action =
  | { readonly type: "openEdit"; readonly index: number; readonly value: readonly string[] }
  | { readonly type: "openInsert"; readonly at: number; readonly initialDraft?: string }
  | { readonly type: "updateDraft"; readonly draft: string }
  | { readonly type: "commit" }
  | {
      readonly type: "commitAndOpenEdit";
      readonly index: number;
      readonly value: readonly string[];
    }
  | {
      readonly type: "commitAndOpenInsert";
      readonly at: number;
      readonly initialDraft?: string;
    }
  | { readonly type: "cancel" }
  | { readonly type: "removeChip"; readonly index: number }
  | { readonly type: "setActiveSlot"; readonly slot: number };

export type Result = {
  readonly state: State;
  readonly nextValue?: string[];
};

export function initialState(value: readonly string[]): State {
  return { mode: { kind: "idle" }, activeSlot: value.length * 2 };
}

export function normalizeDraft(draft: string): string {
  return draft.replace(/[\n\r]/g, " ").trim();
}

type CommitOutcome =
  | { kind: "noop"; activeSlot: number }
  | { kind: "update"; value: string[]; activeSlot: number }
  | { kind: "remove"; value: string[]; removedIndex: number; activeSlot: number }
  | { kind: "insert"; value: string[]; insertedAt: number; activeSlot: number };

function applyCommit(mode: Mode, value: readonly string[]): CommitOutcome {
  if (mode.kind === "idle") {
    return { kind: "noop", activeSlot: value.length * 2 };
  }
  const normalized = normalizeDraft(mode.draft);
  if (mode.kind === "editing") {
    if (normalized === "") {
      const next = [...value.slice(0, mode.index), ...value.slice(mode.index + 1)];
      return {
        kind: "remove",
        value: next,
        removedIndex: mode.index,
        activeSlot: next.length === 0 ? 0 : mode.index * 2,
      };
    }
    if (normalized === value[mode.index]) {
      return { kind: "noop", activeSlot: mode.index * 2 + 1 };
    }
    const next = [...value];
    next[mode.index] = normalized;
    return { kind: "update", value: next, activeSlot: mode.index * 2 + 1 };
  }
  if (normalized === "") {
    return { kind: "noop", activeSlot: mode.at * 2 };
  }
  const next = [...value.slice(0, mode.at), normalized, ...value.slice(mode.at)];
  return {
    kind: "insert",
    value: next,
    insertedAt: mode.at,
    activeSlot: mode.at * 2 + 2,
  };
}

function adjustIndex(target: number, outcome: CommitOutcome): number {
  if (outcome.kind === "remove") {
    return target > outcome.removedIndex ? target - 1 : target;
  }
  if (outcome.kind === "insert") {
    return target >= outcome.insertedAt ? target + 1 : target;
  }
  return target;
}

export function tagInputReducer(
  state: State,
  action: Action,
  value: readonly string[],
): Result {
  switch (action.type) {
    case "openEdit": {
      const v = action.value;
      const original = v[action.index] ?? "";
      return {
        state: {
          mode: {
            kind: "editing",
            index: action.index,
            draft: original,
            original,
          },
          activeSlot: action.index * 2 + 1,
        },
      };
    }
    case "openInsert": {
      const draft = action.initialDraft ?? "";
      return {
        state: {
          mode: { kind: "inserting", at: action.at, draft },
          activeSlot: action.at * 2,
        },
      };
    }
    case "updateDraft": {
      if (state.mode.kind === "editing") {
        return {
          state: { ...state, mode: { ...state.mode, draft: action.draft } },
        };
      }
      if (state.mode.kind === "inserting") {
        return {
          state: { ...state, mode: { ...state.mode, draft: action.draft } },
        };
      }
      return { state };
    }
    case "commit": {
      const outcome = applyCommit(state.mode, value);
      const nextState: State = {
        mode: { kind: "idle" },
        activeSlot: outcome.activeSlot,
      };
      return outcome.kind === "noop"
        ? { state: nextState }
        : { state: nextState, nextValue: outcome.value };
    }
    case "commitAndOpenEdit": {
      const outcome = applyCommit(state.mode, value);
      const postValue = outcome.kind === "noop" ? action.value : outcome.value;
      const targetIndex = adjustIndex(action.index, outcome);
      if (targetIndex < 0 || targetIndex >= postValue.length) {
        const nextState: State = {
          mode: { kind: "idle" },
          activeSlot: outcome.activeSlot,
        };
        return outcome.kind === "noop"
          ? { state: nextState }
          : { state: nextState, nextValue: outcome.value };
      }
      const original = postValue[targetIndex] ?? "";
      const nextState: State = {
        mode: {
          kind: "editing",
          index: targetIndex,
          draft: original,
          original,
        },
        activeSlot: targetIndex * 2 + 1,
      };
      return outcome.kind === "noop"
        ? { state: nextState }
        : { state: nextState, nextValue: outcome.value };
    }
    case "commitAndOpenInsert": {
      const outcome = applyCommit(state.mode, value);
      const targetAt = adjustIndex(action.at, outcome);
      const draft = action.initialDraft ?? "";
      const nextState: State = {
        mode: { kind: "inserting", at: targetAt, draft },
        activeSlot: targetAt * 2,
      };
      return outcome.kind === "noop"
        ? { state: nextState }
        : { state: nextState, nextValue: outcome.value };
    }
    case "cancel": {
      if (state.mode.kind === "editing") {
        return {
          state: {
            mode: { kind: "idle" },
            activeSlot: state.mode.index * 2 + 1,
          },
        };
      }
      if (state.mode.kind === "inserting") {
        return {
          state: {
            mode: { kind: "idle" },
            activeSlot: state.mode.at * 2,
          },
        };
      }
      return { state };
    }
    case "removeChip": {
      const v = [...value.slice(0, action.index), ...value.slice(action.index + 1)];
      return {
        state: {
          mode: { kind: "idle" },
          activeSlot: v.length === 0 ? 0 : action.index * 2,
        },
        nextValue: v,
      };
    }
    case "setActiveSlot": {
      return { state: { ...state, activeSlot: action.slot } };
    }
  }
}
```

- [ ] **Step 2: Write reducer unit tests (and confirm they fail before the file is exported)**

Create `src/lib/ui/TagInput.reducer.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  type State,
  initialState,
  normalizeDraft,
  tagInputReducer,
} from "./TagInput.reducer";

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
    const { state } = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 1,
      value: VALUE,
    }, VALUE);
    expect(state.mode).toEqual({
      kind: "editing",
      index: 1,
      draft: "b",
      original: "b",
    });
    expect(state.activeSlot).toBe(3);
  });

  test("openInsert enters inserting at the gap with initialDraft", () => {
    const { state } = tagInputReducer(initialState(VALUE), {
      type: "openInsert",
      at: 2,
      initialDraft: "x",
    }, VALUE);
    expect(state.mode).toEqual({ kind: "inserting", at: 2, draft: "x" });
    expect(state.activeSlot).toBe(4);
  });

  test("updateDraft mutates editing.draft", () => {
    let result = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 0,
      value: VALUE,
    }, VALUE);
    result = tagInputReducer(result.state, { type: "updateDraft", draft: "A" }, VALUE);
    expect(result.state.mode).toEqual({
      kind: "editing",
      index: 0,
      draft: "A",
      original: "a",
    });
  });

  test("commit on non-empty edit updates value", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 1,
      value: VALUE,
    }, VALUE);
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "B" }, VALUE);
    const committed = tagInputReducer(typed.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["a", "B", "c"]);
    expect(committed.state).toEqual(idle(3));
  });

  test("commit on empty edit removes the chip and points active to the gap", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 1,
      value: VALUE,
    }, VALUE);
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "" }, VALUE);
    const committed = tagInputReducer(typed.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["a", "c"]);
    expect(committed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 2 });
  });

  test("commit on whitespace-only edit removes the chip", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 0,
      value: VALUE,
    }, VALUE);
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "   " }, VALUE);
    const committed = tagInputReducer(typed.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["b", "c"]);
  });

  test("commit on no-change edit is a noop with nextValue undefined", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 0,
      value: VALUE,
    }, VALUE);
    const committed = tagInputReducer(open.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toBeUndefined();
    expect(committed.state).toEqual(idle(1));
  });

  test("commit on non-empty insert places value at index and advances active", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openInsert",
      at: 1,
      initialDraft: "X",
    }, VALUE);
    const committed = tagInputReducer(open.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toEqual(["a", "X", "b", "c"]);
    expect(committed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 4 });
  });

  test("commit on empty insert is a noop", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openInsert",
      at: 1,
    }, VALUE);
    const committed = tagInputReducer(open.state, { type: "commit" }, VALUE);
    expect(committed.nextValue).toBeUndefined();
    expect(committed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 2 });
  });

  test("commitAndOpenEdit on empty-edit-removal adjusts target index left of removed", () => {
    // edit chip 2 (c), clear, click chip 0 (a). a still at index 0.
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 2,
      value: VALUE,
    }, VALUE);
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "" }, VALUE);
    const trans = tagInputReducer(typed.state, {
      type: "commitAndOpenEdit",
      index: 0,
      value: VALUE,
    }, VALUE);
    expect(trans.nextValue).toEqual(["a", "b"]);
    expect(trans.state.mode).toEqual({
      kind: "editing",
      index: 0,
      draft: "a",
      original: "a",
    });
  });

  test("commitAndOpenEdit on empty-edit-removal adjusts target index right of removed (shift -1)", () => {
    // edit chip 0 (a), clear, click chip 2 (c). c now at index 1.
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 0,
      value: VALUE,
    }, VALUE);
    const typed = tagInputReducer(open.state, { type: "updateDraft", draft: "" }, VALUE);
    const trans = tagInputReducer(typed.state, {
      type: "commitAndOpenEdit",
      index: 2,
      value: VALUE,
    }, VALUE);
    expect(trans.nextValue).toEqual(["b", "c"]);
    expect(trans.state.mode).toEqual({
      kind: "editing",
      index: 1,
      draft: "c",
      original: "c",
    });
  });

  test("commitAndOpenInsert after successful insert shifts insert position right (+1)", () => {
    // insert "X" at 1, then click gap 2; gap 2 should become gap 3.
    const open = tagInputReducer(initialState(VALUE), {
      type: "openInsert",
      at: 1,
      initialDraft: "X",
    }, VALUE);
    const trans = tagInputReducer(open.state, {
      type: "commitAndOpenInsert",
      at: 2,
    }, VALUE);
    expect(trans.nextValue).toEqual(["a", "X", "b", "c"]);
    expect(trans.state.mode).toEqual({ kind: "inserting", at: 3, draft: "" });
    expect(trans.state.activeSlot).toBe(6);
  });

  test("cancel from editing returns to idle with active on the chip slot", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 1,
      value: VALUE,
    }, VALUE);
    const cancelled = tagInputReducer(open.state, { type: "cancel" }, VALUE);
    expect(cancelled.nextValue).toBeUndefined();
    expect(cancelled.state).toEqual(idle(3));
  });

  test("cancel from inserting returns to idle with active on the gap", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openInsert",
      at: 1,
    }, VALUE);
    const cancelled = tagInputReducer(open.state, { type: "cancel" }, VALUE);
    expect(cancelled.state).toEqual(idle(2));
  });

  test("removeChip removes index, moves active to gap at that index", () => {
    const removed = tagInputReducer(initialState(VALUE), {
      type: "removeChip",
      index: 1,
    }, VALUE);
    expect(removed.nextValue).toEqual(["a", "c"]);
    expect(removed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 2 });
  });

  test("removeChip from a single-element value lands active on trailing input (slot 0)", () => {
    const removed = tagInputReducer(initialState(["a"]), {
      type: "removeChip",
      index: 0,
    }, ["a"]);
    expect(removed.nextValue).toEqual([]);
    expect(removed.state).toEqual({ mode: { kind: "idle" }, activeSlot: 0 });
  });

  test("setActiveSlot only changes activeSlot, leaves mode untouched", () => {
    const open = tagInputReducer(initialState(VALUE), {
      type: "openEdit",
      index: 1,
      value: VALUE,
    }, VALUE);
    const moved = tagInputReducer(open.state, { type: "setActiveSlot", slot: 0 }, VALUE);
    expect(moved.state.mode).toEqual(open.state.mode);
    expect(moved.state.activeSlot).toBe(0);
  });
});
```

- [ ] **Step 3: Run the reducer tests**

Run: `npm test -- src/lib/ui/TagInput.reducer.test.ts`

Expected: All ~16 tests pass.

- [ ] **Step 4: Run the typecheck**

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/TagInput.reducer.ts src/lib/ui/TagInput.reducer.test.ts
git commit -m "feat(TagInput): add pure reducer for edit/insert state machine"
```

---

## Task 2: Slot-based component skeleton (preserve baseline + add gap insertion)

**Files:**
- Modify: `src/lib/ui/TagInput.tsx` (complete rewrite of the file, keep same public API)
- Modify: `src/lib/ui/TagInput.module.css`
- Modify: `src/lib/ui/TagInput.test.tsx` (no test deletions; this task does not add new tests yet — Task 3 onward does)

Goal: replace `TagGroup`/`Tag`/`TagList` with the slot model. Render gaps + chips + trailing input. Wire chip × removal, gap clicks → insert input (single insert at a time), trailing input append. Keep all 10 existing tests green. No chip editing yet — that's Task 3.

- [ ] **Step 1: Rewrite TagInput.tsx**

Replace the entire contents of `src/lib/ui/TagInput.tsx` with:

```tsx
import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  type Action,
  type State,
  initialState,
  tagInputReducer,
} from "./TagInput.reducer";
import styles from "./TagInput.module.css";

export type TagInputProps = {
  id?: string;
  className?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

export function TagInput({
  id,
  className,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: TagInputProps) {
  const [state, dispatchRaw] = useReducer(
    (s: State, a: Action) => tagInputReducer(s, a, value).state,
    value,
    initialState,
  );

  const trailingInputRef = useRef<HTMLInputElement | null>(null);
  const [trailingDraft, setTrailingDraft] = useState("");

  const dispatch = useCallback(
    (action: Action) => {
      const result = tagInputReducer(state, action, value);
      if (result.nextValue !== undefined) {
        onChange(result.nextValue);
      }
      dispatchRaw(action);
    },
    [state, value, onChange],
  );

  const commitTrailing = useCallback(() => {
    const trimmed = trailingDraft.replace(/[\n\r]/g, " ").trim();
    if (trimmed === "") return;
    onChange([...value, trimmed]);
    setTrailingDraft("");
  }, [trailingDraft, value, onChange]);

  const inserting =
    state.mode.kind === "inserting" ? state.mode : null;

  const handleInsertChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: "updateDraft", draft: e.target.value });
  };

  const handleInsertKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      dispatch({ type: "commit" });
    } else if (e.key === "Escape") {
      e.stopPropagation();
      dispatch({ type: "cancel" });
    }
  };

  const handleInsertBlur = () => {
    dispatch({ type: "commit" });
  };

  const handleTrailingKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTrailing();
    } else if (e.key === "Backspace" && trailingDraft === "" && value.length > 0) {
      e.preventDefault();
      dispatch({ type: "removeChip", index: value.length - 1 });
    }
  };

  const handleTrailingBlur = () => {
    commitTrailing();
  };

  const handleGapPointerDown = (at: number) => (e: PointerEvent) => {
    e.preventDefault();
    commitTrailing();
    dispatch({ type: "commitAndOpenInsert", at });
  };

  const handleRemoveClick = (index: number) => () => {
    dispatch({ type: "removeChip", index });
  };

  const isInsertingAt = (at: number): boolean =>
    inserting !== null && inserting.at === at;

  return (
    <div
      className={[styles.wrapper, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabelledBy ? undefined : ariaLabel ?? "Tags"}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    >
      <ul role="list" className={styles.list}>
        {value.flatMap((label, i) => {
          const slotChildren = [
            <li
              key={`gap-${i}`}
              role="presentation"
              className={styles.gap}
              aria-hidden={!isInsertingAt(i)}
            >
              {isInsertingAt(i) ? (
                <input
                  className={styles.chipEdit}
                  // biome-ignore lint/a11y/noAutofocus: explicit focus is required when the gap input mounts
                  autoFocus
                  value={inserting?.draft ?? ""}
                  onChange={handleInsertChange}
                  onKeyDown={handleInsertKeyDown}
                  onBlur={handleInsertBlur}
                  aria-label={
                    i === 0 ? "Insert tag at start" : `Insert tag before ${value[i]}`
                  }
                />
              ) : (
                <button
                  type="button"
                  className={styles.gapButton}
                  tabIndex={-1}
                  aria-label={
                    i === 0 ? "Insert tag at start" : `Insert tag before ${value[i]}`
                  }
                  onPointerDown={handleGapPointerDown(i)}
                />
              )}
            </li>,
            <li key={`chip-${i}`} role="listitem" className={styles.tag}>
              <span className={styles.tagText}>{label}</span>
              <button
                type="button"
                slot="remove"
                tabIndex={-1}
                aria-label={`Remove ${label}`}
                className={styles.remove}
                onClick={handleRemoveClick(i)}
              >
                ×
              </button>
            </li>,
          ];
          return slotChildren;
        })}
      </ul>
      <input
        ref={trailingInputRef}
        id={id}
        type="text"
        aria-label={ariaLabelledBy ? undefined : ariaLabel ?? "Tags"}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={[styles.input, inserting !== null ? styles.trailingHidden : ""]
          .filter(Boolean)
          .join(" ")}
        value={trailingDraft}
        onChange={(e) => setTrailingDraft(e.target.value)}
        onKeyDown={handleTrailingKeyDown}
        onBlur={handleTrailingBlur}
        placeholder={value.length === 0 ? placeholder : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update CSS**

Replace the contents of `src/lib/ui/TagInput.module.css` with:

```css
.wrapper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  min-height: calc(var(--fs-md) + var(--space-2) * 2 + 2px);
}

.wrapper:focus-within {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.list {
  display: contents;
  list-style: none;
  margin: 0;
  padding: 0;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  font: inherit;
  font-size: var(--fs-sm);
  line-height: 1.6;
  outline: none;
  cursor: text;
}

.tag[data-focused] {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.tagText {
  white-space: nowrap;
}

.remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2em;
  height: 1.2em;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  cursor: pointer;
}

.remove:hover {
  color: var(--color-text);
  background: var(--color-surface);
}

.remove:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.gap {
  display: inline-flex;
  align-items: stretch;
  position: relative;
  width: 0;
}

.gapButton {
  position: absolute;
  inset-block: -2px;
  inset-inline: -4px;
  width: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: text;
}

@media (pointer: coarse) {
  .gapButton {
    inset-inline: -6px;
    width: 12px;
  }
}

.gapButton:hover::before,
.gapButton:focus-visible::before {
  content: "";
  position: absolute;
  inset-block: 0;
  left: 50%;
  width: 1px;
  background: var(--color-focus-ring);
  transform: translateX(-0.5px);
}

.gapButton:focus-visible {
  outline: none;
}

.input,
.chipEdit {
  flex: 1;
  min-width: 8ch;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-family: var(--font-body);
  font-size: var(--fs-md);
}

.chipEdit {
  width: 8ch;
  flex: 0 0 auto;
  field-sizing: content;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  font-size: var(--fs-sm);
  line-height: 1.6;
}

.trailingHidden {
  visibility: hidden;
  pointer-events: none;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 3: Run the existing tests and confirm they still pass**

Run: `npm test -- src/lib/ui/TagInput.test.tsx`

Expected: All 10 existing tests pass. If "clicking the per-tag remove button" or "Backspace on empty input removes the last chip" fail, the cause is most likely (a) the × button's `aria-label` not matching or (b) the trailing input not handling the Backspace path. Verify the test selectors match the new DOM.

- [ ] **Step 4: Run the typecheck**

Run: `npx tsc --noEmit`

Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/TagInput.tsx src/lib/ui/TagInput.module.css
git commit -m "refactor(TagInput): replace TagGroup with slot model, retain baseline behavior"
```

---

## Task 3: Click-chip-to-edit + edit semantics

**Files:**
- Modify: `src/lib/ui/TagInput.tsx`
- Modify: `src/lib/ui/TagInput.test.tsx`

Goal: click on a chip enters edit mode; Enter commits, Escape reverts, blur commits, empty/whitespace removes, × wins, chip↔chip / chip↔gap transitions commit-before-open, paste collapses newlines, all commits trim. Adds tests 1–11.

- [ ] **Step 1: Write test "Click chip enters edit mode with text pre-filled and selected"**

Add to `src/lib/ui/TagInput.test.tsx` (after the existing describe block; add new tests inside the same `describe("<TagInput>")` if you prefer):

```tsx
  test("clicking a chip enters edit mode with text pre-filled and selected", async () => {
    render(<Harness initial={["fire"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("fire");
    // selection: simulate typing to verify selection-all replaces the value
    await userEvent.keyboard("ice");
    expect(input).toHaveValue("ice");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/lib/ui/TagInput.test.tsx -t "clicking a chip enters edit mode"`

Expected: FAIL — chip click does nothing yet.

- [ ] **Step 3: Wire chip click → edit mode in TagInput.tsx**

Modify `src/lib/ui/TagInput.tsx`:

Add a handler near `handleGapPointerDown`:

```tsx
  const handleChipPointerDown = (index: number) => (e: PointerEvent) => {
    // Only intercept on the chip-view; if the user clicks the × button, that
    // button's own onClick handles removal and we don't want to also open edit.
    if ((e.target as HTMLElement).closest("button[aria-label^='Remove']")) return;
    e.preventDefault();
    commitTrailing();
    dispatch({ type: "commitAndOpenEdit", index, value });
  };
```

In the chip `<li>` JSX, replace the contents based on whether this chip is the one being edited. Replace the existing chip `<li>` block (the second element of `slotChildren`) with:

```tsx
            state.mode.kind === "editing" && state.mode.index === i ? (
              <li key={`chip-${i}`} role="listitem" className={styles.tag}>
                <input
                  className={styles.chipEdit}
                  // biome-ignore lint/a11y/noAutofocus: edit input must focus on open
                  autoFocus
                  value={state.mode.draft}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    dispatch({ type: "updateDraft", draft: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      dispatch({ type: "commit" });
                    } else if (e.key === "Escape") {
                      e.stopPropagation();
                      dispatch({ type: "cancel" });
                    }
                  }}
                  onBlur={() => dispatch({ type: "commit" })}
                  aria-label={`Edit tag '${state.mode.original}'`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Remove ${state.mode.original}`}
                  className={styles.remove}
                  onPointerDown={(e) => {
                    // × must win over commit: prevent blur-commit by handling on pointerdown.
                    e.preventDefault();
                    if (state.mode.kind === "editing") {
                      dispatch({ type: "removeChip", index: state.mode.index });
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ) : (
              <li
                key={`chip-${i}`}
                role="listitem"
                className={styles.tag}
                onPointerDown={handleChipPointerDown(i)}
              >
                <span className={styles.tagText}>{label}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Remove ${label}`}
                  className={styles.remove}
                  onClick={handleRemoveClick(i)}
                >
                  ×
                </button>
              </li>
            ),
```

(The exact placement is: in the `value.flatMap` callback, the second member of `slotChildren` becomes a ternary on `state.mode.kind === "editing" && state.mode.index === i`.)

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm test -- src/lib/ui/TagInput.test.tsx -t "clicking a chip enters edit mode"`

Expected: PASS.

- [ ] **Step 5: Write test "Edit + Enter commits the new value at the same index"**

```tsx
  test("editing + Enter commits the new value at the same index", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["fire", "ice"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("lightning|ice");
  });
```

(Note: `<output>` exposes `role="status"`.)

- [ ] **Step 6: Run and confirm pass (already wired in step 3)**

Run: `npm test -- src/lib/ui/TagInput.test.tsx -t "Enter commits the new value at the same index"`

Expected: PASS.

- [ ] **Step 7: Write test "Edit + Escape reverts AND does not bubble"**

```tsx
  test("edit + Escape reverts and does not bubble", async () => {
    const onOuterKey = vi.fn();
    render(
      <div onKeyDown={onOuterKey}>
        <Harness initial={["fire"]} />
      </div>,
    );
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "ice");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    // sanity: outer handler fires for a non-Escape key
    onOuterKey.mockClear();
    await userEvent.click(screen.getByText("fire"));
    await userEvent.keyboard("a");
    expect(onOuterKey).toHaveBeenCalled();
    // and is NOT called for Escape
    onOuterKey.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOuterKey).not.toHaveBeenCalled();
  });
```

Add `vi` to the imports at the top of `TagInput.test.tsx`: `import { describe, expect, test, vi } from "vitest";`.

- [ ] **Step 8: Run and confirm pass**

Run: `npm test -- src/lib/ui/TagInput.test.tsx -t "edit + Escape reverts and does not bubble"`

Expected: PASS (Escape stopPropagation is already wired in step 3 inside the edit `onKeyDown`).

- [ ] **Step 9: Write test "Empty edit commit removes the chip; focus on gap"**

```tsx
  test("empty edit commit removes the chip and focuses the gap at that index", async () => {
    render(<Harness initial={["fire", "ice", "wind"]} />);
    await userEvent.click(screen.getByText("ice"));
    const input = screen.getByRole("textbox", { name: /edit tag 'ice'/i });
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    // The gap that hosted the removed chip is now "before wind".
    expect(screen.getByRole("button", { name: /insert tag before wind/i })).toHaveFocus();
  });
```

- [ ] **Step 10: Run and confirm fail, then wire focus management**

Run the test. It will likely fail because focus management hasn't been wired yet. Add this `useLayoutEffect` to TagInput.tsx (imports add `useLayoutEffect`):

```tsx
  const isFirstRender = useRef(true);

  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    // Skip-restore: if the user has actively moved focus to a different element
    // outside the wrapper, don't yank them back. `body` means the previously
    // focused element was unmounted (e.g., the edit input we were editing was
    // just removed), which IS a case where we want to restore focus to the
    // computed active slot.
    const active = document.activeElement;
    if (active && active !== document.body && !wrapper.contains(active)) return;
    const slots = wrapper.querySelectorAll<HTMLElement>("[data-slot]");
    const target = Array.from(slots).find(
      (el) => Number(el.dataset.slotIndex) === state.activeSlot,
    );
    target?.focus();
    // biome-ignore lint/correctness/useExhaustiveDependencies: focus follows activeSlot + mode + value.length
  }, [state.activeSlot, state.mode.kind, value.length]);
```

Add a `wrapperRef`:

```tsx
  const wrapperRef = useRef<HTMLDivElement | null>(null);
```

Attach `ref={wrapperRef}` to the root `<div>`. Tag every focusable slot element with `data-slot data-slot-index={...}`:

- gap button: `data-slot data-slot-index={i * 2}`
- chip `<li>` when not editing: `data-slot data-slot-index={i * 2 + 1}` (also give it `tabIndex={state.activeSlot === i * 2 + 1 ? 0 : -1}`)
- chip-edit input: `data-slot data-slot-index={i * 2 + 1}` (real focus owned by the input)
- gap-insert input: `data-slot data-slot-index={i * 2}` (real focus on the input)
- trailing input: `data-slot data-slot-index={value.length * 2}` plus `tabIndex={state.activeSlot === value.length * 2 ? 0 : -1}`

Re-run the test. Expected: PASS.

- [ ] **Step 11: Write test "Whitespace-only edit commit also removes"**

```tsx
  test("whitespace-only edit commit removes the chip", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "   {Enter}");
    expect(screen.queryByText("fire")).not.toBeInTheDocument();
  });
```

Run: PASS (reducer already handles this).

- [ ] **Step 12: Write test "Edit + outside-blur commits AND does not restore focus"**

```tsx
  test("edit + blur to outside the wrapper commits and does not restore focus", async () => {
    render(
      <>
        <Harness initial={["fire"]} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning");
    const outsideBtn = screen.getByRole("button", { name: "elsewhere" });
    await userEvent.click(outsideBtn);
    expect(screen.getByText("lightning")).toBeInTheDocument();
    expect(outsideBtn).toHaveFocus();
  });
```

- [ ] **Step 13: Run the outside-blur test**

The corrected `useLayoutEffect` from step 10 already gates on `active !== document.body && !wrapper.contains(active)`. When the user clicks the "elsewhere" button, `document.activeElement` becomes that button, which is outside the wrapper and not body → the effect returns early and focus stays put. Run: PASS.

- [ ] **Step 14: Write test "× on edit-mode chip removes, focus on gap"**

```tsx
  test("× on a chip in edit mode removes without committing edit text and focuses the gap", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning");
    // The × inside the editing chip's <li> still has the original label.
    await userEvent.click(screen.getByRole("button", { name: /remove fire/i }));
    expect(screen.queryByText("fire")).not.toBeInTheDocument();
    expect(screen.queryByText("lightning")).not.toBeInTheDocument();
    // Focus lands on the gap slot at the deleted index (now "before ice").
    expect(screen.getByRole("button", { name: /insert tag before ice/i })).toHaveFocus();
  });
```

Run: PASS (× pointerdown short-circuits blur-commit; wired in step 3).

- [ ] **Step 15: Write test "Chip→chip transition commits then opens"**

```tsx
  test("clicking another chip while editing commits then opens edit on the new chip", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning");
    await userEvent.click(screen.getByText("ice"));
    expect(screen.getByText("lightning")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /edit tag 'ice'/i })).toHaveFocus();
  });
```

Run: PASS (chip pointerdown dispatches `commitAndOpenEdit`).

- [ ] **Step 16: Write test "Gap→edit-in-progress transition commits then opens insert"**

```tsx
  test("clicking a gap while editing commits the edit then opens insert at that gap", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const editInput = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "lightning");
    await userEvent.click(screen.getByRole("button", { name: /insert tag before ice/i }));
    expect(screen.getByText("lightning")).toBeInTheDocument();
    // The insert input replaces the gap button at "Insert tag before ice".
    expect(screen.getByRole("textbox", { name: /insert tag before ice/i })).toHaveFocus();
  });
```

Run: should PASS. If failure is due to the gap input not appearing, check that the gap rendering branch in Task 2 step 1 still works when `inserting !== null`.

- [ ] **Step 17: Write test "Paste 'a\\nb' collapses to one chip"**

```tsx
  test("pasting 'a\\nb' into an edit and committing yields a single chip 'a b'", async () => {
    render(<Harness initial={["x"]} />);
    await userEvent.click(screen.getByText("x"));
    const input = screen.getByRole("textbox", { name: /edit tag 'x'/i });
    await userEvent.clear(input);
    input.focus();
    await userEvent.paste("a\nb");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("a b")).toBeInTheDocument();
    expect(screen.queryByText("a\nb")).not.toBeInTheDocument();
  });
```

Run: PASS (normalizeDraft collapses + trims).

- [ ] **Step 18: Write test "Non-empty edit commit is trimmed"**

```tsx
  test("non-empty edit commit is trimmed", async () => {
    render(<Harness initial={["x"]} />);
    await userEvent.click(screen.getByText("x"));
    const input = screen.getByRole("textbox", { name: /edit tag 'x'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "   trimmed   {Enter}");
    expect(screen.getByText("trimmed")).toBeInTheDocument();
  });
```

Run: PASS.

- [ ] **Step 19: Run all TagInput tests; confirm all 10 baseline + new tests pass**

Run: `npm test -- src/lib/ui/TagInput.test.tsx`

Expected: All tests pass (originally 10 + this task's additions).

- [ ] **Step 20: Commit**

```bash
git add src/lib/ui/TagInput.tsx src/lib/ui/TagInput.test.tsx
git commit -m "feat(TagInput): click-to-edit chips with Enter/Escape/blur semantics"
```

---

## Task 4: Keyboard navigation + roving tabindex

**Files:**
- Modify: `src/lib/ui/TagInput.tsx`
- Modify: `src/lib/ui/TagInput.test.tsx`

Goal: Tab into the list lands on active slot; ←/→ navigate between slots with no wrap; Enter / F2 on focused chip enters edit; Delete / Backspace on focused chip removes; Enter or printable key on focused gap opens insert. Roving tabindex invariant: exactly one slot has `tabindex=0`. Adds tests 17–27.

- [ ] **Step 1: Add the wrapper key handler**

In `TagInput.tsx`, add a key-handler attached to the root `<div>`:

```tsx
  const totalSlots = value.length * 2 + 1; // gaps (value.length) + chips (value.length) + trailing

  const handleWrapperKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Don't intercept when the focus is inside an edit / insert input.
    if (state.mode.kind !== "idle") return;
    const active = state.activeSlot;
    if (e.key === "ArrowRight") {
      if (active < totalSlots - 1) {
        e.preventDefault();
        dispatch({ type: "setActiveSlot", slot: active + 1 });
      }
    } else if (e.key === "ArrowLeft") {
      if (active > 0) {
        e.preventDefault();
        dispatch({ type: "setActiveSlot", slot: active - 1 });
      }
    }
  };
```

Attach `onKeyDown={handleWrapperKeyDown}` to the root `<div>`.

- [ ] **Step 2: Write test "Arrow Left/Right traverses gap → chip → gap → trailing"**

```tsx
  test("arrow keys traverse slots in order: gap → chip → gap → trailing", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag at end|footer tags/i }))
      .not.toHaveFocus(); // moved off trailing
    // After 1 ArrowLeft from slot 4 (trailing): slot 3 = chip ice.
    expect(screen.getAllByRole("listitem")[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    // slot 2 = gap before ice
    expect(screen.getByRole("button", { name: /insert tag before ice/i })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    // slot 1 = chip fire
    expect(screen.getAllByRole("listitem")[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    // slot 0 = gap at start
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    // edge: no wrap, still at slot 0
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
  });
```

- [ ] **Step 3: Make chips focusable as `<li>` with managed tabIndex**

Update the chip `<li>` (non-editing branch) in `TagInput.tsx`:

```tsx
              <li
                key={`chip-${i}`}
                role="listitem"
                className={styles.tag}
                data-slot
                data-slot-index={i * 2 + 1}
                tabIndex={state.activeSlot === i * 2 + 1 ? 0 : -1}
                aria-label={`Tag: ${label}`}
                aria-keyshortcuts="Enter Delete"
                onPointerDown={handleChipPointerDown(i)}
                onKeyDown={(e) => handleChipKeyDown(e, i, label)}
              >
                <span className={styles.tagText}>{label}</span>
                <button ...>×</button>
              </li>
```

(Keep the inner × button unchanged.)

Add `handleChipKeyDown`:

```tsx
  const handleChipKeyDown = (
    e: KeyboardEvent<HTMLLIElement>,
    index: number,
    _label: string,
  ) => {
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      dispatch({ type: "openEdit", index, value });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      dispatch({ type: "removeChip", index });
    }
  };
```

Run the arrow-key test: it should now PASS once chips are focusable.

- [ ] **Step 4: Write test "Tab into list lands on trailing input"**

```tsx
  test("tabbing into the list lands on the trailing input by default", async () => {
    render(
      <>
        <button type="button">before</button>
        <Harness initial={["fire"]} />
      </>,
    );
    screen.getByRole("button", { name: "before" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("textbox", { name: /footer tags/i })).toHaveFocus();
  });
```

Make the gap buttons and trailing input also use roving tabindex. Update the gap `<button>` (non-inserting branch):

```tsx
                <button
                  type="button"
                  className={styles.gapButton}
                  data-slot
                  data-slot-index={i * 2}
                  tabIndex={state.activeSlot === i * 2 ? 0 : -1}
                  aria-label={
                    i === 0 ? "Insert tag at start" : `Insert tag before ${value[i]}`
                  }
                  onPointerDown={handleGapPointerDown(i)}
                  onKeyDown={(e) => handleGapKeyDown(e, i)}
                />
```

Update the trailing `<input>`:

```tsx
      <input
        ref={trailingInputRef}
        id={id}
        type="text"
        data-slot
        data-slot-index={value.length * 2}
        tabIndex={state.activeSlot === value.length * 2 ? 0 : -1}
        ...
      />
```

Add `handleGapKeyDown`:

```tsx
  const handleGapKeyDown = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      dispatch({ type: "openInsert", at });
      return;
    }
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      dispatch({ type: "openInsert", at, initialDraft: e.key });
    }
  };
```

Run all keyboard tests: arrow nav + tab-lands-on-trailing should PASS.

- [ ] **Step 5: Write test "Edge arrows stay put"**

```tsx
  test("Arrow Right from trailing goes nowhere; Arrow Left from leading gap goes nowhere", async () => {
    render(<Harness initial={["a"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(trailing).toHaveFocus();
    // Move all the way left
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
  });
```

Run: PASS (wrapper handler clamps to bounds).

- [ ] **Step 6: Write test "Enter on focused chip enters edit"**

```tsx
  test("Enter on a focused chip enters edit mode", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}"); // to chip
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: /edit tag 'fire'/i })).toHaveFocus();
  });
```

Run: PASS.

- [ ] **Step 7: Write test "Enter on focused gap opens insert with empty draft"**

```tsx
  test("Enter on a focused gap opens insert with empty draft", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}"); // chip then gap-at-start
    await userEvent.keyboard("{Enter}");
    const insertInput = screen.getByRole("textbox", { name: /insert tag at start/i });
    expect(insertInput).toHaveFocus();
    expect(insertInput).toHaveValue("");
  });
```

Run: PASS.

- [ ] **Step 8: Write test "Printable key on focused gap opens insert with that char"**

```tsx
  test("printable key on focused gap opens insert with that key as initial draft", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}"); // gap at start
    await userEvent.keyboard("x");
    const insertInput = screen.getByRole("textbox", { name: /insert tag at start/i });
    expect(insertInput).toHaveValue("x");
    expect(insertInput).toHaveFocus();
  });
```

Run: PASS.

- [ ] **Step 9: Write test "Shift+letter produces capital"**

```tsx
  test("Shift+letter on focused gap opens insert with capital letter", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await userEvent.keyboard("X");
    const insertInput = screen.getByRole("textbox", { name: /insert tag at start/i });
    expect(insertInput).toHaveValue("X");
  });
```

Run: PASS.

- [ ] **Step 10: Write test "Delete + Backspace on focused chip both remove"**

```tsx
  test("Delete on focused chip removes it; Backspace also removes", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}"); // chip ice
    await userEvent.keyboard("{Delete}");
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    expect(screen.getByText("fire")).toBeInTheDocument();
    // Now Backspace from the focused fire chip
    await userEvent.keyboard("{ArrowLeft}"); // gap before fire
    await userEvent.keyboard("{ArrowRight}"); // chip fire
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByText("fire")).not.toBeInTheDocument();
  });
```

Run: PASS.

- [ ] **Step 11: Write test "After Delete, focus lands on gap at deleted index"**

```tsx
  test("after Delete removes a chip, focus lands on the gap at the deleted index", async () => {
    render(<Harness initial={["fire", "ice", "wind"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}"); // chip ice
    await userEvent.keyboard("{Delete}");
    expect(screen.getByRole("button", { name: /insert tag before wind/i })).toHaveFocus();
  });
```

Run: PASS.

- [ ] **Step 12: Write test "Backspace on empty trailing input still removes last chip; focus stays on trailing"**

```tsx
  test("Backspace on empty trailing input removes last chip; focus stays on trailing", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    expect(trailing).toHaveFocus();
  });
```

The existing test "Backspace on an empty input removes the last chip" overlaps but doesn't assert focus stays. This new test makes the focus invariant explicit. Run: PASS.

- [ ] **Step 13: Write test "Backspace inside non-empty edit edits text"**

```tsx
  test("Backspace inside non-empty edit input edits text, does not remove chip", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.keyboard("{End}{Backspace}"); // delete trailing "e"
    expect(input).toHaveValue("fir");
    expect(screen.getByText("ice")).toBeInTheDocument();
  });
```

Run: PASS.

- [ ] **Step 14: Run full TagInput test file; confirm everything passes**

Run: `npm test -- src/lib/ui/TagInput.test.tsx`

Expected: all tests pass.

- [ ] **Step 15: Commit**

```bash
git add src/lib/ui/TagInput.tsx src/lib/ui/TagInput.test.tsx
git commit -m "feat(TagInput): keyboard navigation with roving tabindex"
```

---

## Task 5: Gap insertion polish + behavioral active-slot test + remaining insert-mode tests

**Files:**
- Modify: `src/lib/ui/TagInput.test.tsx`
- Modify: `src/lib/ui/TagInput.tsx` (small touch-ups only)

Goal: cover the remaining insert-mode tests from the test plan that weren't already covered by chip-mode work (tests 12-16 from the spec). Most behavior is already wired; this task is mostly tests.

- [ ] **Step 1: Write test "Click gap opens an input at that index; Enter inserts"**

```tsx
  test("clicking a gap opens an input at that index; typing + Enter inserts at that index", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "c"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByRole("button", { name: /insert tag before c/i }));
    const insertInput = screen.getByRole("textbox", { name: /insert tag before c/i });
    await userEvent.type(insertInput, "b{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|b|c");
  });
```

Run: PASS.

- [ ] **Step 2: Write tests "Empty insert is no-op" and "Whitespace-only insert is no-op"**

```tsx
  test("empty insert commit is a no-op", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "c"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByRole("button", { name: /insert tag before c/i }));
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|c");
  });

  test("whitespace-only insert commit is a no-op", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "c"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByRole("button", { name: /insert tag before c/i }));
    await userEvent.keyboard("   {Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|c");
  });
```

Run: PASS.

- [ ] **Step 3: Write test "After successful insert, next Enter inserts at index+1 (behavioral)"**

```tsx
  test("after a successful insert at gap N, the next insert lands at N+1", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "d"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    // Insert "b" between a and d
    await userEvent.click(screen.getByRole("button", { name: /insert tag before d/i }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /insert tag before d/i }),
      "b{Enter}",
    );
    expect(screen.getByRole("status")).toHaveTextContent("a|b|d");
    // Active slot should now be the gap after b (i.e., "before d"). Press Enter,
    // type "c", Enter → value becomes a|b|c|d.
    await userEvent.keyboard("{Enter}");
    await userEvent.type(
      screen.getByRole("textbox", { name: /insert tag before d/i }),
      "c{Enter}",
    );
    expect(screen.getByRole("status")).toHaveTextContent("a|b|c|d");
  });
```

Run: PASS.

- [ ] **Step 4: Write test "Escape during insert discards draft (and stopPropagation in trailing too)"**

```tsx
  test("Escape during insert discards draft (mid-list and trailing, empty and non-empty)", async () => {
    const onOuterKey = vi.fn();
    render(
      <div onKeyDown={onOuterKey}>
        <Harness initial={["a", "b"]} />
      </div>,
    );
    // mid-list insert with text
    await userEvent.click(screen.getByRole("button", { name: /insert tag before b/i }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /insert tag before b/i }),
      "x",
    );
    onOuterKey.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("x")).not.toBeInTheDocument();
    expect(onOuterKey).not.toHaveBeenCalled();
    // trailing input with empty draft → Escape should still stopPropagation
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    onOuterKey.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOuterKey).not.toHaveBeenCalled();
  });
```

This test will likely fail on the trailing-input branch because the trailing input doesn't yet have an Escape handler. Wire it in TagInput.tsx — replace `handleTrailingKeyDown`:

```tsx
  const handleTrailingKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTrailing();
    } else if (e.key === "Backspace" && trailingDraft === "" && value.length > 0) {
      e.preventDefault();
      dispatch({ type: "removeChip", index: value.length - 1 });
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setTrailingDraft("");
    }
  };
```

Re-run: PASS.

- [ ] **Step 5: Run full file; commit**

Run: `npm test -- src/lib/ui/TagInput.test.tsx`

Expected: all pass.

```bash
git add src/lib/ui/TagInput.tsx src/lib/ui/TagInput.test.tsx
git commit -m "test(TagInput): cover insert mode behavior + trailing-input Escape"
```

---

## Task 6: Accessibility polish + assertions

**Files:**
- Modify: `src/lib/ui/TagInput.tsx`
- Modify: `src/lib/ui/TagInput.module.css`
- Modify: `src/lib/ui/TagInput.test.tsx`

Goal: add the `aria-describedby` hint on the trailing input, ensure `role="list"` + `role="presentation"` + `aria-keyshortcuts` are correct, and add tests 28–31.

- [ ] **Step 1: Add sr-only hint span and aria-describedby on the trailing input**

In `TagInput.tsx`, after the `useId` import (add it if not present: `import { useId } from "react";`), generate a hint id and wire it:

```tsx
  const hintId = useId();
```

In the JSX before the trailing input:

```tsx
      <span id={hintId} className={styles.srOnly}>
        Use the left arrow key to insert tags between existing tags.
      </span>
```

Then on the trailing input, replace the `aria-describedby` line:

```tsx
        aria-describedby={
          [ariaDescribedBy, hintId].filter(Boolean).join(" ") || undefined
        }
```

- [ ] **Step 2: Confirm sr-only class exists**

The `.srOnly` class was added in Task 2 step 2. Sanity check.

- [ ] **Step 3: Write test "Wrapper exposes role=group with the consumer's aria-label"**

```tsx
  test("wrapper exposes role=group with the consumer's aria-label", () => {
    render(<Harness initial={["a"]} />);
    expect(screen.getByRole("group", { name: /footer tags/i })).toBeInTheDocument();
  });
```

Run: PASS.

- [ ] **Step 4: Write test "List has role=list; chip count matches value.length"**

```tsx
  test("inner list has role=list; chip count matches value.length", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
```

Run: should PASS because gaps use `role="presentation"`. If `getAllByRole("listitem")` returns 6 (gaps counted), confirm the gap `<li>` has `role="presentation"` (added in Task 2 step 1).

- [ ] **Step 5: Write test "Gap slots have the correct aria-labels"**

```tsx
  test("gap slots have aria-labels: start / before <next>", () => {
    render(<Harness initial={["fire", "ice"]} />);
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /insert tag before ice/i })).toBeInTheDocument();
  });
```

Run: PASS.

- [ ] **Step 6: Write test "Roving tabindex invariant"**

```tsx
  test("roving tabindex: exactly one slot has tabindex=0 at idle and after nav", () => {
    const { container } = render(<Harness initial={["a", "b"]} />);
    const tabbable = () => container.querySelectorAll('[tabindex="0"]');
    expect(tabbable()).toHaveLength(1);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    expect(tabbable()).toHaveLength(1);
    expect(trailing).toHaveAttribute("tabindex", "0");
    // Move active to a chip
    fireEvent.keyDown(screen.getByRole("group", { name: /footer tags/i }), {
      key: "ArrowLeft",
    });
    expect(tabbable()).toHaveLength(1);
  });
```

Add `fireEvent` to the imports: `import { fireEvent, render, screen } from "../../test/render";` (it's re-exported via `@testing-library/react`).

Run: PASS.

- [ ] **Step 7: Write test "chip slot has aria-keyshortcuts"**

```tsx
  test("chip slot exposes aria-keyshortcuts for Enter and Delete", () => {
    render(<Harness initial={["a"]} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute(
      "aria-keyshortcuts",
      "Enter Delete",
    );
  });
```

Run: PASS.

- [ ] **Step 8: Final TagInput test run, build, commit**

```bash
npm test -- src/lib/ui/TagInput.test.tsx
npx tsc --noEmit
```

Expected: all pass, clean typecheck.

```bash
git add src/lib/ui/TagInput.tsx src/lib/ui/TagInput.module.css src/lib/ui/TagInput.test.tsx
git commit -m "feat(TagInput): a11y polish — aria-describedby hint, list semantics, key shortcuts"
```

---

## Task 7: Full project verification + manual UI check

**Files:** none directly modified; this is verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: 0 failures across all test files. If anything in `CardEditor.test.tsx` regresses, the cause is most likely that TagInput's DOM changed in a way that affected an existing assertion — investigate before adjusting either side.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: clean build, no type errors.

- [ ] **Step 3: Start dev server and test the UI manually**

Run: `npm run dev` (pre-approved per CLAUDE.md).

Open a card editor and walk through:
1. Click on a chip in "Header tags" — chip becomes an input with text selected.
2. Type to replace, press Enter — chip updates.
3. Edit a chip, press Escape — chip reverts. The card editor dialog must NOT close.
4. Edit a chip, clear it, press Enter — chip disappears.
5. Click between two chips (you should see a faint caret on hover) — an empty insert input appears between them.
6. Type a value and press Enter — new chip inserted at that position.
7. Press Tab to focus the tag input; press ←/→ arrow keys to navigate chips and gaps.
8. With a chip focused, press Enter — it enters edit mode. Press Escape to cancel.
9. With a chip focused, press Delete — chip removed.
10. With a gap focused, type a letter — insert opens with that letter.
11. On mobile (or with DevTools "Responsive" coarse-pointer emulation), tap a chip and tap between chips — confirm the larger 12px touch target.

If anything looks broken, file as a Step in this task and fix before continuing.

- [ ] **Step 4: Stop the dev server**

Done — no commit needed if no fixes were required. If fixes were needed, the engineer must add steps documenting the fix, run tests, and commit.

- [ ] **Step 5: Final summary**

Push or hand off for PR creation as the user directs. Do NOT push or open a PR without explicit user instruction.

---

## Notes for the engineer

- The component has **no consumer-visible API change**. `CardEditor.tsx` doesn't change.
- The 10 baseline tests in `TagInput.test.tsx` are the contract for trailing-input append + remove behaviors. Don't delete or modify them.
- "Edit mode" and "insert mode" each render their own `<input>` element. `field-sizing: content` is the modern way to grow inputs; the `width: 8ch` fallback is intentional, not a bug.
- The reducer is the source of truth for state transitions. If a behavior feels wrong, change the reducer (with a unit test) rather than the component's render logic.
- `useLayoutEffect` for focus management: never call `.focus()` from an effect that doesn't gate on `wrapperRef.current?.contains(document.activeElement)`, or blur-to-outside will be hijacked back into the widget.
- `onPointerDown` lives only on slot *wrappers* (chip `<li>`, gap button), never on the active `<input>` itself. Otherwise text selection inside the input breaks.
- Escape `stopPropagation()` is unconditional inside every edit/insert input AND the trailing input.
