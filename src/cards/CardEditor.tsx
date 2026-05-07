import { type ChangeEvent, useId } from "react";
import { nowIso } from "../lib/time";
import { IconPickerDialog } from "../lib/ui/IconPickerDialog";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import { Link } from "../lib/ui/Link";
import { TagInput } from "../lib/ui/TagInput";
import { Textarea } from "../lib/ui/Textarea";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import styles from "./CardEditor.module.css";
import { FALLBACK_ICON_KEY, pickIconKey } from "./iconRules";
import type { RenderableCard } from "./types";

type Props = {
  card: RenderableCard;
  onChange: (next: RenderableCard) => void;
};

type EditableField = "name" | "body";

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

  const handleKindChange = (next: "item" | "spell") => {
    if (next === card.kind) return;
    onChange({ ...card, kind: next, updatedAt: nowIso() } as RenderableCard);
  };

  const resolvedKey = card.iconKey ?? pickIconKey(card);
  const autoHint =
    resolvedKey === FALLBACK_ICON_KEY
      ? "No matching icon yet — auto is using the fallback. Pick one to override."
      : `Auto chose “${resolvedKey}” based on the card’s name and tags.`;

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
    typeLabel: `${idBase}-typeLabel`,
  };

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.label} id={ids.typeLabel}>
            Type
          </span>
          <ToggleButtonGroup
            aria-labelledby={ids.typeLabel}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[card.kind]}
            onSelectionChange={(keys) => {
              const next = Array.from(keys)[0];
              if (next === "item" || next === "spell") handleKindChange(next);
            }}
          >
            <ToggleButton id="item">Item</ToggleButton>
            <ToggleButton id="spell">Spell</ToggleButton>
          </ToggleButtonGroup>
        </div>
        <label className={`${styles.field} ${styles.nameField}`} htmlFor={ids.name}>
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
            <IconPickerDialog
              id={ids.icon}
              value={card.iconKey}
              autoHint={autoHint}
              onChange={handleIconChange}
            />
          </div>
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
          Supports{" "}
          <Link
            href="https://www.markdownguide.org/cheat-sheet/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Markdown
          </Link>{" "}
          — bold, italic, lists, tables.
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
    </form>
  );
}
