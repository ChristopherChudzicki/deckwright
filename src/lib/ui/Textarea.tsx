import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Textarea.module.css";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  className?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => (
    <textarea ref={ref} {...rest} className={cx(styles.textarea, className)} />
  ),
);
Textarea.displayName = "Textarea";
