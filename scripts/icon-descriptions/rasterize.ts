import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { IconifyJSON } from "@iconify/types";
import sharp from "sharp";

export const DEFAULT_RENDER_SIZE = 512;

const require = createRequire(import.meta.url);

export function loadCollection(): IconifyJSON {
  return JSON.parse(
    readFileSync(require.resolve("@iconify-json/game-icons/icons.json"), "utf8"),
  ) as IconifyJSON;
}

export function iconNames(collection: IconifyJSON): string[] {
  return Object.keys(collection.icons).sort();
}

export async function renderIcon(
  collection: IconifyJSON,
  name: string,
  size: number,
): Promise<Buffer> {
  const icon = collection.icons[name];
  if (!icon) throw new Error(`icon not in collection: ${name}`);
  // Every icon fills with currentColor; sharp has no cascade to resolve it
  // against, so an unsubstituted body renders as a blank square.
  const body = icon.body.replaceAll("currentColor", "#000");
  const width = icon.width ?? collection.width ?? 512;
  const height = icon.height ?? collection.height ?? 512;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${size}" height="${size}">${body}</svg>`;
  return sharp(Buffer.from(svg)).flatten({ background: "#fff" }).png().toBuffer();
}

type CacheMeta = { iconSetVersion: string; size: number };

function currentMeta(size: number): CacheMeta {
  const pkg = JSON.parse(
    readFileSync(require.resolve("@iconify-json/game-icons/package.json"), "utf8"),
  ) as { version: string };
  return { iconSetVersion: pkg.version, size };
}

function readMeta(path: string): CacheMeta | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CacheMeta;
  } catch {
    return null;
  }
}

export async function ensurePngs(opts: {
  collection: IconifyJSON;
  names: readonly string[];
  size: number;
  cacheDir: string;
}): Promise<Map<string, string>> {
  const { collection, names, size, cacheDir } = opts;
  const metaPath = join(cacheDir, "meta.json");
  const pngDir = join(cacheDir, "png");
  const wanted = currentMeta(size);
  const existing = readMeta(metaPath);

  // The cache key is the icon name, which covers neither the artwork nor the
  // render settings — so a version or size change must invalidate wholesale.
  if (
    !existing ||
    existing.iconSetVersion !== wanted.iconSetVersion ||
    existing.size !== wanted.size
  ) {
    rmSync(pngDir, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(metaPath, `${JSON.stringify(wanted, null, 2)}\n`, "utf8");
  }
  mkdirSync(pngDir, { recursive: true });

  const paths = new Map<string, string>();
  for (const name of names) {
    const path = resolve(pngDir, `${name}.png`);
    if (!existsSync(path)) writeFileSync(path, await renderIcon(collection, name, size));
    paths.set(name, path);
  }
  return paths;
}
