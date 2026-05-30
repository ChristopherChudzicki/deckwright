import type { ReactNode } from "react";
import {
  Radio as RACRadio,
  RadioGroup as RACRadioGroup,
  type RadioGroupProps as RACRadioGroupProps,
  type RadioProps as RACRadioProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./RadioGroup.module.css";

export type RadioGroupProps = Omit<RACRadioGroupProps, "className"> & {
  className?: string;
};

export function RadioGroup({ className, ...rest }: RadioGroupProps) {
  return <RACRadioGroup {...rest} className={cx(styles.group, className)} />;
}

export type RadioProps = Omit<RACRadioProps, "className" | "children"> & {
  className?: string;
  children?: ReactNode;
};

export function Radio({ className, children, ...rest }: RadioProps) {
  return (
    <RACRadio {...rest} className={cx(styles.radio, className)}>
      {children}
    </RACRadio>
  );
}
