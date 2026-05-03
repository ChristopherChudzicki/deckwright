import { type ChangeEvent, useId } from "react";
import { nowIso } from "../lib/time";
import { IconPickerDialog } from "../lib/ui/IconPickerDialog";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import { Textarea } from "../lib/ui/Textarea";
import styles from "./ItemEditor.module.css";
import { FALLBACK_ICON_KEY, pickIconKey } from "./iconRules";
import type { ItemCard } from "./types";

type Props = {
  card: ItemCard;
  onChange: (next: ItemCard) => void;
};

type EditableField = "name" | "typeLine" | "body" | "costWeight" | "imageUrl";

export function ItemEditor({ card, onChange }: Props) {
  const handle =
    (field: EditableField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({ ...card, [field]: e.target.value, updatedAt: nowIso() });
    };

  const handleIconChange = (next: string | undefined) => {
    onChange({ ...card, iconKey: next, updatedAt: nowIso() });
  };

  const resolvedKey = card.iconKey ?? pickIconKey(card);
  const showHint = card.iconKey === undefined && resolvedKey !== FALLBACK_ICON_KEY;

  const idBase = useId();
  const ids = {
    name: `${idBase}-name`,
    typeLine: `${idBase}-typeLine`,
    icon: `${idBase}-icon`,
    body: `${idBase}-body`,
    costWeight: `${idBase}-costWeight`,
    imageUrl: `${idBase}-imageUrl`,
  };

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <div className={styles.row}>
        <label className={styles.field} htmlFor={ids.name}>
          <span className={styles.label}>Name</span>
          <Input id={ids.name} value={card.name} onChange={handle("name")} />
        </label>
        <label className={styles.field} htmlFor={ids.icon}>
          <span className={styles.label}>Icon</span>
          <div className={styles.iconRow}>
            <IconPreview iconKey={resolvedKey} label={resolvedKey} size="md" />
            <IconPickerDialog id={ids.icon} value={card.iconKey} onChange={handleIconChange} />
          </div>
          {showHint && <div className={styles.iconHint}>Currently auto-picking: {resolvedKey}</div>}
        </label>
      </div>
      <label className={styles.field} htmlFor={ids.typeLine}>
        <span className={styles.label}>Type line</span>
        <Input
          id={ids.typeLine}
          value={card.typeLine}
          onChange={handle("typeLine")}
          placeholder="Wondrous item, uncommon"
        />
      </label>
      <label className={styles.field} htmlFor={ids.body}>
        <span className={styles.label}>Body</span>
        <Textarea id={ids.body} value={card.body} onChange={handle("body")} rows={8} />
      </label>
      <label className={styles.field} htmlFor={ids.costWeight}>
        <span className={styles.label}>Cost / weight (optional)</span>
        <Input
          id={ids.costWeight}
          value={card.costWeight ?? ""}
          onChange={handle("costWeight")}
          placeholder="500 gp · 15 lb"
        />
      </label>
      <label className={styles.field} htmlFor={ids.imageUrl}>
        <span className={styles.label}>Image URL (optional)</span>
        <Input
          id={ids.imageUrl}
          value={card.imageUrl ?? ""}
          onChange={handle("imageUrl")}
          placeholder="https://…"
        />
      </label>
    </form>
  );
}
