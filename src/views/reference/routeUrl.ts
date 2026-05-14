import type { ReferenceKind } from "../ReferenceView";

/**
 * Build the in-app path for a reference page. Use for SPA links via
 * TanStack Router's `<Link>`, OR concatenate with `window.location.origin`
 * for an absolute URL suitable for encoding in a QR code.
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
