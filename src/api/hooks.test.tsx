import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { magicItemIndexHandler, server } from "../test/msw";
import { magicItemIndexFactory } from "./factories";
import { useMagicItemIndex } from "./hooks";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("useMagicItemIndex", () => {
  test("returns index data for 2024", async () => {
    const body = magicItemIndexFactory.build({}, { transient: { size: 2 } });
    server.use(magicItemIndexHandler("2024", body));

    const { result } = renderHook(() => useMagicItemIndex("2024"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(body);
  });
});
