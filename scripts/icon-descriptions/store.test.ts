import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mergeDescriptions, readDescriptions, writeDescriptions } from "./store";

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
});

describe("mergeDescriptions", () => {
  // The whole run's accumulated work rides on this: each batch merges into
  // whatever is already on disk rather than replacing it.
  test("keeps entries written by earlier batches", () => {
    mergeDescriptions(path, { fireball: "A ball of flame." });
    mergeDescriptions(path, { broadsword: "A large sword." });

    expect(readDescriptions(path)).toEqual({
      fireball: "A ball of flame.",
      broadsword: "A large sword.",
    });
  });

  test("lets a later entry replace an earlier one for the same icon", () => {
    mergeDescriptions(path, { fireball: "A ball of flame." });
    mergeDescriptions(path, { fireball: "A sphere of fire." });

    expect(readDescriptions(path)).toEqual({ fireball: "A sphere of fire." });
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
});
