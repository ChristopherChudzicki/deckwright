import type { AnchorHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Link.module.css";

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export function Link({ className, ...rest }: LinkProps) {
  return <a {...rest} className={cx(styles.link, className)} />;
}
