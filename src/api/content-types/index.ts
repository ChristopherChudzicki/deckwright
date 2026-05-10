import { magicItemsContentType } from "./magic-items";
import { spellsContentType } from "./spells";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly [ContentType, ...ContentType[]] = [
  magicItemsContentType,
  spellsContentType,
];

export type { ContentRow, ContentType, ContentTypeResults } from "./types";
