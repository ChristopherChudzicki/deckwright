import "@github/markdown-toolbar-element";
import type { RefObject } from "react";
import { BoldIcon } from "../lib/ui/icons/BoldIcon";
import { BulletListIcon } from "../lib/ui/icons/BulletListIcon";
import { ItalicIcon } from "../lib/ui/icons/ItalicIcon";
import { NumberedListIcon } from "../lib/ui/icons/NumberedListIcon";
import styles from "./MarkdownToolbar.module.css";

type Props = {
  htmlFor: string;
  boldRef?: RefObject<HTMLElement | null>;
  italicRef?: RefObject<HTMLElement | null>;
};

export function MarkdownToolbar({ htmlFor, boldRef, italicRef }: Props) {
  return (
    <markdown-toolbar
      for={htmlFor}
      role="toolbar"
      aria-label="Formatting"
      className={styles.toolbar}
    >
      <md-bold
        ref={boldRef}
        role="button"
        tabIndex={0}
        className={styles.button}
        aria-label="Bold (⌘B)"
      >
        <BoldIcon />
      </md-bold>
      <md-italic
        ref={italicRef}
        role="button"
        tabIndex={-1}
        className={styles.button}
        aria-label="Italic (⌘I)"
      >
        <ItalicIcon />
      </md-italic>
      <md-unordered-list
        role="button"
        tabIndex={-1}
        className={styles.button}
        aria-label="Bullet list"
      >
        <BulletListIcon />
      </md-unordered-list>
      <md-ordered-list
        role="button"
        tabIndex={-1}
        className={styles.button}
        aria-label="Numbered list"
      >
        <NumberedListIcon />
      </md-ordered-list>
    </markdown-toolbar>
  );
}
