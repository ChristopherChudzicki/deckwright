import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readDescriptions, writeDescriptions } from "./store";

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "icon-store-"));
  path = join(dir, "icon-descriptions.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readDescriptions", () => {
  test("treats a missing file as empty", () => {
    expect(readDescriptions(path)).toEqual({});
  });

  test("round-trips what was written", () => {
    writeDescriptions(path, { fireball: "A ball of flame." });
    expect(readDescriptions(path)).toEqual({ fireball: "A ball of flame." });
  });
});

describe("writeDescriptions", () => {
  test("sorts keys regardless of insertion order", () => {
    writeDescriptions(path, { fireball: "b", "fire-bolt": "a", firebomb: "c" });
    expect(Object.keys(readDescriptions(path))).toEqual(["fire-bolt", "fireball", "firebomb"]);
  });

  test("matches the repo's JSON serialization exactly", () => {
    writeDescriptions(path, { fireball: "A ball of flame." });
    expect(readFileSync(path, "utf8")).toBe('{\n  "fireball": "A ball of flame."\n}\n');
  });

  test("leaves no temp file behind", () => {
    writeDescriptions(path, { fireball: "A ball of flame." });
    expect(() => readFileSync(`${path}.tmp`, "utf8")).toThrow();
  });

  test("a merged write keeps entries from an earlier write", () => {
    writeDescriptions(path, { fireball: "A ball of flame." });
    const merged = { ...readDescriptions(path), broadsword: "A large sword." };
    writeDescriptions(path, merged);

    expect(readDescriptions(path)).toEqual({
      broadsword: "A large sword.",
      fireball: "A ball of flame.",
    });
  });

  test("does not truncate an existing file when the new content is shorter", () => {
    writeFileSync(path, `${JSON.stringify({ a: "x".repeat(500) }, null, 2)}\n`);
    writeDescriptions(path, { a: "short" });
    expect(readDescriptions(path)).toEqual({ a: "short" });
  });
});
