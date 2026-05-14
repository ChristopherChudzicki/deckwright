import { screen } from "@testing-library/react";

/**
 * Locate the `<dd>` that follows a stat-block `<dt>` with the given label text.
 *
 * The `{ selector: "dt" }` scoping is load-bearing: without it, when a record's
 * category or other value happens to share text with a stat label (e.g. faker
 * factory category "Weapon" with a "Weapon type" stat row), `getByText` finds
 * multiple matches and throws.
 */
export const dtWithin = (label: string): Element => {
  const dt = screen.getByText(label, { selector: "dt" });
  const dd = dt.nextElementSibling;
  if (!dd) throw new Error(`No <dd> after <dt>${label}`);
  return dd;
};
