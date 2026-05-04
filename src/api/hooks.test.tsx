import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { magicItemDetailHandler, magicItemIndexHandler, server } from "../test/msw";
import {
  magicItemDetailFactory,
  magicItemIndexEntryFactory,
  magicItemIndexFactory,
} from "./factories";
import { useMagicItemDetail, useMagicItemIndex } from "./hooks";

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

describe("useMagicItemDetail", () => {
  test("is disabled when slug is null", () => {
    const { result } = renderHook(() => useMagicItemDetail("2024", null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("fetches when slug is supplied", async () => {
    const indexEntry = magicItemIndexEntryFactory.build();
    const detail = magicItemDetailFactory.build({
      key: indexEntry.key,
      name: indexEntry.name,
    });
    server.use(magicItemDetailHandler("2024", indexEntry.key, detail));

    const { result } = renderHook(() => useMagicItemDetail("2024", indexEntry.key), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe(indexEntry.name);
  });
});
