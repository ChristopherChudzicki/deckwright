import type { ReactNode } from "react";
import { Switch as RACSwitch, type SwitchProps as RACSwitchProps } from "react-aria-components";
import { cx } from "../cx";
import styles from "./Switch.module.css";

export type SwitchProps = Omit<RACSwitchProps, "className" | "children"> & {
  className?: string;
  children: ReactNode;
};

export function Switch({ className, children, ...rest }: SwitchProps) {
  return (
    <RACSwitch {...rest} className={cx(styles.switch, className)}>
      <span className={styles.indicator} />
      {children}
    </RACSwitch>
  );
}
