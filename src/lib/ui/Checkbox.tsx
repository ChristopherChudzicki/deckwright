import type { ReactNode } from "react";
import {
  Checkbox as RACCheckbox,
  type CheckboxProps as RACCheckboxProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./Checkbox.module.css";

export type CheckboxProps = Omit<RACCheckboxProps, "className" | "children"> & {
  className?: string;
  children?: ReactNode;
};

export function Checkbox({ className, children, ...rest }: CheckboxProps) {
  return (
    <RACCheckbox {...rest} className={cx(styles.checkbox, className)}>
      <span className={styles.box} aria-hidden="true" />
      {children}
    </RACCheckbox>
  );
}
