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
// It reaches react-stately only via RAC's `{...props}` spread, so a RAC upgrade
// could silently drop it; the "clears the range" test guards that behavior.
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
    anchorRef.current = null; // bulk action — a later Shift-click starts a fresh range
    extentRef.current = null;
    const next = visibleCheckedCount > 0 ? new Set<CardId>() : ("all" as const);
    setDraft((prev) => mergeVisibleSelection(prev, visibleIds, next));
  };

  // The ListBox is controlled by `draft`. RAC records no anchor when a click
  // *deselects* an item, and its Shift-extend is additive-only, so we manage
  // Shift-click ranges ourselves, Gmail-style:
  //   • anchorRef  — the last plain-clicked card (the fixed end of the range).
  //   • extentRef  — the last Shift-clicked card (the moving end); lets us tell an
  //                  extend from a shrink.
  //   • baseDraftRef — the selection snapshot when the anchor was set, so every
  //                  Shift-click re-bases off it instead of stacking.
  //   • shiftClickRef — set on a Shift+pointerdown that lands on a row (vs.
  //                  Shift+Arrow, which RAC handles as an additive extend).
  const anchorRef = useRef<CardId | null>(null);
  const extentRef = useRef<CardId | null>(null);
  const baseDraftRef = useRef<Set<CardId>>(new Set(initialSelection));
  const shiftClickRef = useRef(false);

  const onSelectionChange = (keys: Selection) => {
    const fromShiftClick = shiftClickRef.current;
    shiftClickRef.current = false;

    // Cmd/Ctrl+A: expand the "all" sentinel to every visible id (∪ hidden). Bulk
    // select-all resets the range anchor.
    if (keys === "all") {
      anchorRef.current = null;
      extentRef.current = null;
      const next = mergeVisibleSelection(draft, visibleIds, "all");
      baseDraftRef.current = new Set(next);
      setDraft(next);
      return;
    }

    // `sel` is RAC's Selection — we keep the object (it carries the range anchor,
    // so rebuilding a plain Set would break keyboard Shift+Arrow).
    const sel = keys as Set<CardId> & { currentKey?: Key | null };
    const anchor = anchorRef.current;
    const target = sel.currentKey as CardId | null | undefined; // the Shift-clicked card

    // Gmail-style range on a Shift+CLICK: the range from the anchor takes the
    // ANCHOR's state (selected → fill, incl. cards in between; deselected → clear),
    // rebuilt from `baseDraftRef` so consecutive Shift-clicks re-base. Extending the
    // range includes the clicked card; shrinking it back inward excludes the clicked
    // card and drops everything out to the previous extent.
    if (fromShiftClick && target != null) {
      // Record the new moving end for the NEXT shrink/extend test, reading the
      // previous extent first. Done even when the override below bails (e.g. a
      // Shift-click on the anchor itself) so a stale extent can't misread the next
      // Shift-click as a shrink.
      const prevExtentId = extentRef.current;
      extentRef.current = target;

      const aIdx = anchor != null ? visibleIds.indexOf(anchor) : -1;
      const tIdx = visibleIds.indexOf(target);
      if (anchor != null && anchor !== target && aIdx !== -1 && tIdx !== -1) {
        const base = baseDraftRef.current;
        const select = base.has(anchor);
        const eIdx = prevExtentId != null ? visibleIds.indexOf(prevExtentId) : -1;
        const dirT = Math.sign(tIdx - aIdx);
        const shrinking =
          eIdx !== -1 &&
          dirT === Math.sign(eIdx - aIdx) &&
          Math.abs(tIdx - aIdx) < Math.abs(eIdx - aIdx);
        const boundaryIdx = shrinking ? tIdx - dirT : tIdx; // shrink steps one back toward the anchor
        const region = new Set(
          visibleIds.slice(Math.min(aIdx, boundaryIdx), Math.max(aIdx, boundaryIdx) + 1),
        );
        const visibleIdSet = new Set(visibleIds);
        sel.clear();
        // Preserve currently-hidden selected cards (filters never drop selections) —
        // including ones a previous Shift-range selected, which aren't in `base`.
        for (const id of draft) if (!visibleIdSet.has(id)) sel.add(id);
        // Re-base the visible rows from the snapshot; the region takes the anchor's state.
        for (const id of visibleIds) {
          if (region.has(id) ? select : base.has(id)) sel.add(id);
        }
        setDraft(sel);
        return;
      }
    }

    // Plain/Cmd toggle or keyboard change: store RAC's result as-is, and snapshot
    // it as the base for any subsequent Shift-click range.
    if (!fromShiftClick) baseDraftRef.current = new Set(sel);
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
              // Only treat this as a Shift-click range when an actual option is
              // hit, so a stray Shift+pointerdown on list chrome can't leave the
              // flag set for a later (e.g. keyboard) change.
              const id = (e.target as HTMLElement)
                .closest("[data-card-id]")
                ?.getAttribute("data-card-id");
              if (e.shiftKey) {
                shiftClickRef.current = id != null;
              } else {
                shiftClickRef.current = false;
                if (id) {
                  anchorRef.current = id as CardId;
                  extentRef.current = id as CardId; // a plain click resets the range to itself
                }
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
                  Shift-click to fill or clear a range; Shift+↑/↓ to extend.
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
