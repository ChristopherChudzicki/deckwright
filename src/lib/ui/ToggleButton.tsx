import {
  ToggleButton as RACToggleButton,
  type ToggleButtonProps as RACToggleButtonProps,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./ToggleButton.module.css";

export type ToggleButtonProps = Omit<RACToggleButtonProps, "className"> & {
  className?: string;
};

export function ToggleButton({ className, ...rest }: ToggleButtonProps) {
  return <RACToggleButton {...rest} className={cx(styles.btn, className)} />;
}
