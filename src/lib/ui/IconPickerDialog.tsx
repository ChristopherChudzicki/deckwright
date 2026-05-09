import { listIcons } from "@iconify/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DialogTrigger,
  GridLayout,
  GridList,
  GridListItem,
  SearchField,
  Size,
  Virtualizer,
} from "react-aria-components";
import { ensureIcons } from "../../cards/resolveIcon";
import { Button } from "./Button";
import { DialogHeader } from "./DialogHeader";
import { DialogShell } from "./DialogShell";
import styles from "./IconPickerDialog.module.css";
import { IconPreview } from "./IconPreview";
import { Input } from "./Input";

const AUTO_ID = "__auto__";

type Props = {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  id?: string;
  autoHint?: string;
};

export function IconPickerDialog({ value, onChange, id, autoHint }: Props) {
  const triggerLabel = value ?? "Auto";
  return (
    <DialogTrigger>
      <Button
        id={id}
        variant="secondary"
        size="sm"
        className={styles.trigger}
        aria-label={`Pick icon (currently ${triggerLabel})`}
      >
        <span className={styles.triggerLabel}>{triggerLabel}</span>
        <span aria-hidden="true">▾</span>
      </Button>
      <DialogShell aria-label="Pick an icon" size="lg" bleed>
        {({ close }) => (
          <PickerBody
            value={value}
            autoHint={autoHint}
            onChange={(next) => {
              onChange(next);
              close();
            }}
            onCancel={close}
          />
        )}
      </DialogShell>
    </DialogTrigger>
  );
}

type BodyProps = {
  value: string | undefined;
  autoHint: string | undefined;
  onChange: (next: string | undefined) => void;
  onCancel: () => void;
};

type Hovered = { label: string; top: number; left: number };

function PickerBody({ value, autoHint, onChange, onCancel }: BodyProps) {
  const selectedKey = value ?? AUTO_ID;
  const [search, setSearch] = useState("");
  const [keys, setKeys] = useState<readonly string[] | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ensureIcons().then(() => {
      setKeys(listIcons("", "game-icons").map((n) => n.replace("game-icons:", "")));
    });
  }, []);

  // Once icons are loaded, scroll the current tile into view (centered).
  // Tile size matches layoutOptions (minItemSize 60 + minSpace 8).
  useEffect(() => {
    if (!keys || selectedKey === AUTO_ID) return;
    const idx = keys.indexOf(selectedKey);
    if (idx < 0) return;
    const handle = requestAnimationFrame(() => {
      const grid = gridRef.current;
      if (!grid || grid.clientWidth === 0) return;
      const cell = 68;
      const cols = Math.max(1, Math.floor(grid.clientWidth / cell));
      const row = Math.floor((idx + 1) / cols);
      grid.scrollTop = Math.max(0, row * cell - grid.clientHeight / 2 + cell / 2);
    });
    return () => cancelAnimationFrame(handle);
  }, [keys, selectedKey]);

  const handleSearchChange = (next: string) => {
    setSearch(next);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  };

  // Event delegation: RAC's GridListItem doesn't forward onMouseEnter, so a
  // single handler on the wrapper walks up to find the tile via RAC's own
  // data-key attribute. Same handler runs for mouse hover and keyboard focus.
  const handleTileActivate = (e: { target: EventTarget | null }) => {
    const tile = (e.target as HTMLElement).closest?.<HTMLElement>("[data-key]");
    if (!tile) return;
    const label = tile.getAttribute("data-key");
    if (!label || label === AUTO_ID) {
      setHovered(null);
      return;
    }
    const rect = tile.getBoundingClientRect();
    setHovered({ label, top: rect.top, left: rect.left + rect.width / 2 });
  };
  const handleGridLeave = () => setHovered(null);

  const filtered = useMemo(() => {
    if (!keys) return [];
    if (!search) return keys;
    const q = search.toLowerCase();
    return keys.filter((k) => k.toLowerCase().includes(q));
  }, [keys, search]);
  const items = useMemo<{ id: string; label: string }[]>(
    () => [{ id: AUTO_ID, label: "Auto" }, ...filtered.map((k) => ({ id: k, label: k }))],
    [filtered],
  );

  const layoutOptions = useMemo(
    () => ({
      minItemSize: new Size(60, 60),
      minSpace: new Size(8, 8),
      preserveAspectRatio: true,
    }),
    [],
  );

  const handleAction = useCallback(
    (key: React.Key) => {
      const k = String(key);
      onChange(k === AUTO_ID ? undefined : k);
    },
    [onChange],
  );

  return (
    <>
      <DialogHeader title="Pick an icon" onClose={onCancel} />
      <div className={styles.controls}>
        <SearchField aria-label="Search icons" value={search} onChange={handleSearchChange}>
          <Input className={styles.searchSlot} />
        </SearchField>
      </div>
      {value === undefined && autoHint && <div className={styles.autoHint}>{autoHint}</div>}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Event delegation for tile tooltip; display:contents removes the wrapper from layout entirely. */}
      <div
        className={styles.tooltipDelegationWrapper}
        onMouseOver={handleTileActivate}
        onMouseLeave={handleGridLeave}
        onFocus={handleTileActivate}
        onBlur={handleGridLeave}
      >
        <Virtualizer layout={GridLayout} layoutOptions={layoutOptions}>
          <GridList
            ref={gridRef}
            aria-label="Icons"
            className={styles.grid}
            items={items}
            layout="grid"
            selectionMode="none"
            onAction={handleAction}
          >
            {(item) => (
              <GridListItem
                id={item.id}
                textValue={item.label}
                data-current={item.id === selectedKey ? "true" : undefined}
                className={`${styles.tile} ${item.id === AUTO_ID ? styles.autoTile : ""}`}
              >
                {item.id === AUTO_ID ? (
                  "Auto"
                ) : (
                  <IconPreview iconKey={item.id} label={item.label} size="lg" />
                )}
              </GridListItem>
            )}
          </GridList>
        </Virtualizer>
      </div>
      {hovered && (
        <div
          role="tooltip"
          className={styles.tooltip}
          style={{ top: hovered.top, left: hovered.left }}
        >
          {hovered.label}
        </div>
      )}
    </>
  );
}
