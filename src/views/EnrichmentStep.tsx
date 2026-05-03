import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import { type EquipmentDetail, fetchEquipmentDetail } from "../api/endpoints/equipment";
import type { Ruleset } from "../api/endpoints/magicItems";
import { useEquipmentIndex } from "../api/hooks";
import type { BaseHint } from "../api/mappers/baseHint";
import { Button } from "../lib/ui/Button";
import { Input } from "../lib/ui/Input";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./EnrichmentStep.module.css";

type Props = {
  ruleset: Ruleset;
  hint: BaseHint;
  onConfirm: (enrichment: EquipmentDetail | null) => void;
  onCancel: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function EnrichmentStep({ ruleset, hint, onConfirm, onCancel }: Props) {
  const index = useEquipmentIndex(ruleset);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(hint.hint);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const all = index.data?.results ?? [];
    const q = query.trim().toLowerCase();
    if (q === "") return all;
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [index.data, query]);

  useEffect(() => {
    if (selectedSlug !== null) return;
    if (hint.kind !== "specific") return;
    if (filtered.length !== 1) return;
    setSelectedSlug(filtered[0]!.index);
  }, [filtered, hint.kind, selectedSlug]);

  const handleConfirm = async () => {
    if (selectedSlug === null) return;
    setResolving(true);
    setError(null);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ["equipment", ruleset, "detail", selectedSlug],
        queryFn: () => fetchEquipmentDetail(ruleset, selectedSlug),
        staleTime: DAY_MS,
      });
      onConfirm(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this item.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <>
      <div className={styles.searchRow}>
        <TextField aria-label="Search equipment" className={styles.searchField}>
          <Input
            type="search"
            placeholder="Search equipment…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </TextField>
      </div>

      <div className={styles.results}>
        {index.isLoading && <LoadingState />}
        {index.isError && <div className={styles.state}>Couldn't load equipment.</div>}
        {index.isSuccess && filtered.length === 0 && (
          <div className={styles.state}>No equipment matches your search.</div>
        )}
        {error && (
          <div className={styles.state} role="alert">
            {error}
          </div>
        )}
        {index.isSuccess &&
          filtered.map((entry) => (
            <button
              key={entry.index}
              type="button"
              className={styles.row}
              aria-pressed={selectedSlug === entry.index}
              onClick={() => setSelectedSlug(entry.index)}
            >
              <span className={styles.rowName}>{entry.name}</span>
            </button>
          ))}
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onPress={onCancel}>
          Back
        </Button>
        <Button variant="secondary" onPress={() => onConfirm(null)}>
          Skip
        </Button>
        <Button onPress={handleConfirm} isDisabled={selectedSlug === null || resolving}>
          {resolving ? "Loading…" : "Confirm"}
        </Button>
      </div>
    </>
  );
}
