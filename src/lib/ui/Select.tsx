import {
  ListBox,
  ListBoxItem,
  Popover,
  Button as RACButton,
  Select as RACSelect,
  SelectValue,
} from "react-aria-components";
import { cx } from "../cx";
import { ChevronDownIcon } from "./icons/ChevronDownIcon";
import styles from "./Select.module.css";

// label is `string` (not ReactNode): all call sites pass strings, SelectValue renders a
// string into the trigger, and a string child lets RAC derive each option's textValue
// (type-ahead) — so no `textValue` prop is needed.
export type SelectItem = { id: string; label: string };

export type SelectProps = {
  /** Field name — the visible prefix and the programmatic label (e.g. "Sort"). */
  label: string;
  /** Controlled id of the current value. */
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  items: ReadonlyArray<SelectItem>;
  /** Visibility/layout class composed onto the trigger (e.g. a responsive @container hide/show). Not a general style override. */
  triggerClassName?: string;
};

export function Select({
  label,
  selectedKey,
  onSelectionChange,
  items,
  triggerClassName,
}: SelectProps) {
  return (
    <RACSelect
      className={styles.select}
      aria-label={label}
      selectedKey={selectedKey}
      onSelectionChange={(key) => onSelectionChange(String(key))}
    >
      <RACButton className={cx(styles.trigger, triggerClassName)}>
        <span aria-hidden="true">{label}: </span>
        <SelectValue />
        <span className={styles.caret} aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </RACButton>
      <Popover className={styles.popover} placement="bottom end">
        <ListBox className={styles.listbox} items={items}>
          {(item) => (
            <ListBoxItem id={item.id} className={styles.option}>
              {item.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </RACSelect>
  );
}
