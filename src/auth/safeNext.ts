// Restrict `next` to a relative same-origin path. Rejects:
//  - protocol-relative URLs ("//evil.com")
//  - absolute URLs ("https://evil.com", "http://...")
//  - backslash-prefixed paths ("/\\evil.com" — IE/Edge quirk)
//  - empty / non-string
// Returns "/" for any rejected input.
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.startsWith("/\\")) return "/";
  return raw;
}

export function readNextFromUrl(): string {
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}
