import styles from "./Card.module.css";

/**
 * HTML for the invisible float pair that carves out a bottom-right wrap
 * exclusion inside `.body` (matched by the absolute-positioned `.qrCorner`).
 * Used by Card.tsx (when rendering without pagination) and by expandCard.ts
 * (so layoutPaginate measures body capacity *with* the exclusion in place).
 *
 * Two elements rather than one: a zero-width pusher reserves vertical space
 * on the right column so the subsequent floated reserve drops to the bottom.
 * The zero-width pusher means block-level children (tables, DLs) are not
 * pushed below the float — see Card.module.css for the full rationale.
 *
 * `data-pagination-skip="true"` is honored by `collectBreakCandidates` — the
 * floated decorations are out of normal flow and must not appear as candidate
 * split points.
 */
export function qrFloatHtml(): string {
  return (
    `<div class="${styles.qrPusher}" data-pagination-skip="true" aria-hidden="true"></div>` +
    `<div class="${styles.qrReserve}" data-pagination-skip="true" aria-hidden="true"></div>`
  );
}
