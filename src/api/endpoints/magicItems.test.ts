import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchMagicItemDetail, fetchMagicItemIndex } from "./magicItems";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchMagicItemIndex", () => {
  test("hits Open5e magicitems with srd-2024 filter when ruleset is 2024", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchMagicItemIndex("2024");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.open5e.com/v2/magicitems/?document=srd-2024&limit=2000",
      expect.anything(),
    );
  });

  test("hits Open5e magicitems with srd-2014 filter when ruleset is 2014", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchMagicItemIndex("2014");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.open5e.com/v2/magicitems/?document=srd-2014&limit=2000",
      expect.anything(),
    );
  });

  test("throws when the SRD has more items than the fetch limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 3000, next: "x", previous: null, results: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchMagicItemIndex("2024")).rejects.toThrow(/exceeding the 2000-row limit/);
  });

  test("passes results through verbatim", async () => {
    const row = {
      key: "srd-2024_bag-of-holding",
      name: "Bag of Holding",
      desc: "A magical bag.",
      category: { name: "Wondrous Item" },
      rarity: { name: "Uncommon" },
      requires_attunement: false,
      attunement_detail: null,
      weapon: null,
      armor: null,
      weight: "0.000",
      weight_unit: "lb",
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 1, next: null, previous: null, results: [row] }), {
        status: 200,
      }),
    ) as typeof fetch;

    const result = await fetchMagicItemIndex("2024");

    expect(result.results).toEqual([row]);
  });
});

describe("fetchMagicItemDetail", () => {
  test("hits the right path and tags response with ruleset", async () => {
    const raw = {
      key: "srd-2024_bag-of-holding",
      name: "Bag of Holding",
      desc: "A big bag.",
      category: { name: "Wondrous Item" },
      rarity: { name: "Uncommon" },
      requires_attunement: false,
      attunement_detail: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchMagicItemDetail("2024", "srd-2024_bag-of-holding");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.open5e.com/v2/magicitems/srd-2024_bag-of-holding/",
      expect.anything(),
    );
    expect(result.ruleset).toBe("2024");
    expect(result.name).toBe("Bag of Holding");
  });
});
