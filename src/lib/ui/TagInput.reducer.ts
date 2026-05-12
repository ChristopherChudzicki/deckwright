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

export function tagInputReducer(state: State, action: Action, value: readonly string[]): Result {
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
