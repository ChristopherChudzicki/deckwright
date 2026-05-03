import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { TextField } from "react-aria-components";
import type { EquipmentDetail } from "../api/endpoints/equipment";
import {
  fetchMagicItemDetail,
  type MagicItemDetail,
  type Ruleset,
} from "../api/endpoints/magicItems";
import { useMagicItemIndex } from "../api/hooks";
import { type BaseHint, parseBaseHint } from "../api/mappers/baseHint";
import { magicItemDetailToCard } from "../api/mappers/magicItems";
import { DAY_MS } from "../api/timing";
import { useSaveCard } from "../decks/mutations";
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { LoadingState } from "../lib/ui/LoadingState";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import styles from "./BrowseApiModal.module.css";
import { EnrichmentStep } from "./EnrichmentStep";

type Props = {
  deckId: string;
  onClose: () => void;
  onSelected: (cardId: string) => void;
};

type Step = { step: "pick" } | { step: "enrich"; magicDetail: MagicItemDetail; hint: BaseHint };

const isEnrichable = (k: string): boolean => {
  const lo = k.toLowerCase();
  return lo === "weapon" || lo === "weapons" || lo === "armor";
};

export function BrowseApiModal({ deckId, onClose, onSelected }: Props) {
  const [ruleset, setRuleset] = useState<Ruleset>("2024");
  const [query, setQuery] = useState("");
  const [pickingSlug, setPickingSlug] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ step: "pick" });
  const lastPickedSlugRef = useRef<string | null>(null);

  const index = useMagicItemIndex(ruleset);
  const queryClient = useQueryClient();
  const saveCard = useSaveCard();

  const filtered = useMemo(() => {
    const all = index.data?.results ?? [];
    if (query.trim() === "") return all;
    const q = query.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [index.data, query]);

  useEffect(() => {
    if (step.step !== "pick") return;
    const slug = lastPickedSlugRef.current;
    if (!slug) return;
    const row = document.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
    if (row instanceof HTMLElement) row.focus();
  }, [step.step]);

  const handlePick = async (slug: string) => {
    if (pickingSlug !== null) return;
    lastPickedSlugRef.current = slug;
    setPickingSlug(slug);
    setPickError(null);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ["magic-items", ruleset, "detail", slug],
        queryFn: () => fetchMagicItemDetail(ruleset, slug),
        staleTime: DAY_MS,
      });
      if (isEnrichable(detail.equipment_category.index)) {
        const desc0 = detail.ruleset === "2024" ? detail.desc : detail.desc[0];
        const hint = parseBaseHint(desc0);
        setStep({ step: "enrich", magicDetail: detail, hint });
      } else {
        const card = magicItemDetailToCard(detail);
        await saveCard.mutateAsync({ card, deckId, isNew: true });
        onSelected(card.id);
      }
    } catch (err) {
      setPickError(
        err instanceof Error ? err.message : "Couldn't add this card. Please try again.",
      );
    } finally {
      setPickingSlug(null);
    }
  };

  const handleEnrichmentConfirm = async (enrichment: EquipmentDetail | null) => {
    if (step.step !== "enrich") return;
    const card = magicItemDetailToCard(step.magicDetail, enrichment ?? undefined);
    await saveCard.mutateAsync({ card, deckId, isNew: true });
    onSelected(card.id);
  };

  const handleEnrichmentCancel = () => {
    setStep({ step: "pick" });
  };

  const title =
    step.step === "enrich"
      ? `${step.magicDetail.name} — pick base equipment`
      : "Browse magic items";

  return (
    <DialogShell
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label="Browse magic items"
      size="md"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <>
          <DialogHeader title={title} onClose={onClose}>
            {step.step === "pick" && (
              <ToggleButtonGroup
                aria-label="Magic items ruleset"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[ruleset]}
                onSelectionChange={(keys) => {
                  const next = Array.from(keys)[0];
                  if (next === "2014" || next === "2024") setRuleset(next);
                }}
              >
                <ToggleButton id="2014">2014</ToggleButton>
                <ToggleButton id="2024">2024</ToggleButton>
              </ToggleButtonGroup>
            )}
          </DialogHeader>

          {step.step === "pick" ? (
            <>
              <div className={styles.searchRow}>
                <TextField aria-label="Search magic items" className={styles.searchField}>
                  <Input
                    type="search"
                    placeholder="Search magic items…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                </TextField>
              </div>

              <div className={styles.results}>
                {index.isLoading && <LoadingState />}
                {index.isError && (
                  <div className={styles.state} role="alert">
                    Couldn't load the magic-items list.
                    <div className={styles.errorActions}>
                      <Button variant="secondary" size="sm" onPress={() => index.refetch()}>
                        Retry
                      </Button>
                    </div>
                  </div>
                )}
                {index.isSuccess && filtered.length === 0 && (
                  <div className={styles.state}>No items match your search.</div>
                )}
                {pickError && (
                  <div className={styles.state} role="alert">
                    {pickError}
                  </div>
                )}
                {index.isSuccess &&
                  filtered.map((entry) => (
                    <button
                      key={entry.index}
                      type="button"
                      className={styles.row}
                      data-slug={entry.index}
                      onClick={() => handlePick(entry.index)}
                      disabled={pickingSlug !== null}
                    >
                      <span className={styles.rowName}>{entry.name}</span>
                      {pickingSlug === entry.index && (
                        <span className={styles.rowMeta}>Loading…</span>
                      )}
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <EnrichmentStep
              ruleset={ruleset}
              hint={step.hint}
              onConfirm={handleEnrichmentConfirm}
              onCancel={handleEnrichmentCancel}
            />
          )}
        </>
      )}
    </DialogShell>
  );
}
