import { pluralize } from "../lib/pluralize";

/** Sidebar count phrasing. `total` is the renderable-card count. */
export function selectionCountLabel(selected: number, total: number): string {
  if (selected === total) return `All ${pluralize(total, "card")}`;
  return `${selected} of ${pluralize(total, "card")}`;
}
