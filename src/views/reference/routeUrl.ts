import type { ReferenceKind } from "../ReferenceView";

/**
 * Build the in-app path for a reference page. Use for SPA links via
 * TanStack Router's `<Link>`, OR see `referenceAbsoluteUrl` below for an
 * origin-prefixed URL suitable for encoding in a QR code.
 *
 * Example: `referenceRoutePath("magic-items", "srd-2024_wand-of-wonder")` →
 * `"/reference/magic-items/srd-2024_wand-of-wonder"`.
 *
 * The `key` is URI-encoded; SRD keys (`srd_<slug>` / `srd-2024_<slug>`) only
 * contain unreserved characters today, so the encoding is a no-op in practice.
 * The defensive encode protects against future key shapes that include
 * reserved characters.
 */
export function referenceRoutePath(kind: ReferenceKind, key: string): string {
  return `/reference/${kind}/${encodeURIComponent(key)}`;
}

/**
 * Build the absolute URL for a reference page using the current
 * `window.location.origin`. Used by the SRD import mappers to seed
 * `Card.referenceUrl`, which the print layout encodes as a QR code.
 *
 * The origin is captured at import time. If the deploy domain changes, prior
 * imports retain the old origin until re-imported — acceptable for this app's
 * scope.
 */
export function referenceAbsoluteUrl(kind: ReferenceKind, key: string): string {
  return `${window.location.origin}${referenceRoutePath(kind, key)}`;
}
