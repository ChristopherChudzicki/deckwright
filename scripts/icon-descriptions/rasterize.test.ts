import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ensurePngs, iconNames, loadCollection, renderIcon } from "./rasterize";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "icon-cache-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadCollection", () => {
  test("returns the real collection, not the 2-icon test stub", () => {
    const names = iconNames(loadCollection());
    expect(names.length).toBeGreaterThan(4000);
    expect(names).toContain("fireball");
  });

  test("names are sorted", () => {
    const names = iconNames(loadCollection());
    expect(names).toEqual([...names].sort());
  });
});

describe("renderIcon", () => {
  test("renders a PNG at the requested size that is not blank", async () => {
    const png = await renderIcon(loadCollection(), "fireball", 512);

    const image = sharp(png);
    const meta = await image.metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);

    // The currentColor hazard: a missed substitution yields a pure white
    // square that is a valid PNG of the right size.
    const stats = await image.stats();
    const [red] = stats.channels;
    expect(red?.min).toBeLessThan(64);
    expect(red?.max).toBeGreaterThan(192);
  });

  test("rejects an icon that is not in the collection", async () => {
    await expect(renderIcon(loadCollection(), "not-an-icon", 512)).rejects.toThrow(/not-an-icon/);
  });
});

describe("ensurePngs", () => {
  test("writes one PNG per name and returns absolute paths", async () => {
    const { paths: result } = await ensurePngs({
      collection: loadCollection(),
      names: ["fireball", "broadsword"],
      size: 512,
      cacheDir: dir,
    });

    expect([...result.keys()].sort()).toEqual(["broadsword", "fireball"]);
    for (const path of result.values()) {
      expect(readFileSync(path).byteLength).toBeGreaterThan(0);
    }
  });

  test("reuses an existing PNG rather than re-rendering", async () => {
    const { paths: first } = await ensurePngs({
      collection: loadCollection(),
      names: ["fireball"],
      size: 512,
      cacheDir: dir,
    });
    const path = first.get("fireball") as string;
    writeFileSync(path, "sentinel");

    await ensurePngs({
      collection: loadCollection(),
      names: ["fireball"],
      size: 512,
      cacheDir: dir,
    });

    expect(readFileSync(path, "utf8")).toBe("sentinel");
  });

  test("discards the cache when the icon-set version changes", async () => {
    mkdirSync(join(dir, "png"), { recursive: true });
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ iconSetVersion: "0.0.0", size: 512 }));
    writeFileSync(join(dir, "png", "fireball.png"), "sentinel");

    const { paths } = await ensurePngs({
      collection: loadCollection(),
      names: ["fireball"],
      size: 512,
      cacheDir: dir,
    });

    expect((await sharp(paths.get("fireball") as string).metadata()).format).toBe("png");
  });

  test("treats a corrupt meta.json as a missing one", async () => {
    mkdirSync(join(dir, "png"), { recursive: true });
    writeFileSync(join(dir, "meta.json"), "{ truncated");
    writeFileSync(join(dir, "png", "fireball.png"), "sentinel");

    const { paths } = await ensurePngs({
      collection: loadCollection(),
      names: ["fireball"],
      size: 512,
      cacheDir: dir,
    });

    expect((await sharp(paths.get("fireball") as string).metadata()).format).toBe("png");
  });

  test("discards the cache when the render size changes", async () => {
    const { paths: first } = await ensurePngs({
      collection: loadCollection(),
      names: ["fireball"],
      size: 256,
      cacheDir: dir,
    });
    writeFileSync(first.get("fireball") as string, "sentinel");

    const { paths: second } = await ensurePngs({
      collection: loadCollection(),
      names: ["fireball"],
      size: 512,
      cacheDir: dir,
    });

    const meta = await sharp(second.get("fireball") as string).metadata();
    expect(meta.width).toBe(512);
  });
});
