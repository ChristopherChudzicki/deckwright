import { describe, expect, test } from "vitest";
import { mundaneItemSchema } from "../../data/srd-schema";
import { fetchMundaneItemIndex } from "./mundaneItems";

describe("fetchMundaneItemIndex", () => {
  test("returns the bundled 2024 SRD mundane index", async () => {
    const result = await fetchMundaneItemIndex("2024");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThanOrEqual(150);
    expect(() => mundaneItemSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns the bundled 2014 SRD mundane index", async () => {
    const result = await fetchMundaneItemIndex("2014");

    expect(result.count).toBe(result.results.length);
    expect(result.results.length).toBeGreaterThanOrEqual(150);
    expect(() => mundaneItemSchema.parse(result.results[0])).not.toThrow();
  });

  test("returns different data for 2014 vs 2024", async () => {
    const v2014 = await fetchMundaneItemIndex("2014");
    const v2024 = await fetchMundaneItemIndex("2024");

    const keys2014 = new Set(v2014.results.map((e) => e.key));
    const keys2024 = new Set(v2024.results.map((e) => e.key));
    const overlap = [...keys2024].filter((k) => keys2014.has(k));
    expect(overlap.length).toBeLessThan(v2024.count);
  });
});
