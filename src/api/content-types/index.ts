import { magicItemsContentType } from "./magic-items";
import { mundaneItemsContentType } from "./mundane-items";
import { spellsContentType } from "./spells";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly [ContentType, ...ContentType[]] = [
  magicItemsContentType,
  mundaneItemsContentType,
  spellsContentType,
];

export type { ContentRow, ContentType, ContentTypeResults } from "./types";
