import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";
import type { SpellIndex } from "../api/endpoints/spells";
import { magicItemIndexEntryFactory, spellIndexEntryFactory } from "../api/factories";
import { makeCardRow } from "../test/factories";
import { SB_URL, server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
import { BrowseApiModal } from "./BrowseApiModal";

const itemKey = (ruleset: Ruleset) => ["magic-items", ruleset, "index"];
const spellKey = (ruleset: Ruleset) => ["spells", ruleset, "index"];

type Seeds = {
  items?: Partial<Record<Ruleset, MagicItemIndex>>;
  spells?: Partial<Record<Ruleset, SpellIndex>>;
};

const makeClient = (seeds: Seeds = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [ruleset, body] of Object.entries(seeds.items ?? {}) as [Ruleset, MagicItemIndex][]) {
    client.setQueryData(itemKey(ruleset), body);
  }
  for (const [ruleset, body] of Object.entries(seeds.spells ?? {}) as [Ruleset, SpellIndex][]) {
    client.setQueryData(spellKey(ruleset), body);
  }
  return client;
};

const wrap = (ui: ReactNode, client: QueryClient) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

describe("<BrowseApiModal>", () => {
  test("shows index entries once the items list loads", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ items: { "2024": { count: 2, results: [entryA, entryB] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    expect(await screen.findByRole("button", { name: /Bag of Holding/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cloak of Protection/ })).toBeInTheDocument();
  });

  test("search filters the items list", async () => {
    const entryA = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const entryB = magicItemIndexEntryFactory.build({ name: "Cloak of Protection" });
    const client = makeClient({ items: { "2024": { count: 2, results: [entryA, entryB] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Bag of Holding/ });
    await userEvent.type(screen.getByRole("searchbox"), "bag");

    expect(screen.getByRole("button", { name: /Bag of Holding/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cloak of Protection/ })).not.toBeInTheDocument();
  });

  test("switching ruleset loads a different items list", async () => {
    const v2024 = magicItemIndexEntryFactory.build({ name: "Ring A" });
    const v2014 = magicItemIndexEntryFactory.build({ name: "Ring Z" });
    const client = makeClient({
      items: {
        "2024": { count: 1, results: [v2024] },
        "2014": { count: 1, results: [v2014] },
      },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Ring A/ });
    await userEvent.click(screen.getByRole("radio", { name: "2014" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Ring Z/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Ring A/ })).not.toBeInTheDocument();
  });

  test("switching kind to Spells swaps the list source", async () => {
    const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const spell = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [item] } },
      spells: { "2024": { count: 1, results: [spell] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Bag of Holding/ });
    await userEvent.click(screen.getByRole("radio", { name: "Spells" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Fireball/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /Bag of Holding/ })).not.toBeInTheDocument();
  });

  test("clicking an item POSTs a card with kind:item", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(await screen.findByRole("button", { name: /Bag of Holding/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost.mock.calls[0]?.[0]?.payload?.kind).toBe("item");
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("clicking a spell POSTs a card with kind:spell", async () => {
    const entry = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({ spells: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(screen.getByRole("radio", { name: "Spells" }));
    await userEvent.click(await screen.findByRole("button", { name: /Fireball/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost.mock.calls[0]?.[0]?.payload?.kind).toBe("spell");
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("clicking the same row only POSTs once even under StrictMode double-render", async () => {
    const entry = magicItemIndexEntryFactory.build({ name: "Flame Tongue" });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );

    render(
      <QueryClientProvider client={client}>
        <BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: /Flame Tongue/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(onPost).toHaveBeenCalledTimes(1);
  });

  test("Escape calls onClose", async () => {
    const onClose = vi.fn();
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={onClose} onSelected={() => {}} />, client);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("shows rarity in each item row", async () => {
    const entry = magicItemIndexEntryFactory.build({
      name: "Bag of Holding",
      rarity: { name: "Uncommon" },
    });
    const client = makeClient({ items: { "2024": { count: 1, results: [entry] } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    const row = await screen.findByRole("button", { name: /Bag of Holding/ });
    expect(row).toHaveTextContent("Uncommon");
  });

  test("shows level and school in each spell row", async () => {
    const cantrip = spellIndexEntryFactory.build({
      name: "Light",
      level: 0,
      school: { name: "evocation" },
    });
    const leveled = spellIndexEntryFactory.build({
      name: "Fireball",
      level: 3,
      school: { name: "evocation" },
    });
    const client = makeClient({
      spells: { "2024": { count: 2, results: [cantrip, leveled] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await userEvent.click(screen.getByRole("radio", { name: "Spells" }));
    const cantripRow = await screen.findByRole("button", { name: /Light/ });
    expect(cantripRow).toHaveTextContent("Evocation cantrip");
    const leveledRow = screen.getByRole("button", { name: /Fireball/ });
    expect(leveledRow).toHaveTextContent("3rd-level evocation");
  });

  test("renders the SRD notice with a link", async () => {
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });
    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);
    expect(await screen.findByRole("link", { name: "SRD" })).toHaveAttribute(
      "href",
      "https://www.dndbeyond.com/srd",
    );
  });
});
