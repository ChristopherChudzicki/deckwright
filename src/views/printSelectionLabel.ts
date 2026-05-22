const cardWord = (n: number) => (n === 1 ? "card" : "cards");

/** Sidebar count phrasing. `total` is the renderable-card count. */
export function selectionCountLabel(selected: number, total: number): string {
  if (selected === total) return `All ${total} ${cardWord(total)}`;
  return `${selected} of ${total} ${cardWord(total)}`;
}
