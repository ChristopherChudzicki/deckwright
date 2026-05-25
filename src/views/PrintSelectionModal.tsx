import { type ReactElement, useId, useMemo, useRef, useState } from "react";
import {
  type Key,
  ListBox,
  ListBoxItem,
  type ListBoxProps,
  type Selection,
  TextField,
} from "react-aria-components";
import type { Card, CardId, RenderableCard } from "../cards/types";
import { type DeckKindFilter, type DeckSort, deckListing } from "../decks/deckListing";
import { pluralize } from "../lib/pluralize";
import { relativeTime } from "../lib/relativeTime";
import { Button } from "../lib/ui/Button";
import { Checkbox } from "../lib/ui/Checkbox";
import { DialogHeader } from "../lib/ui/DialogHeader";
import { DialogShell } from "../lib/ui/DialogShell";
import { Input } from "../lib/ui/Input";
import { Select } from "../lib/ui/Select";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import styles from "./PrintSelectionModal.module.css";
import { mergeVisibleSelection } from "./printSelectionMerge";

type Props = {
  cards: RenderableCard[];
  initialSelection: Set<CardId>;
  onApply: (next: Set<CardId>) => void;
  onClose: () => void;
};

// RAC's ListBox honors react-stately's `allowDuplicateSelectionEvents` (fire
// onSelectionChange even when the result is unchanged — needed so a Shift-click
// that *deselects* an already-selected range still reaches our handler) but
// doesn't surface it on ListBox's prop types. Widen the type so we can pass it.
const SelectionListBox = ListBox as unknown as (
  props: ListBoxProps<Card> & { allowDuplicateSelectionEvents?: boolean },
) => ReactElement;

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
    const next = visibleCheckedCount > 0 ? new Set<CardId>() : ("all" as const);
    setDraft((prev) => mergeVisibleSelection(prev, visibleIds, next));
  };

  // The ListBox is controlled by `draft`. RAC records no anchor when a click
  // *deselects* an item, and its Shift-extend is additive-only, so we track our
  // own anchor (the last plain-clicked card, captured on pointerdown below) and
  // recompute Shift-click ranges ourselves. `shiftClickRef` flags that the change
  // came from a Shift+pointer (vs. Shift+Arrow, which stays additive via RAC).
  const anchorRef = useRef<CardId | null>(null);
  const shiftClickRef = useRef(false);

  const onSelectionChange = (keys: Selection) => {
    const fromShiftClick = shiftClickRef.current;
    shiftClickRef.current = false;

    // Cmd/Ctrl+A: expand the "all" sentinel to every visible id (∪ hidden).
    if (keys === "all") {
      setDraft((prev) => mergeVisibleSelection(prev, visibleIds, "all"));
      return;
    }

    // We store RAC's Selection object: it carries the range anchor (so rebuilding
    // a plain Set each render would break keyboard Shift+Arrow) and the
    // filter-hidden selected keys it rides through, keeping draft whole.
    const sel = keys as Set<CardId> & { anchorKey?: Key | null; currentKey?: Key | null };

    // Gmail-style range on a Shift+CLICK: the whole range from the anchor (the last
    // plain-clicked card, post-toggle) to the clicked card takes the ANCHOR's
    // current state — anchor selected → the range fills (incl. unselected cards in
    // between); anchor unselected → the range clears. RAC's native extend is
    // additive-only, so we recompute from the pre-click selection and overwrite its
    // result, keeping sel's anchor/current keys so keyboard Shift+Arrow still works.
    const anchor = anchorRef.current;
    const target = sel.currentKey as CardId | null | undefined; // the Shift-clicked card
    if (fromShiftClick && anchor != null && target != null && anchor !== target) {
      const from = visibleIds.indexOf(anchor);
      const to = visibleIds.indexOf(target);
      if (from !== -1 && to !== -1) {
        const range = visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
        const select = draft.has(anchor);
        sel.clear(); // drop RAC's additive result; keeps anchorKey/currentKey
        for (const id of draft) sel.add(id); // restore the pre-click selection (incl. hidden)
        for (const id of range) {
          if (select) sel.add(id);
          else sel.delete(id);
        }
      }
    }

    setDraft(sel);
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
  const shownCountId = useId();
  const hintId = useId();

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
            <Select
              label="Sort"
              selectedKey={sort}
              onSelectionChange={(key) => setSort(key as DeckSort)}
              items={[
                { id: "updated", label: "Recently edited" },
                { id: "name", label: "Name" },
              ]}
            />
          </div>

          <div className={styles.bulkRow}>
            <Checkbox
              aria-label="Select all shown cards"
              aria-describedby={shownCountId}
              isSelected={allVisibleChecked}
              isIndeterminate={headerIndeterminate}
              onChange={onHeaderToggle}
            />
            <span id={shownCountId} className={styles.shownCount}>
              {visibleCheckedCount} of {visible.length} shown
            </span>
            {visible.length > 0 && (
              <span className={styles.colHeader} aria-hidden="true">
                Updated
              </span>
            )}
          </div>

          <SelectionListBox
            aria-label="Cards to print"
            aria-describedby={visible.length > 0 ? hintId : undefined}
            className={styles.list}
            selectionMode="multiple"
            selectionBehavior="toggle"
            escapeKeyBehavior="none"
            allowDuplicateSelectionEvents
            selectedKeys={draft}
            onPointerDownCapture={(e) => {
              shiftClickRef.current = e.shiftKey;
              if (!e.shiftKey) {
                const el = (e.target as HTMLElement).closest("[data-card-id]");
                const id = el?.getAttribute("data-card-id");
                if (id) anchorRef.current = id as CardId;
              }
            }}
            onSelectionChange={onSelectionChange}
            items={visible}
            renderEmptyState={() => <span className={styles.emptyState}>No cards match.</span>}
          >
            {(c) => (
              <ListBoxItem id={c.id} textValue={c.name} className={styles.row} data-card-id={c.id}>
                <span className={styles.rowMain}>
                  <span className={styles.box} aria-hidden="true" />
                  <span className={styles.rowName}>{c.name}</span>
                </span>
                <span className={styles.rowKind} aria-hidden="true">
                  {c.kind}
                </span>
                <time className={styles.rowTime} dateTime={c.updatedAt} aria-hidden="true">
                  {relativeTime(c.updatedAt)}
                </time>
              </ListBoxItem>
            )}
          </SelectionListBox>

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
              {visible.length > 0 && (
                <p className={styles.hint} id={hintId}>
                  Shift-click or Shift+↑/↓ to select a range.
                </p>
              )}
              <Button variant="secondary" onPress={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  // Commit a plain Set: `draft` may be RAC's Selection subclass
                  // (it carries a range anchor), but downstream consumers want a
                  // bare Set<CardId>.
                  onApply(new Set(draft));
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
