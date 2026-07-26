import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readDescriptions(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
}

// Re-reads before merging rather than trusting an in-memory copy: the file is
// the run's progress marker, so every accepted batch must survive a crash even
// though the run holds no accumulated state of its own.
export function mergeDescriptions(path: string, accepted: Record<string, string>): void {
  writeDescriptions(path, { ...readDescriptions(path), ...accepted });
}

export function writeDescriptions(path: string, descriptions: Record<string, string>): void {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(descriptions).sort()) sorted[key] = descriptions[key];

  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
