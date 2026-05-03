export type BaseHint =
  | { kind: "specific"; hint: string }
  | { kind: "any"; hint: string }
  | { kind: "none"; hint: "" };

const RE = /^(?:Weapon|Armor)\s*\(([^)]+)\)/i;

export const parseBaseHint = (desc0: string | undefined): BaseHint => {
  if (!desc0) return { kind: "none", hint: "" };
  const match = RE.exec(desc0.trim());
  if (!match) return { kind: "none", hint: "" };
  const inner = match[1].trim().toLowerCase();
  if (inner.startsWith("any ")) {
    return { kind: "any", hint: inner.slice(4).trim() };
  }
  return { kind: "specific", hint: inner };
};
