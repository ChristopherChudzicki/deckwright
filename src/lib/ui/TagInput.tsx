import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import styles from "./TagInput.module.css";
import { type Action, initialState, type State, tagInputReducer } from "./TagInput.reducer";

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

  // Edit / insert drafts live in the reducer's mode (so commit transitions
  // can read them). The trailing input's draft is local-only — keeping it
  // outside the reducer means typing doesn't notify the parent via onChange.
  const [trailingDraft, setTrailingDraft] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isFirstRender = useRef(true);
  const hintId = useId();

  // We run the reducer twice per action: once here to extract nextValue (so
  // we can call onChange immediately), once via dispatchRaw so React owns the
  // state transition. The reducer is pure, so both runs produce the same state.
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
    const newValue = [...value, trimmed];
    onChange(newValue);
    setTrailingDraft("");
    // setActiveSlot never produces nextValue, so we use dispatchRaw directly
    // instead of dispatch — onChange was already fired above for the appended chip.
    dispatchRaw({ type: "setActiveSlot", slot: newValue.length * 2 });
  }, [trailingDraft, value, onChange]);

  const inserting = state.mode.kind === "inserting" ? state.mode : null;

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
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setTrailingDraft("");
    }
  };

  const handleTrailingBlur = () => {
    commitTrailing();
  };

  const handleGapPointerDown = (at: number) => (e: PointerEvent) => {
    e.preventDefault();
    if (state.mode.kind === "idle") commitTrailing();
    dispatch({ type: "commitAndOpenInsert", at });
  };

  const handleChipPointerDown = (index: number) => (e: PointerEvent) => {
    const t = e.target;
    if (t instanceof Element && t.closest(`.${styles.remove}`)) return;
    e.preventDefault();
    if (state.mode.kind === "idle") commitTrailing();
    dispatch({ type: "commitAndOpenEdit", index, value });
  };

  const handleRemoveClick = (index: number) => () => {
    dispatch({ type: "removeChip", index });
  };

  const handleChipKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      dispatch({ type: "openEdit", index, value });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      dispatch({ type: "removeChip", index });
    }
  };

  const handleGapKeyDown = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      dispatch({ type: "openInsert", at });
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      dispatch({ type: "openInsert", at, initialDraft: e.key });
    }
  };

  const totalSlots = value.length * 2 + 1;

  const handleWrapperKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (state.mode.kind !== "idle") return;
    // Don't hijack caret navigation inside the trailing input when there's text to navigate.
    if (e.target instanceof HTMLInputElement && e.target.value !== "") return;
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

  const isInsertingAt = (at: number): boolean => inserting !== null && inserting.at === at;

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus restore must also re-fire on mode/value.length transitions (e.g., cancel) where activeSlot may be unchanged
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const active = document.activeElement;
    if (active && active !== document.body && !wrapper.contains(active)) return;
    const slots = wrapper.querySelectorAll<HTMLElement>("[data-slot]");
    const target = Array.from(slots).find(
      (el) => Number(el.dataset.slotIndex) === state.activeSlot,
    );
    target?.focus();
  }, [state.activeSlot, state.mode.kind, value.length]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> would impose default form styling; the widget is not a form group
    <div
      ref={wrapperRef}
      className={[styles.wrapper, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "Tags")}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      onKeyDown={handleWrapperKeyDown}
    >
      {/* biome-ignore lint/a11y/noRedundantRoles: explicit role="list" is required because display:contents strips ul semantics in WebKit */}
      <ul role="list" className={styles.list}>
        {value.flatMap((label, i) => {
          const gapKey = `gap-${i}-${label}`;
          const chipKey = `chip-${i}-${label}`;
          const slotChildren = [
            <li key={gapKey} role="presentation" className={styles.gap}>
              {isInsertingAt(i) ? (
                <input
                  data-slot
                  data-slot-index={i * 2}
                  className={styles.chipEdit}
                  // biome-ignore lint/a11y/noAutofocus: explicit focus is required when the gap input mounts
                  autoFocus
                  value={inserting?.draft ?? ""}
                  onChange={handleInsertChange}
                  onKeyDown={handleInsertKeyDown}
                  onBlur={handleInsertBlur}
                  aria-label={i === 0 ? "Insert tag at start" : `Insert tag before ${value[i]}`}
                />
              ) : (
                <button
                  type="button"
                  data-slot
                  data-slot-index={i * 2}
                  className={styles.gapButton}
                  tabIndex={state.activeSlot === i * 2 ? 0 : -1}
                  aria-label={i === 0 ? "Insert tag at start" : `Insert tag before ${value[i]}`}
                  onPointerDown={handleGapPointerDown(i)}
                  onKeyDown={(e) => handleGapKeyDown(e, i)}
                />
              )}
            </li>,
            state.mode.kind === "editing" && state.mode.index === i ? (
              // biome-ignore lint/a11y/noRedundantRoles: explicit role="listitem" pairs with the explicit ul role="list" above
              <li key={chipKey} role="listitem" className={styles.tag}>
                <input
                  data-slot
                  data-slot-index={i * 2 + 1}
                  className={styles.chipEdit}
                  // biome-ignore lint/a11y/noAutofocus: edit input must focus on open
                  autoFocus
                  value={state.mode.draft}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => dispatch({ type: "updateDraft", draft: e.target.value })}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (!/[\n\r]/.test(text)) return;
                    e.preventDefault();
                    const target = e.currentTarget;
                    const start = target.selectionStart ?? target.value.length;
                    const end = target.selectionEnd ?? target.value.length;
                    const collapsed = text.replace(/[\n\r]+/g, " ");
                    const next = target.value.slice(0, start) + collapsed + target.value.slice(end);
                    dispatch({ type: "updateDraft", draft: next });
                  }}
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
                key={chipKey}
                // biome-ignore lint/a11y/noRedundantRoles: explicit role="listitem" pairs with the explicit ul role="list" above
                role="listitem"
                className={styles.tag}
                data-slot
                data-slot-index={i * 2 + 1}
                tabIndex={state.activeSlot === i * 2 + 1 ? 0 : -1}
                aria-label={`Tag: ${label}`}
                aria-keyshortcuts="Enter F2 Delete Backspace"
                onPointerDown={handleChipPointerDown(i)}
                onKeyDown={(e) => handleChipKeyDown(e, i)}
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
          ];
          return slotChildren;
        })}
      </ul>
      <span id={hintId} className={styles.srOnly}>
        Use the left arrow key to insert tags between existing tags.
      </span>
      <input
        id={id}
        type="text"
        data-slot
        data-slot-index={value.length * 2}
        tabIndex={state.activeSlot === value.length * 2 ? 0 : -1}
        aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "Tags")}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={[ariaDescribedBy, hintId].filter(Boolean).join(" ") || undefined}
        className={[
          styles.input,
          trailingDraft !== "" ? styles.chipEdit : "",
          inserting !== null ? styles.trailingHidden : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={inserting !== null}
        value={trailingDraft}
        onChange={(e) => setTrailingDraft(e.target.value)}
        onKeyDown={handleTrailingKeyDown}
        onBlur={handleTrailingBlur}
        placeholder={value.length === 0 ? placeholder : undefined}
      />
    </div>
  );
}
