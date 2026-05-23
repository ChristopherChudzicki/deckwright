import { useId, useMemo, useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import type { CardId, RenderableCard } from "../cards/types";
import { type DeckKindFilter, type DeckSort, deckListing } from "../decks/deckListing";
import { pluralize } from "../lib/pluralize";
import { relativeTime } from "../lib/relativeTime";
import { Button } from "../lib/ui/Button";
import { Checkbox } from "../lib/ui/Checkbox";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import styles from "./PrintSelectionModal.module.css";

type Props = {
  cards: RenderableCard[];
  initialSelection: Set<CardId>;
  onApply: (next: Set<CardId>) => void;
  onClose: () => void;
};

export function PrintSelectionModal({ cards, initialSelection, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Set<CardId>>(() => new Set(initialSelection));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DeckSort>("updated");
  const [kind, setKind] = useState<DeckKindFilter>("all");
  const sortId = useId();
  const searchId = useId();

  const visible = useMemo(() => {
    const { cards: sorted } = deckListing(cards, { kind, sort });
    const q = search.trim().toLowerCase();
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
  }, [cards, kind, sort, search]);

  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const visibleCheckedCount = useMemo(
    () => visibleIds.filter((id) => draft.has(id)).length,
    [visibleIds, draft],
  );
  const allVisibleChecked = visible.length > 0 && visibleCheckedCount === visible.length;
  const headerIndeterminate = !allVisibleChecked && visibleCheckedCount > 0;

  // Intentionally ignores RAC's onChange boolean: RAC passes `true` when clicked
  // from the indeterminate state, but the rule is always "any visible checked → clear".
  const onHeaderToggle = () => {
    const next = new Set(draft);
    if (visibleCheckedCount > 0) {
      for (const id of visibleIds) next.delete(id);
    } else {
      for (const id of visibleIds) next.add(id);
    }
    setDraft(next);
  };

  const toggle = (id: CardId) => {
    const next = new Set(draft);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  };

  const hiddenSelectedCount = useMemo(() => {
    const visibleIdSet = new Set(visibleIds);
    return cards.filter((c) => draft.has(c.id) && !visibleIdSet.has(c.id)).length;
  }, [cards, draft, visibleIds]);

  const clearFilters = () => {
    setKind("all");
    setSearch("");
  };

  const total = draft.size;

  return (
    <DialogShell
      isOpen
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      aria-label="Choose cards to print"
      size="lg"
      height={{ fixed: "min(70vh, 640px)" }}
      bleed
    >
      {() => (
        <div className={styles.modal}>
          <div className={styles.filterRow}>
            <RadioGroup
              className={styles.kindGroup}
              aria-label="Filter by card kind"
              value={kind}
              onChange={(v) => setKind(v as DeckKindFilter)}
            >
              <Radio value="all" className={styles.chip}>
                All
              </Radio>
              <Radio value="item" className={styles.chip}>
                Items
              </Radio>
              <Radio value="spell" className={styles.chip}>
                Spells
              </Radio>
            </RadioGroup>
            <div className={styles.searchField}>
              <label htmlFor={searchId}>Search cards</label>
              <Input
                id={searchId}
                type="search"
                placeholder="Search cards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.sortLabel}>
              <label htmlFor={sortId}>Sort</label>
              <select
                id={sortId}
                className={styles.sortSelect}
                value={sort}
                onChange={(e) => setSort(e.target.value as DeckSort)}
              >
                <option value="updated">Recently edited</option>
                <option value="name">Name A→Z</option>
              </select>
            </div>
          </div>

          <div className={styles.bulkRow}>
            <Checkbox
              aria-label="Select all shown cards"
              isSelected={allVisibleChecked}
              isIndeterminate={headerIndeterminate}
              onChange={onHeaderToggle}
            />
            <span className={styles.shownCount}>
              {visibleCheckedCount} of {visible.length} shown
            </span>
          </div>

          <ul className={styles.list}>
            {visible.length === 0 ? (
              <li className={styles.emptyState}>No cards match.</li>
            ) : (
              visible.map((c) => (
                <li key={c.id} className={styles.row}>
                  <Checkbox isSelected={draft.has(c.id)} onChange={() => toggle(c.id)}>
                    {c.name}
                  </Checkbox>
                  <span className={styles.rowKind} aria-hidden="true">
                    {c.kind}
                  </span>
                  <time className={styles.rowTime} dateTime={c.updatedAt}>
                    {relativeTime(c.updatedAt)}
                  </time>
                </li>
              ))
            )}
          </ul>

          <div className={styles.footer}>
            {hiddenSelectedCount > 0 && (
              <p className={styles.hiddenLine}>
                {`${hiddenSelectedCount} selected ${hiddenSelectedCount === 1 ? "card" : "cards"} ${
                  hiddenSelectedCount === 1 ? "is" : "are"
                } hidden by filters — still included when you Apply.`}{" "}
                <button type="button" className={styles.clearFiltersLink} onClick={clearFilters}>
                  Clear filters
                </button>
              </p>
            )}
            <span className={styles.srOnly} aria-live="polite">
              {`${pluralize(total, "card")} selected`}
            </span>
            <div className={styles.footerActions}>
              <Button variant="secondary" onPress={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
              >
                {`Apply (${pluralize(total, "card")})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogShell>
  );
}
