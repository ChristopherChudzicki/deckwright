import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeDeckRow } from "../test/factories";
import { server } from "../test/msw";
import { DeckBreadcrumb } from "./DeckBreadcrumb";

const SB = "http://localhost:54321";

let mockPathname = "/";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => ({ pathname: mockPathname }),
    Link: ({
      children,
      to,
      params: _params,
      ...rest
    }: {
      children: ReactNode;
      to?: string;
      params?: Record<string, string>;
    } & Record<string, unknown>) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("DeckBreadcrumb", () => {
  it("renders just a Decks link when not under a deck route", () => {
    mockPathname = "/";
    render(wrap(<DeckBreadcrumb />));
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    const links = screen.getAllByRole("link", { name: /decks/i });
    expect(nav).toContainElement(links[0]);
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/");
  });

  it("renders the deck name as current page on /deck/$id", async () => {
    const deck = makeDeckRow.build();
    mockPathname = `/deck/${deck.id}`;
    server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
    render(wrap(<DeckBreadcrumb />));

    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/");
    const current = await screen.findByText(deck.name);
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.tagName).not.toBe("A");
  });

  it("renders the deck name as a link on the editor route", async () => {
    const deck = makeDeckRow.build();
    mockPathname = `/deck/${deck.id}/edit/new`;
    server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
    render(wrap(<DeckBreadcrumb />));

    const deckLink = await screen.findByRole("link", { name: deck.name });
    expect(deckLink).toHaveAttribute("href", "/deck/$deckId");
    expect(deckLink).not.toHaveAttribute("aria-current");
  });

  it("renders the deck name as a link on the print route", async () => {
    const deck = makeDeckRow.build();
    mockPathname = `/deck/${deck.id}/print`;
    server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
    render(wrap(<DeckBreadcrumb />));

    const deckLink = await screen.findByRole("link", { name: deck.name });
    expect(deckLink).toHaveAttribute("href", "/deck/$deckId");
  });

  it("shows an ellipsis while the deck query is pending", async () => {
    const deck = makeDeckRow.build();
    mockPathname = `/deck/${deck.id}`;
    let resolve: ((res: Response) => void) | undefined;
    server.use(
      http.get(
        `${SB}/rest/v1/decks`,
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    render(wrap(<DeckBreadcrumb />));

    expect(await screen.findByText("…")).toBeInTheDocument();
    expect(screen.queryByText(deck.name)).not.toBeInTheDocument();

    resolve?.(HttpResponse.json([deck]));
    await screen.findByText(deck.name);
  });

  it("collapses to just Decks when the deck is not found", async () => {
    mockPathname = "/deck/missing";
    server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([])));
    render(wrap(<DeckBreadcrumb />));

    await screen.findByRole("link", { name: "Decks" });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("›")).not.toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("sets the full deck name on title for a truncated link", async () => {
    const longName = "A Very Long Deck Name That Will Overflow Twenty Four Characters";
    const deck = makeDeckRow.build({ name: longName });
    mockPathname = `/deck/${deck.id}/edit/new`;
    server.use(http.get(`${SB}/rest/v1/decks`, () => HttpResponse.json([deck])));
    render(wrap(<DeckBreadcrumb />));

    const link = await screen.findByRole("link", { name: longName });
    expect(link).toHaveAttribute("title", longName);
  });
});
