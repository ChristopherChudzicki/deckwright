export type BaseHint =
  | { kind: "specific"; hint: string; source: string }
  | { kind: "any"; hint: string; source: string }
  | { kind: "none"; hint: ""; source: "" };

const RE = /^(?:Weapon|Armor)\s*\(([^)]+)\)/i;

export const parseBaseHint = (desc0: string | undefined): BaseHint => {
  if (!desc0) return { kind: "none", hint: "", source: "" };
  const match = RE.exec(desc0.trim());
  if (!match) return { kind: "none", hint: "", source: "" };
  const source = match[0]!.trim();
  const inner = match[1]!.trim().toLowerCase();
  if (inner.startsWith("any ")) {
    return { kind: "any", hint: inner.slice(4).trim(), source };
  }
  return { kind: "specific", hint: inner, source };
};
