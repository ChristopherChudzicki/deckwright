import { useEffect, useState } from "react";
import { type PressEvent, TextField } from "react-aria-components";
import type { Ruleset } from "../api/endpoints/magicItems";
import type { Card } from "../cards/types";
import { useSaveCard } from "../decks/mutations";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { Link } from "../lib/ui/Link";
import { Radio, RadioGroup } from "../lib/ui/RadioGroup";
import { Select } from "../lib/ui/Select";
import styles from "./BrowseApiModal.module.css";
import { CONTENT_TYPES } from "./browse/contentTypes";

/** The trigger's `PressEvent.pointerType` — how the dialog was opened. */
export type OpenPointerType = PressEvent["pointerType"];

type Props = {
  deckId: string;
  onClose: () => void;
  onSelected: (cardId: string) => void;
  openPointerType?: OpenPointerType | null;
};

export function BrowseApiModal({ deckId, onClose, onSelected, openPointerType }: Props) {
  const [typeId, setTypeId] = useState<string>(CONTENT_TYPES[0].id);
  const activeType = CONTENT_TYPES.find((t) => t.id === typeId) ?? CONTENT_TYPES[0];

  const [source, setSource] = useState<Ruleset>(activeType.supportedSources[0]);
  useEffect(() => {
    if (!activeType.supportedSources.includes(source)) {
      setSource(activeType.supportedSources[0]);
    }
  }, [activeType, source]);

  const [query, setQuery] = useState("");
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);

  // Pointer opens autofocus the search for immediate typing. Keyboard and
  // assistive-tech opens skip it, leaving focus at the top of the dialog so the
  // source scope and type filter are encountered before the search box.
  const autoFocusSearch = openPointerType !== "keyboard" && openPointerType !== "virtual";

  const handleTypeChange = (next: string) => {
    if (next === typeId) return;
    setTypeId(next);
    setQuery("");
    setPickError(null);
  };

  const saveCard = useSaveCard();
  const handlePick = async (rowKey: string, card: Card) => {
    if (pickingKey !== null) return;
    setPickingKey(rowKey);
    setPickError(null);
    try {
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

  const countMessage =
    resultCount === null ? "" : `${resultCount} ${resultCount === 1 ? "result" : "results"}`;

  return (
    <DialogShell
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label="Browse content"
      size="lg"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <div className={styles.modalContainer}>
          <DialogHeader title="Browse content" onClose={onClose} />

          <div className={styles.body}>
            <div className={styles.rail}>
              <div className={styles.scope}>
                <SourceMenu
                  source={source}
                  options={activeType.supportedSources}
                  onChange={setSource}
                />
              </div>
              <RadioGroup
                aria-label="Content type"
                className={styles.typeFilter}
                value={typeId}
                onChange={handleTypeChange}
              >
                {CONTENT_TYPES.map((t) => (
                  <Radio key={t.id} value={t.id}>
                    {t.label}
                  </Radio>
                ))}
              </RadioGroup>
            </div>

            <div className={styles.main}>
              <div className={styles.searchRow}>
                <TextField aria-label="Search" className={styles.searchField}>
                  <Input
                    type="search"
                    placeholder={activeType.searchPlaceholder}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus={autoFocusSearch}
                  />
                </TextField>
              </div>
              <activeType.Results
                source={source}
                query={query}
                pickingKey={pickingKey}
                pickError={pickError}
                onPick={handlePick}
                onCount={setResultCount}
              />
            </div>
          </div>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {countMessage}
          </div>

          <p className={styles.footer}>
            All content shown is from the{" "}
            <Link href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener noreferrer">
              SRD
            </Link>{" "}
            — content by Wizards of the Coast, licensed under{" "}
            <Link
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CC BY 4.0
            </Link>
            . Curated by{" "}
            <Link href="https://open5e.com" target="_blank" rel="noopener noreferrer">
              Open5e
            </Link>
            .
          </p>
        </div>
      )}
    </DialogShell>
  );
}

function SourceMenu({
  source,
  options,
  onChange,
}: {
  source: Ruleset;
  options: readonly Ruleset[];
  onChange: (next: Ruleset) => void;
}) {
  return (
    <Select
      label="Source"
      selectedKey={source}
      onSelectionChange={(key) => onChange(key as Ruleset)}
      items={options.map((opt) => ({ id: opt, label: opt }))}
    />
  );
}
