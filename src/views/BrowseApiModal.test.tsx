import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { type ReactNode, StrictMode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";
import { magicItemIndexEntryFactory } from "../api/factories";
import { makeCardRow } from "../test/factories";
import { SB_URL, server } from "../test/msw";
import { BrowseApiModal } from "./BrowseApiModal";

const indexKey = (ruleset: Ruleset) => ["magic-items", ruleset, "index"];

const makeClient = (seeds: Partial<Record<Ruleset, MagicItemIndex>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [ruleset, body] of Object.entries(seeds) as [Ruleset, MagicItemIndex][]) {
    client.setQueryData(indexKey(ruleset), body);
  }
  return client;
};

const wrap = (ui: ReactNode, client: QueryClient) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

describe("<BrowseApiModal>", () => {
  test("shows index entries once the list loads", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ "2024": { count: 2, results: [entryA, entryB] } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    expect(await screen.findByRole("button", { name: "Bag of Holding" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cloak of Protection" })).toBeInTheDocument();
  });

  test("search filters the list", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ "2024": { count: 2, results: [entryA, entryB] } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: "Bag of Holding" });
    await userEvent.type(screen.getByRole("searchbox"), "bag");

    expect(screen.getByRole("button", { name: "Bag of Holding" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cloak of Protection" })).not.toBeInTheDocument();
  });

  test("switching ruleset loads a different list", async () => {
    const v2024 = magicItemIndexEntryFactory.build({ name: "Ring A" });
    const v2014 = magicItemIndexEntryFactory.build({ name: "Ring Z" });
    const client = makeClient({
      "2024": { count: 1, results: [v2024] },
      "2014": { count: 1, results: [v2014] },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: "Ring A" });
    await userEvent.click(screen.getByRole("radio", { name: "2014" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Ring Z" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Ring A" })).not.toBeInTheDocument();
  });

  test("clicking a row POSTs the card to the persistence layer and calls onSelected", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const client = makeClient({ "2024": { count: 1, results: [entry] } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(await screen.findByRole("button", { name: "Bag of Holding" }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("clicking the same row only POSTs once even under StrictMode double-render", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Flame Tongue" });
    const client = makeClient({ "2024": { count: 1, results: [entry] } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );

    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />
        </QueryClientProvider>
      </StrictMode>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Flame Tongue" }));

    await waitFor(() => expect(onPost).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPost).toHaveBeenCalledTimes(1);
  });

  test("Escape calls onClose", async () => {
    const onClose = vi.fn();
    const client = makeClient({ "2024": { count: 0, results: [] } });

    wrap(<BrowseApiModal deckId="d1" onClose={onClose} onSelected={() => {}} />, client);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
