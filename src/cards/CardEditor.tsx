import { type ChangeEvent, useId } from "react";
import { nowIso } from "../lib/time";
import { IconPickerDialog } from "../lib/ui/IconPickerDialog";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import { TagInput } from "../lib/ui/TagInput";
import { Textarea } from "../lib/ui/Textarea";
import styles from "./CardEditor.module.css";
import { FALLBACK_ICON_KEY, pickIconKey } from "./iconRules";
import type { RenderableCard } from "./types";

type Props = {
  card: RenderableCard;
  onChange: (next: RenderableCard) => void;
};

type EditableField = "name" | "body" | "imageUrl";

export function CardEditor({ card, onChange }: Props) {
  const handle =
    (field: EditableField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({ ...card, [field]: e.target.value, updatedAt: nowIso() });
    };

  const handleIconChange = (next: string | undefined) => {
    onChange({ ...card, iconKey: next, updatedAt: nowIso() });
  };

  const handleHeaderTagsChange = (next: string[]) => {
    onChange({ ...card, headerTags: next, updatedAt: nowIso() });
  };

  const handleFooterTagsChange = (next: string[]) => {
    onChange({ ...card, footerTags: next, updatedAt: nowIso() });
  };

  const resolvedKey = card.iconKey ?? pickIconKey(card);
  const showHint = card.iconKey === undefined && resolvedKey !== FALLBACK_ICON_KEY;

  const idBase = useId();
  const ids = {
    name: `${idBase}-name`,
    headerTags: `${idBase}-headerTags`,
    headerTagsLabel: `${idBase}-headerTagsLabel`,
    headerTagsHelp: `${idBase}-headerTagsHelp`,
    icon: `${idBase}-icon`,
    body: `${idBase}-body`,
    bodyHelp: `${idBase}-bodyHelp`,
    footerTags: `${idBase}-footerTags`,
    footerTagsLabel: `${idBase}-footerTagsLabel`,
    footerTagsHelp: `${idBase}-footerTagsHelp`,
    imageUrl: `${idBase}-imageUrl`,
  };

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <div className={styles.row}>
        <label className={styles.field} htmlFor={ids.name}>
          <span className={styles.label}>Name</span>
          <Input
            id={ids.name}
            value={card.name}
            onChange={handle("name")}
            placeholder="Untitled item"
          />
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
      <div className={styles.field}>
        <span className={styles.label} id={ids.headerTagsLabel}>
          Header tags
        </span>
        <TagInput
          id={ids.headerTags}
          aria-labelledby={ids.headerTagsLabel}
          aria-describedby={ids.headerTagsHelp}
          value={card.headerTags}
          onChange={handleHeaderTagsChange}
          placeholder="Type and press Enter — e.g. Weapon, 1d6 piercing, requires attunement"
        />
        <span id={ids.headerTagsHelp} className={styles.help}>
          Suggested order: type, damage/AC, attunement.
        </span>
      </div>
      <label className={styles.field} htmlFor={ids.body}>
        <span className={styles.label}>Body</span>
        <Textarea
          id={ids.body}
          aria-describedby={ids.bodyHelp}
          value={card.body}
          onChange={handle("body")}
          rows={8}
        />
        <span id={ids.bodyHelp} className={styles.help}>
          Supports Markdown — bold, italic, lists, tables.
        </span>
      </label>
      <div className={styles.field}>
        <span className={styles.label} id={ids.footerTagsLabel}>
          Footer tags
        </span>
        <TagInput
          id={ids.footerTags}
          aria-labelledby={ids.footerTagsLabel}
          aria-describedby={ids.footerTagsHelp}
          value={card.footerTags}
          onChange={handleFooterTagsChange}
          placeholder="Type and press Enter — e.g. rare, 100 gp, 10 lb"
        />
        <span id={ids.footerTagsHelp} className={styles.help}>
          Suggested order: rarity, cost, weight.
        </span>
      </div>
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
