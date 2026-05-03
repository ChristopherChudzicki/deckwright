import type { AnchorHTMLAttributes } from "react";
import styles from "./Link.module.css";

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export function Link({ className, ...rest }: LinkProps) {
  return <a {...rest} className={[styles.link, className].filter(Boolean).join(" ")} />;
}
