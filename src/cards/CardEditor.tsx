import { type ChangeEvent, type KeyboardEvent, useId, useRef } from "react";
import { nowIso } from "../lib/time";
import { IconPickerDialog } from "../lib/ui/IconPickerDialog";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import { Link } from "../lib/ui/Link";
import { TagInput } from "../lib/ui/TagInput";
import { Textarea } from "../lib/ui/Textarea";
import { ToggleButton } from "../lib/ui/ToggleButton";
import { ToggleButtonGroup } from "../lib/ui/ToggleButtonGroup";
import { referenceAbsoluteUrl } from "../views/reference/routeUrl";
import styles from "./CardEditor.module.css";
import { FALLBACK_ICON_KEY, pickIconKey } from "./iconRules";
import { MarkdownToolbar } from "./MarkdownToolbar";
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

  const handleReferenceUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onChange({
      ...card,
      referenceUrl: value === "" ? undefined : value,
      updatedAt: nowIso(),
    });
  };

  const srdReferenceUrl = card.apiRef
    ? referenceAbsoluteUrl(card.apiRef.kind, card.apiRef.slug)
    : undefined;
  const canResetReferenceUrl =
    srdReferenceUrl !== undefined && card.referenceUrl !== srdReferenceUrl;

  const handleResetReferenceUrl = () => {
    if (!srdReferenceUrl) return;
    onChange({ ...card, referenceUrl: srdReferenceUrl, updatedAt: nowIso() });
  };

  const handleDisconnectApiRef = () => {
    onChange({ ...card, apiRef: undefined, updatedAt: nowIso() });
  };

  const handleKindChange = (next: "item" | "spell") => {
    if (next === card.kind) return;
    onChange({ ...card, kind: next, updatedAt: nowIso() } as RenderableCard);
  };

  const resolvedKey = card.iconKey ?? pickIconKey(card);
  const autoHint =
    resolvedKey === FALLBACK_ICON_KEY
      ? "Auto: fallback (no match yet — pick one to override)"
      : `Auto: ${resolvedKey} (based on the card’s name and tags)`;

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
    referenceUrl: `${idBase}-referenceUrl`,
    referenceUrlHelp: `${idBase}-referenceUrlHelp`,
    typeLabel: `${idBase}-typeLabel`,
  };

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const boldRef = useRef<HTMLElement>(null);
  const italicRef = useRef<HTMLElement>(null);

  const onBodyKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b") {
      e.preventDefault();
      boldRef.current?.click();
    } else if (k === "i") {
      e.preventDefault();
      italicRef.current?.click();
    }
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
        <MarkdownToolbar htmlFor={ids.body} boldRef={boldRef} italicRef={italicRef} />
        <Textarea
          ref={bodyRef}
          id={ids.body}
          aria-describedby={ids.bodyHelp}
          value={card.body}
          onChange={handle("body")}
          onKeyDown={onBodyKeyDown}
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
      <label className={styles.field} htmlFor={ids.referenceUrl}>
        <span className={styles.label}>Reference link</span>
        <Input
          id={ids.referenceUrl}
          aria-describedby={ids.referenceUrlHelp}
          value={card.referenceUrl ?? ""}
          onChange={handleReferenceUrlChange}
          placeholder="https://…"
        />
        <span id={ids.referenceUrlHelp} className={styles.help}>
          Rendered as a QR code in the card’s bottom-right corner. Leave blank to omit.
          {card.apiRef && (
            <>
              {" "}
              This item was imported.
              {canResetReferenceUrl && (
                <>
                  {" "}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={handleResetReferenceUrl}
                  >
                    Restore original link
                  </button>
                </>
              )}{" "}
              {canResetReferenceUrl ? "or " : ""}
              <button type="button" className={styles.linkButton} onClick={handleDisconnectApiRef}>
                {canResetReferenceUrl ? "permanently disconnect" : "Permanently disconnect"}
              </button>
              {canResetReferenceUrl ? " from import to remove this option." : " from import."}
            </>
          )}
        </span>
      </label>
    </form>
  );
}
