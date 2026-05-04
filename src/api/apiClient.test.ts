import { afterEach, describe, expect, test, vi } from "vitest";
import { type ApiError, apiGet } from "./apiClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("apiGet", () => {
  test("calls the Open5e base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await apiGet("/v2/magicitems/test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.open5e.com/v2/magicitems/test",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("returns the parsed JSON body on 200", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ count: 5 }), { status: 200 }),
      ) as typeof fetch;

    const data = await apiGet<{ count: number }>("/api/2024/magic-items");
    expect(data).toEqual({ count: 5 });
  });

  test("throws a typed ApiError on 404", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Not found", { status: 404 })) as typeof fetch;

    await expect(apiGet("/api/2024/magic-items/nope")).rejects.toMatchObject({
      status: 404,
    } satisfies Partial<ApiError>);
  });

  test("throws a typed ApiError on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as typeof fetch;

    await expect(apiGet("/api/2024/magic-items")).rejects.toMatchObject({
      status: "network",
    } satisfies Partial<ApiError>);
  });
});
