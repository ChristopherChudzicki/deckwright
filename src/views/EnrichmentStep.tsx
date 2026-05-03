import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
  onConfirm: (enrichment: EquipmentDetail | null) => Promise<void>;
  onCancel: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function EnrichmentStep({ ruleset, hint, onConfirm, onCancel }: Props) {
  const index = useEquipmentIndex(ruleset);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const initRef = useRef(false);
  const [pickingSlug, setPickingSlug] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const all = index.data?.results ?? [];
    const q = query.trim().toLowerCase();
    if (q === "") return all;
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [index.data, query]);

  useEffect(() => {
    if (initRef.current) return;
    if (!index.data) return;
    initRef.current = true;
    if (hint.hint === "") return;
    const wouldMatch = index.data.results.some((e) => e.name.toLowerCase().includes(hint.hint));
    if (wouldMatch) setQuery(hint.hint);
  }, [index.data, hint.hint]);

  const handlePick = async (slug: string) => {
    if (pickingSlug !== null) return;
    setPickingSlug(slug);
    setError(null);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ["equipment", ruleset, "detail", slug],
        queryFn: () => fetchEquipmentDetail(ruleset, slug),
        staleTime: DAY_MS,
      });
      await onConfirm(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this item.");
      setPickingSlug(null);
    }
  };

  const handleSkip = async () => {
    if (pickingSlug !== null || skipping) return;
    setSkipping(true);
    setError(null);
    try {
      await onConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this card.");
      setSkipping(false);
    }
  };

  return (
    <>
      <p className={styles.intro}>
        Pick the base equipment to auto-fill damage/AC and weight, or skip.
      </p>
      {hint.source && <p className={styles.source}>Described as: {hint.source}</p>}
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
              onClick={() => handlePick(entry.index)}
              disabled={pickingSlug !== null || skipping}
            >
              <span className={styles.rowName}>{entry.name}</span>
              {pickingSlug === entry.index && <span className={styles.rowMeta}>Loading…</span>}
            </button>
          ))}
      </div>

      <div className={styles.actions}>
        <Button
          variant="secondary"
          onPress={onCancel}
          isDisabled={pickingSlug !== null || skipping}
        >
          Back
        </Button>
        <Button
          variant="secondary"
          onPress={handleSkip}
          isDisabled={pickingSlug !== null || skipping}
        >
          Skip
        </Button>
      </div>
    </>
  );
}
