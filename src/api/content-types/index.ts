import { itemsContentType } from "./items";
import { spellsContentType } from "./spells";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly [ContentType, ...ContentType[]] = [
  itemsContentType,
  spellsContentType,
];

export type { ContentRow, ContentType, ContentTypeResults } from "./types";
