import { useMemo, useState } from "react";
import { TextField } from "react-aria-components";
import type { Ruleset } from "../api/endpoints/magicItems";
import { useMagicItemIndex, useSpellIndex } from "../api/hooks";
import { magicItemDetailToCard } from "../api/mappers/magicItems";
import { spellDetailToCard } from "../api/mappers/spells";
import type { MagicItem, Spell } from "../data/srd-schema";
import { useSaveCard } from "../decks/mutations";
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { Link } from "../lib/ui/Link";
import { LoadingState } from "../lib/ui/LoadingState";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import styles from "./BrowseApiModal.module.css";

type Kind = "items" | "spells";

type Props = {
  deckId: string;
  onClose: () => void;
  onSelected: (cardId: string) => void;
};

export function BrowseApiModal({ deckId, onClose, onSelected }: Props) {
  const [kind, setKind] = useState<Kind>("items");
  const [ruleset, setRuleset] = useState<Ruleset>("2024");
  const [query, setQuery] = useState("");
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const itemIndex = useMagicItemIndex(ruleset);
  const spellIndex = useSpellIndex(ruleset);
  const index = kind === "items" ? itemIndex : spellIndex;
  const saveCard = useSaveCard();

  const filtered = useMemo(() => {
    const all = index.data?.results ?? [];
    if (query.trim() === "") return all;
    const q = query.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [index.data, query]);

  const handlePick = async (entry: MagicItem | Spell) => {
    if (pickingKey !== null) return;
    setPickingKey(entry.key);
    setPickError(null);
    try {
      const card =
        kind === "items"
          ? magicItemDetailToCard({ ...(entry as MagicItem), ruleset })
          : spellDetailToCard({ ...(entry as Spell), ruleset });
      await saveCard.mutateAsync({ card, deckId, isNew: true });
      onSelected(card.id);
    } catch (err) {
      setPickError(
        err instanceof Error ? err.message : "Couldn't add this card. Please try again.",
      );
    } finally {
      setPickingKey(null);
    }
  };

  const placeholder = kind === "items" ? "Search magic items…" : "Search spells…";
  const emptyMessage =
    kind === "items" ? "No items match your search." : "No spells match your search.";
  const errorMessage =
    kind === "items" ? "Couldn't load the magic-items list." : "Couldn't load the spells list.";

  return (
    <DialogShell
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label="Browse SRD"
      size="md"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <>
          <DialogHeader title="Browse SRD" onClose={onClose}>
            <div className={styles.toggles}>
              <ToggleButtonGroup
                aria-label="Browse kind"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[kind]}
                onSelectionChange={(keys) => {
                  const next = Array.from(keys)[0];
                  if (next === "items" || next === "spells") setKind(next);
                }}
              >
                <ToggleButton id="items">Items</ToggleButton>
                <ToggleButton id="spells">Spells</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                aria-label="Ruleset"
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
            </div>
          </DialogHeader>

          <p className={styles.notice}>
            Only SRD spells and items are available here. See the{" "}
            <Link
              href="https://en.wikipedia.org/wiki/System_Reference_Document"
              target="_blank"
              rel="noopener noreferrer"
            >
              SRD
            </Link>{" "}
            for what's covered.
          </p>

          <div className={styles.searchRow}>
            <TextField aria-label={placeholder} className={styles.searchField}>
              <Input
                type="search"
                placeholder={placeholder}
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
                {errorMessage}
                <div className={styles.errorActions}>
                  <Button variant="secondary" size="sm" onPress={() => index.refetch()}>
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {index.isSuccess && filtered.length === 0 && (
              <div className={styles.state}>{emptyMessage}</div>
            )}
            {pickError && (
              <div className={styles.state} role="alert">
                {pickError}
              </div>
            )}
            {index.isSuccess &&
              filtered.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={styles.row}
                  onClick={() => handlePick(entry)}
                  disabled={pickingKey !== null}
                >
                  <span className={styles.rowName}>{entry.name}</span>
                  {pickingKey === entry.key && <span className={styles.rowMeta}>Loading…</span>}
                </button>
              ))}
          </div>
        </>
      )}
    </DialogShell>
  );
}
