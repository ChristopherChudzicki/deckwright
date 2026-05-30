import { useEffect } from "react";
import { Button } from "../../lib/ui/Button";
import { LoadingState } from "../../lib/ui/LoadingState";
import styles from "./ResultsView.module.css";
import type { ContentTypeResults, ResultsProps } from "./types";

type Props = Pick<ResultsProps, "pickingKey" | "pickError" | "onPick" | "onCount"> & {
  results: ContentTypeResults;
  emptyMessage: string;
};

export function ResultsView({
  results,
  emptyMessage,
  pickingKey,
  pickError,
  onPick,
  onCount,
}: Props) {
  const { isLoading, isError, rows } = results;

  useEffect(() => {
    onCount(isLoading || isError ? null : rows.length);
  }, [isLoading, isError, rows.length, onCount]);

  return (
    <div className={styles.results}>
      {isLoading && (
        <div className={styles.statePane}>
          <LoadingState />
        </div>
      )}
      {isError && (
        <div className={styles.statePane}>
          <div className={`${styles.state} ${styles.stateError}`} role="alert">
            Couldn't load the list.
            <div className={styles.errorActions}>
              <Button variant="secondary" size="sm" onPress={() => results.refetch()}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className={styles.statePane}>
          <div className={styles.state}>{emptyMessage}</div>
        </div>
      )}
      {pickError && (
        <div className={`${styles.state} ${styles.stateError}`} role="alert">
          {pickError}
        </div>
      )}
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className={styles.row}
          onClick={() => onPick(row.key, row.toCard())}
          disabled={pickingKey !== null}
        >
          <span className={styles.rowName}>{row.name}</span>
          <span className={styles.rowMeta}>
            {pickingKey === row.key
              ? "Loading…"
              : row.kindLabel
                ? `${row.kindLabel} · ${row.meta}`
                : row.meta}
          </span>
        </button>
      ))}
    </div>
  );
}
