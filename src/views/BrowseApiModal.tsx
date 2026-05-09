import { useEffect, useMemo, useState } from "react";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Button as RACButton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
} from "react-aria-components";
import { CONTENT_TYPES, type ContentType } from "../api/content-types";
import type { Ruleset } from "../api/endpoints/magicItems";
import type { Card } from "../cards/types";
import { useSaveCard } from "../decks/mutations";
import { Button } from "../lib/ui/Button";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { Link } from "../lib/ui/Link";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./BrowseApiModal.module.css";

type Props = {
  deckId: string;
  onClose: () => void;
  onSelected: (cardId: string) => void;
};

export function BrowseApiModal({ deckId, onClose, onSelected }: Props) {
  const [typeId, setTypeId] = useState<string>(() => CONTENT_TYPES[0]?.id ?? "");
  const activeType = CONTENT_TYPES.find((t) => t.id === typeId) ?? CONTENT_TYPES[0];
  if (!activeType) {
    throw new Error("CONTENT_TYPES is empty");
  }

  const [source, setSource] = useState<Ruleset>("2024");
  useEffect(() => {
    if (!activeType.supportedSources.includes(source)) {
      const fallback = activeType.supportedSources[0];
      if (fallback) setSource(fallback);
    }
  }, [activeType, source]);

  const [query, setQuery] = useState("");
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const handleTabChange = (next: string) => {
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

  return (
    <DialogShell
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label="Browse SRD"
      size="lg"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <>
          <DialogHeader title="Browse SRD" onClose={onClose}>
            <SourceMenu
              source={source}
              options={activeType.supportedSources}
              onChange={setSource}
            />
          </DialogHeader>

          <div className={styles.layout}>
            <Tabs
              orientation="vertical"
              selectedKey={typeId}
              onSelectionChange={(k) => handleTabChange(String(k))}
              className={styles.tabs}
            >
              <TabList aria-label="Content type" className={styles.tabList}>
                {CONTENT_TYPES.map((t) => (
                  <Tab key={t.id} id={t.id} className={styles.tab}>
                    {t.label}
                  </Tab>
                ))}
              </TabList>
              {CONTENT_TYPES.map((t) => (
                <TabPanel key={t.id} id={t.id} className={styles.tabPanel}>
                  {t.id === typeId && (
                    <TypePanel
                      type={t}
                      source={source}
                      query={query}
                      onQueryChange={setQuery}
                      pickingKey={pickingKey}
                      pickError={pickError}
                      onPick={handlePick}
                    />
                  )}
                </TabPanel>
              ))}
            </Tabs>
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
            .
          </p>
        </>
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
    <MenuTrigger>
      <RACButton aria-label={`Source: SRD ${source}`} className={styles.sourceTrigger}>
        Source: SRD {source} <span aria-hidden="true">▾</span>
      </RACButton>
      <Popover className={styles.sourcePopover} placement="bottom end">
        <Menu className={styles.sourceMenu} onAction={(key) => onChange(String(key) as Ruleset)}>
          {options.map((opt) => (
            <MenuItem key={opt} id={opt} className={styles.sourceItem}>
              {opt}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

type TypePanelProps = {
  type: ContentType;
  source: Ruleset;
  query: string;
  onQueryChange: (q: string) => void;
  pickingKey: string | null;
  pickError: string | null;
  onPick: (rowKey: string, card: Card) => void;
};

function TypePanel({
  type,
  source,
  query,
  onQueryChange,
  pickingKey,
  pickError,
  onPick,
}: TypePanelProps) {
  const results = type.useResults(source, query);
  const emptyMessage = useMemo(
    () => `No ${type.label.toLowerCase()} match your search.`,
    [type.label],
  );

  return (
    <>
      <div className={styles.searchRow}>
        <TextField aria-label={type.searchPlaceholder} className={styles.searchField}>
          <Input
            type="search"
            placeholder={type.searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
        </TextField>
      </div>

      <div className={styles.results}>
        {results.isLoading && <LoadingState />}
        {results.isError && (
          <div className={styles.state} role="alert">
            Couldn't load the list.
            <div className={styles.errorActions}>
              <Button variant="secondary" size="sm" onPress={() => results.refetch()}>
                Retry
              </Button>
            </div>
          </div>
        )}
        {!results.isLoading && !results.isError && results.rows.length === 0 && (
          <div className={styles.state}>{emptyMessage}</div>
        )}
        {pickError && (
          <div className={styles.state} role="alert">
            {pickError}
          </div>
        )}
        {results.rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className={styles.row}
            onClick={() => onPick(row.key, row.toCard())}
            disabled={pickingKey !== null}
          >
            <span className={styles.rowName}>{row.name}</span>
            <span className={styles.rowMeta}>{pickingKey === row.key ? "Loading…" : row.meta}</span>
          </button>
        ))}
      </div>
    </>
  );
}
