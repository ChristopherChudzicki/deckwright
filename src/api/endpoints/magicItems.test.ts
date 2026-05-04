import { describe, expect, test } from "vitest";
import { magicItemSchema } from "../../data/srd-schema";
import { fetchMagicItemIndex } from "./magicItems";

describe("fetchMagicItemIndex", () => {
  test("returns the bundled 2024 SRD index", async () => {
    const result = await fetchMagicItemIndex("2024");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThan(0);
    expect(() => magicItemSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns the bundled 2014 SRD index", async () => {
    const result = await fetchMagicItemIndex("2014");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThan(0);
    expect(() => magicItemSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns different data for 2014 vs 2024", async () => {
    const v2014 = await fetchMagicItemIndex("2014");
    const v2024 = await fetchMagicItemIndex("2024");

    const keys2014 = new Set(v2014.results.map((e) => e.key));
    const keys2024 = new Set(v2024.results.map((e) => e.key));
    const overlap = [...keys2024].filter((k) => keys2014.has(k));
    expect(overlap.length).toBeLessThan(v2024.count);
  });
});
