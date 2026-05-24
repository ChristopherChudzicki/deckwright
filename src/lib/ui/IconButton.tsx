import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";
import { cx } from "../cx";
import styles from "./IconButton.module.css";

export type IconButtonVariant = "secondary" | "danger";

export type IconButtonProps = Omit<RACButtonProps, "className"> & {
  variant?: IconButtonVariant;
  className?: string;
  "aria-label": string;
};

export function IconButton({ variant = "secondary", className, ...rest }: IconButtonProps) {
  return <RACButton {...rest} data-variant={variant} className={cx(styles.iconBtn, className)} />;
}
