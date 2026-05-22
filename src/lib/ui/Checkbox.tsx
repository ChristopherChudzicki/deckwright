import { type ReactNode, useEffect, useRef } from "react";
import {
  Checkbox as RACCheckbox,
  type CheckboxProps as RACCheckboxProps,
} from "react-aria-components";
import styles from "./Checkbox.module.css";

export type CheckboxProps = Omit<RACCheckboxProps, "className" | "children"> & {
  className?: string;
  children?: ReactNode;
};

export function Checkbox({ className, children, isIndeterminate, ...rest }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // RAC sets input.indeterminate as a DOM property but does not set the aria-checked attribute.
  // Browsers compute aria-checked="mixed" from the property, but JSDOM does not; we set it
  // explicitly so assistive technology and test queries see the correct state.
  useEffect(() => {
    if (inputRef.current) {
      if (isIndeterminate) {
        inputRef.current.setAttribute("aria-checked", "mixed");
      } else {
        inputRef.current.removeAttribute("aria-checked");
      }
    }
  }, [isIndeterminate]);

  return (
    <RACCheckbox
      {...rest}
      isIndeterminate={isIndeterminate}
      inputRef={inputRef}
      className={[styles.checkbox, className].filter(Boolean).join(" ")}
    >
      <span className={styles.box} aria-hidden="true" />
      {children}
    </RACCheckbox>
  );
}
