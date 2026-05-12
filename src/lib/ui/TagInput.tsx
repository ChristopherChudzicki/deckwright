import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
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

  const isInsertingAt = (at: number): boolean => inserting !== null && inserting.at === at;

  return (
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> would impose default form styling; the widget is not a form group
    <div
      className={[styles.wrapper, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "Tags")}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    >
      {/* biome-ignore lint/a11y/noRedundantRoles: explicit role="list" is required because display:contents strips ul semantics in WebKit */}
      <ul role="list" className={styles.list}>
        {value.flatMap((label, i) => {
          const gapKey = `gap-${i}-${label}`;
          const chipKey = `chip-${i}-${label}`;
          const slotChildren = [
            <li
              key={gapKey}
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
                  aria-label={i === 0 ? "Insert tag at start" : `Insert tag before ${value[i]}`}
                />
              ) : (
                <button
                  type="button"
                  className={styles.gapButton}
                  tabIndex={-1}
                  aria-label={i === 0 ? "Insert tag at start" : `Insert tag before ${value[i]}`}
                  onPointerDown={handleGapPointerDown(i)}
                />
              )}
            </li>,
            // biome-ignore lint/a11y/noRedundantRoles: explicit role="listitem" pairs with the explicit ul role="list" above
            <li key={chipKey} role="listitem" className={styles.tag}>
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
        aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "Tags")}
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
