import { useMemo, useState } from "react";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Button as RACButton,
  TextField,
} from "react-aria-components";
import type { CardId, RenderableCard } from "../cards/types";
import { type DeckKindFilter, type DeckSort, deckListing } from "../decks/deckListing";
import { pluralize } from "../lib/pluralize";
import { relativeTime } from "../lib/relativeTime";
import { Button } from "../lib/ui/Button";
import { Checkbox } from "../lib/ui/Checkbox";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
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

  const { cards: listed, counts } = useMemo(
    () => deckListing(cards, { kind, sort }),
    [cards, kind, sort],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? listed.filter((c) => c.name.toLowerCase().includes(q)) : listed;
  }, [listed, search]);

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
        <div className={styles.modalContainer}>
          <DialogHeader title="Choose cards to print" onClose={onClose} />

          <div className={styles.searchRow}>
            <TextField aria-label="Search cards" className={styles.searchField}>
              <Input
                type="search"
                placeholder="Search cards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </TextField>
          </div>

          <div className={styles.toolbar}>
            <ToggleButtonGroup
              aria-label="Filter by kind"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[kind]}
              onSelectionChange={(keys) => {
                const next = Array.from(keys)[0];
                if (next === "all" || next === "item" || next === "spell") setKind(next);
              }}
            >
              <ToggleButton id="all">All ({counts.all})</ToggleButton>
              <ToggleButton id="item">Items ({counts.item})</ToggleButton>
              <ToggleButton id="spell">Spells ({counts.spell})</ToggleButton>
            </ToggleButtonGroup>
            <MenuTrigger>
              <RACButton className={styles.sortTrigger}>
                Sort: {sort === "updated" ? "Recently edited" : "Name"}{" "}
                <span aria-hidden="true">▾</span>
              </RACButton>
              <Popover className={styles.sortPopover} placement="bottom end">
                <Menu
                  className={styles.sortMenu}
                  onAction={(key) => {
                    if (key === "updated") setSort("updated");
                    else if (key === "name") setSort("name");
                  }}
                >
                  <MenuItem id="updated" className={styles.sortMenuItem}>
                    Recently edited
                  </MenuItem>
                  <MenuItem id="name" className={styles.sortMenuItem}>
                    Name
                  </MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>
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
            {visible.length > 0 && (
              <span className={styles.colHeader} aria-hidden="true">
                Updated
              </span>
            )}
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
                    <span className={styles.srOnly}>{"Updated "}</span>
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
