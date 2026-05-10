import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MagicItemIndex, Ruleset } from "../api/endpoints/magicItems";
import * as magicItemsEndpoint from "../api/endpoints/magicItems";
import type { MundaneItemIndex } from "../api/endpoints/mundaneItems";
import type { SpellIndex } from "../api/endpoints/spells";
import {
  magicItemIndexEntryFactory,
  mundaneItemIndexEntryFactory,
  spellIndexEntryFactory,
} from "../api/factories";
import { makeCardRow } from "../test/factories";
import { SB_URL, server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
import { BrowseApiModal } from "./BrowseApiModal";

const itemKey = (ruleset: Ruleset) => ["magic-items", ruleset, "index"];
const mundaneKey = (ruleset: Ruleset) => ["mundane-items", ruleset, "index"];
const spellKey = (ruleset: Ruleset) => ["spells", ruleset, "index"];

type Seeds = {
  items?: Partial<Record<Ruleset, MagicItemIndex>>;
  mundane?: Partial<Record<Ruleset, MundaneItemIndex>>;
  spells?: Partial<Record<Ruleset, SpellIndex>>;
};

const EMPTY = { count: 0, results: [] };
const RULESETS: Ruleset[] = ["2024", "2014"];

const makeClient = (seeds: Seeds = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const ruleset of RULESETS) {
    client.setQueryData(itemKey(ruleset), seeds.items?.[ruleset] ?? EMPTY);
    client.setQueryData(mundaneKey(ruleset), seeds.mundane?.[ruleset] ?? EMPTY);
    client.setQueryData(spellKey(ruleset), seeds.spells?.[ruleset] ?? EMPTY);
  }
  return client;
};

const wrap = (ui: ReactNode, client: QueryClient) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

const openSourceMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^Source:/ }));
};

