import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { magicItemIndexFactory } from "./factories";
import { useMagicItemIndex } from "./hooks";

const wrapper =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

describe("useMagicItemIndex", () => {
  test("returns index data for 2024", async () => {
    const body = magicItemIndexFactory.build({}, { transient: { size: 2 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["magic-items", "2024", "index"], body);

    const { result } = renderHook(() => useMagicItemIndex("2024"), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(body);
  });
});
