import type { ReactNode } from "react";
import {
  Checkbox as RACCheckbox,
  type CheckboxProps as RACCheckboxProps,
} from "react-aria-components";
import styles from "./Checkbox.module.css";

export type CheckboxProps = Omit<RACCheckboxProps, "className" | "children"> & {
  className?: string;
  children?: ReactNode;
};

export function Checkbox({ className, children, ...rest }: CheckboxProps) {
  return (
    <RACCheckbox {...rest} className={[styles.checkbox, className].filter(Boolean).join(" ")}>
      <span className={styles.box} aria-hidden="true" />
      {children}
    </RACCheckbox>
  );
}