describe("<BrowseApiModal>", () => {
  test("renders the registered types as a vertical tablist in registry order", async () => {
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });
    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Items", "Spells"]);
  });

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

  test("fuzzy search matches across whitespace in spell names", async () => {
    const fireBolt = spellIndexEntryFactory.build({ name: "Fire Bolt" });
    const acidSplash = spellIndexEntryFactory.build({ name: "Acid Splash" });
    const client = makeClient({
      spells: { "2024": { count: 2, results: [fireBolt, acidSplash] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));
    await screen.findByRole("button", { name: /^Fire Bolt/ });
    await userEvent.type(screen.getByRole("searchbox"), "firebolt");

    expect(await screen.findByRole("button", { name: /^Fire Bolt/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Acid Splash/ })).not.toBeInTheDocument();
  });

  test("ranks compact subsequence matches above spread-out ones", async () => {
    const flame = magicItemIndexEntryFactory.build({ name: "Flame Tongue Battleaxe" });
    const rod = magicItemIndexEntryFactory.build({ name: "Rod of Lordly Might" });
    const client = makeClient({
      items: { "2024": { count: 2, results: [rod, flame] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /^Rod of Lordly Might/ });
    await userEvent.type(screen.getByRole("searchbox"), "flm");

    const matches = await screen.findAllByRole("button", {
      name: /^(Flame Tongue Battleaxe|Rod of Lordly Might)/,
    });
    expect(matches[0]).toHaveAccessibleName(/^Flame Tongue Battleaxe/);
  });

  test("switching source loads a different items list", async () => {
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
    await openSourceMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "2014" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Ring Z/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Ring A/ })).not.toBeInTheDocument();
  });

  test("Items tab merges magic and mundane sources alphabetically", async () => {
    const magicItem = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const mundaneItem = mundaneItemIndexEntryFactory.build({ name: "Battleaxe" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [magicItem] } },
      mundane: { "2024": { count: 1, results: [mundaneItem] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    const bagButton = await screen.findByRole("button", { name: /Bag of Holding/ });
    const battleaxeButton = screen.getByRole("button", { name: /Battleaxe/ });
    expect(
      bagButton.compareDocumentPosition(battleaxeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("switching to the Spells tab swaps the list source", async () => {
    const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const spell = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [item] } },
      spells: { "2024": { count: 1, results: [spell] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Bag of Holding/ });
    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Fireball/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /Bag of Holding/ })).not.toBeInTheDocument();
  });

  test("switching tabs clears the search query", async () => {
    const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const spell = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [item] } },
      spells: { "2024": { count: 1, results: [spell] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await screen.findByRole("button", { name: /Bag of Holding/ });
    await userEvent.type(screen.getByRole("searchbox"), "bag");

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));

    const spellsSearch = await screen.findByRole("searchbox");
    expect(spellsSearch).toHaveValue("");
    expect(spellsSearch).toHaveAttribute("placeholder", "Search spells…");
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

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));
    await userEvent.click(await screen.findByRole("button", { name: /Fireball/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(onPost.mock.calls[0]?.[0]?.payload?.kind).toBe("spell");
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("clicking a mundane item from the Items tab POSTs a card with kind:item", async () => {
    const entry = mundaneItemIndexEntryFactory.build({
      name: "Battleaxe",
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d8",
        damage_type: { name: "Slashing" },
        properties: [],
        is_simple: false,
        is_martial: true,
      },
      cost: "10.00",
      weight: "4.000",
      weight_unit: "lb",
    });
    const client = makeClient({
      mundane: { "2024": { count: 1, results: [entry] } },
    });
    const onPost = vi.fn();
    server.use(
      http.post(`${SB_URL}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    const onSelected = vi.fn();

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={onSelected} />, client);

    await userEvent.click(await screen.findByRole("button", { name: /Battleaxe/ }));

    await waitFor(() => expect(onPost).toHaveBeenCalled());
    const payload = onPost.mock.calls[0]?.[0]?.payload;
    expect(payload?.kind).toBe("item");
    expect(payload?.headerTags).toEqual(["Weapon", "Martial", "1d8 slashing"]);
    expect(payload?.footerTags).toEqual(["10 gp", "4 lb"]);
    expect(onSelected).toHaveBeenCalledWith(expect.any(String));
  });

  test("mundane-item rows show category in the meta column", async () => {
    const entry = mundaneItemIndexEntryFactory.build({
      name: "Rope",
      category: { name: "Adventuring Gear" },
    });
    const client = makeClient({
      mundane: { "2024": { count: 1, results: [entry] } },
    });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    const row = await screen.findByRole("button", { name: /Rope/ });
    expect(row).toHaveTextContent("Adventuring Gear");
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

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));
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

  test("source menu lists exactly the active type's supportedSources", async () => {
    const client = makeClient({ items: { "2024": { count: 0, results: [] } } });
    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await openSourceMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((el) => el.textContent)).toEqual(["2024", "2014"]);
  });

  test("pick error clears when switching tabs", async () => {
    const item = magicItemIndexEntryFactory.build({ name: "Bag of Holding" });
    const spell = spellIndexEntryFactory.build({ name: "Fireball" });
    const client = makeClient({
      items: { "2024": { count: 1, results: [item] } },
      spells: { "2024": { count: 1, results: [spell] } },
    });
    server.use(http.post(`${SB_URL}/rest/v1/cards`, () => HttpResponse.error()));

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    await userEvent.click(await screen.findByRole("button", { name: /Bag of Holding/ }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("tab", { name: "Spells" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  test("renders a loading state while the items index is fetching", async () => {
    vi.spyOn(magicItemsEndpoint, "fetchMagicItemIndex").mockReturnValue(
      new Promise<MagicItemIndex>(() => {}),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
  });

  test("shows a Retry button when the items index fails to load", async () => {
    vi.spyOn(magicItemsEndpoint, "fetchMagicItemIndex").mockRejectedValue(new Error("boom"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    wrap(<BrowseApiModal deckId="d1" onClose={() => {}} onSelected={() => {}} />, client);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
