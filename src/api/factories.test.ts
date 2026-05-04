import { describe, expect, test } from "vitest";
import {
  magicItemDetailFactory,
  magicItemIndexEntryFactory,
  magicItemIndexFactory,
} from "./factories";

describe("magicItemIndexEntryFactory", () => {
  test("produces unique keys across builds", () => {
    const a = magicItemIndexEntryFactory.build();
    const b = magicItemIndexEntryFactory.build();
    expect(a.key).not.toBe(b.key);
  });
});

describe("magicItemIndexFactory", () => {
  test("count equals results length", () => {
    const idx = magicItemIndexFactory.build({}, { transient: { size: 5 } });
    expect(idx.results).toHaveLength(5);
    expect(idx.count).toBe(5);
  });
});

describe("magicItemDetailFactory", () => {
  test("defaults ruleset to '2024' and exposes a string desc", () => {
    const d = magicItemDetailFactory.build();
    expect(d.ruleset).toBe("2024");
    expect(typeof d.desc).toBe("string");
  });

  test("ruleset can be overridden", () => {
    const d = magicItemDetailFactory.build({ ruleset: "2014" });
    expect(d.ruleset).toBe("2014");
  });
});
