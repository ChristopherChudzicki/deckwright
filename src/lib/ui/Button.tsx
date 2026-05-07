import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<RACButtonProps, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonProps) {
  return (
    <RACButton
      {...rest}
      data-variant={variant}
      data-size={size}
      className={[styles.btn, className].filter(Boolean).join(" ")}
    />
  );
}
