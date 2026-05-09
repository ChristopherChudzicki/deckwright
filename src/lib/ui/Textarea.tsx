import { forwardRef, type TextareaHTMLAttributes } from "react";
import styles from "./Textarea.module.css";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  className?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      {...rest}
      className={[styles.textarea, className].filter(Boolean).join(" ")}
    />
  ),
);
Textarea.displayName = "Textarea";
