import { Input as RACInput, type InputProps as RACInputProps } from "react-aria-components";
import { cx } from "../cx";
import styles from "./Input.module.css";

export type InputProps = Omit<RACInputProps, "className"> & {
  className?: string;
};

export function Input({ className, ...rest }: InputProps) {
  return <RACInput {...rest} className={cx(styles.input, className)} />;
}
