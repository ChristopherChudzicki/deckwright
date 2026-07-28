import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { corpusModel, mergeDescriptions, readDescriptions, writeDescriptions } from "./store";

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "icon-store-"));
  path = join(dir, "icon-descriptions.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const MODEL = "claude-sonnet-5";

describe("readDescriptions", () => {
  test("treats a missing file as empty", () => {
    expect(readDescriptions(path)).toEqual({});
  });

  // `--out` takes any path, so the file named may not be a corpus at all. Left
  // unchecked, its keys would read as described icons and the first merge would
  // rename a corpus over it.
  test("refuses a JSON file that is not a map of descriptions", () => {
    writeFileSync(path, JSON.stringify({ name: "deckwright", scripts: { build: "vite" } }), "utf8");
    expect(() => readDescriptions(path)).toThrow(/not a description file/);
  });
});

describe("mergeDescriptions", () => {
  // The whole run's accumulated work rides on this: each batch merges into
  // whatever is already on disk rather than replacing it.
  test("keeps entries written by earlier batches", () => {
    mergeDescriptions(path, { fireball: "A ball of flame." }, MODEL);
    mergeDescriptions(path, { broadsword: "A large sword." }, MODEL);

    expect(readDescriptions(path)).toEqual({
      fireball: "A ball of flame.",
      broadsword: "A large sword.",
    });
  });

  test("lets a later entry replace an earlier one for the same icon", () => {
    mergeDescriptions(path, { fireball: "A ball of flame." }, MODEL);
    mergeDescriptions(path, { fireball: "A sphere of fire." }, MODEL);

    expect(readDescriptions(path)).toEqual({ fireball: "A sphere of fire." });
  });

  // A corpus holding two models' work is indistinguishable afterwards from one
  // holding either, and it silently voids the cross-model comparison that is the
  // only reason to generate twice.
  test("refuses to merge a second model into a corpus another model wrote", () => {
    mergeDescriptions(path, { fireball: "A ball of flame." }, MODEL);

    expect(() =>
      mergeDescriptions(path, { broadsword: "A large sword." }, "claude-opus-5"),
    ).toThrow(/was written by claude-sonnet-5/);
    expect(readDescriptions(path)).toEqual({ fireball: "A ball of flame." });
  });

  test("records which model wrote the corpus", () => {
    mergeDescriptions(path, { fireball: "A ball of flame." }, MODEL);
    expect(corpusModel(path)).toBe(MODEL);
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
