import { Fragment, type ReactNode } from "react";
import styles from "./StatList.module.css";

export type StatItem = { label: string; value: ReactNode };

export function StatList({ items }: { items: StatItem[] }) {
  if (items.length === 0) return null;
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
