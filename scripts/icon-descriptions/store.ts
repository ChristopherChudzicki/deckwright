import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// The shape is checked, not assumed, because `--out` lets an operator name any
// path: pointing it at an unrelated JSON file would otherwise treat that file's
// keys as described icons and then atomically rename a corpus over it.
export function readDescriptions(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const entries =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? Object.entries(parsed)
      : undefined;
  if (!entries?.every(([, value]) => typeof value === "string")) {
    throw new Error(`${path} is not a description file: expected an object of strings.`);
  }
  return Object.fromEntries(entries);
}

// Which model wrote a corpus, kept beside it rather than inside it so the
// shipped artifact stays a plain name-to-description map.
const modelPath = (path: string): string => `${path}.model`;

export function corpusModel(path: string): string | undefined {
  return existsSync(modelPath(path)) ? readFileSync(modelPath(path), "utf8").trim() : undefined;
}

// Re-reads before merging rather than trusting an in-memory copy: the file is
// the run's progress marker, so every accepted batch must survive a crash even
// though the run holds no accumulated state of its own.
//
// The model is checked on every merge because a mixed corpus is undetectable
// afterwards and silently destroys the point of running two: selection sees
// undescribed icons, the spend rails see a scoped run, and `--validate` reads
// prose. Nothing downstream can tell one model's corpus from two models' halves.
export function mergeDescriptions(
  path: string,
  accepted: Record<string, string>,
  model: string,
): void {
  const wrote = corpusModel(path);
  if (wrote !== undefined && wrote !== model) {
    throw new Error(
      `${path} was written by ${wrote}; refusing to merge ${model} into it. ` +
        `Give each model its own --out.`,
    );
  }
  writeDescriptions(path, { ...readDescriptions(path), ...accepted });
  writeFileSync(modelPath(path), `${model}\n`, "utf8");
}

export function writeDescriptions(path: string, descriptions: Record<string, string>): void {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(descriptions).sort()) sorted[key] = descriptions[key];

  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
