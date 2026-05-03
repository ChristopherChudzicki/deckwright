import { type KeyboardEvent, useState } from "react";
import { Button, Tag, TagGroup, TagList } from "react-aria-components";
import styles from "./TagInput.module.css";

export type TagInputProps = {
  id?: string;
  className?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  followUpPlaceholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export function TagInput({
  id,
  className,
  value,
  onChange,
  placeholder,
  followUpPlaceholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") return;
    onChange([...value, trimmed]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  const items = value.map((v, i) => ({ id: `${i}-${v}`, value: v }));

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <TagGroup
        aria-label="Tags"
        onRemove={(keys) => {
          const next = value.filter((_, i) => !keys.has(`${i}-${value[i]}`));
          onChange(next);
        }}
        className={styles.group}
      >
        <TagList items={items} className={styles.list}>
          {(item) => (
            <Tag textValue={item.value} className={styles.tag}>
              <span className={styles.tagText}>{item.value}</span>
              <Button slot="remove" aria-label={`Remove ${item.value}`} className={styles.remove}>
                ×
              </Button>
            </Tag>
          )}
        </TagList>
      </TagGroup>
      <input
        id={id}
        type="text"
        aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "Tags")}
        aria-labelledby={ariaLabelledBy}
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={
          value.length === 0 ? placeholder : value.length === 1 ? followUpPlaceholder : undefined
        }
      />
    </div>
  );
}
