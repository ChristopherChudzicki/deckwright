import { allContentType } from "./AllResults";
import { itemsContentType } from "./ItemsResults";
import { spellsContentType } from "./SpellsResults";
import type { ContentType } from "./types";

export const CONTENT_TYPES: readonly [ContentType, ...ContentType[]] = [
  allContentType,
  itemsContentType,
  spellsContentType,
];
