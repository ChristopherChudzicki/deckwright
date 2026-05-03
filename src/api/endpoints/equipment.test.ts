import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchEquipmentDetail, fetchEquipmentIndex } from "./equipment";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchEquipmentIndex", () => {
  test("hits /api/2024/equipment when ruleset is 2024", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ count: 0, results: [] }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchEquipmentIndex("2024");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.dnd5eapi.co/api/2024/equipment",
      expect.anything(),
    );
  });

  test("hits /api/2014/equipment when ruleset is 2014", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ count: 0, results: [] }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchEquipmentIndex("2014");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.dnd5eapi.co/api/2014/equipment",
      expect.anything(),
    );
  });
});

describe("fetchEquipmentDetail", () => {
  test("hits the right path and returns parsed detail", async () => {
    const raw = {
      index: "longsword",
      name: "Longsword",
      damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
      weight: 3,
      cost: { quantity: 15, unit: "gp" },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchEquipmentDetail("2014", "longsword");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.dnd5eapi.co/api/2014/equipment/longsword",
      expect.anything(),
    );
    expect(result.name).toBe("Longsword");
    expect(result.damage?.damage_dice).toBe("1d8");
    expect(result.weight).toBe(3);
  });
});
