import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makePublicDeck } from "../test/factories";
import { server } from "../test/msw";
import { render, screen, waitFor } from "../test/render";
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
  it("renders nothing when not under a deck route", () => {
    mockPathname = "/";
    const { container } = render(wrap(<DeckBreadcrumb />));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the deck root route", () => {
    mockPathname = "/deck/any-id";
    const { container } = render(wrap(<DeckBreadcrumb />));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the deck name as a link on the editor route", async () => {
    const deck = makePublicDeck.build();
    mockPathname = `/deck/${deck.id}/edit/new`;
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)));
    render(wrap(<DeckBreadcrumb />));

    const deckLink = await screen.findByRole("link", { name: deck.name });
    expect(deckLink).toHaveAttribute("href", "/deck/$deckId");
    expect(deckLink).not.toHaveAttribute("aria-current");
  });

  it("renders the deck name as a link on the print route", async () => {
    const deck = makePublicDeck.build();
    mockPathname = `/deck/${deck.id}/print`;
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)));
    render(wrap(<DeckBreadcrumb />));

    const deckLink = await screen.findByRole("link", { name: deck.name });
    expect(deckLink).toHaveAttribute("href", "/deck/$deckId");
  });

  it("shows an ellipsis while the deck query is pending", async () => {
    const deck = makePublicDeck.build();
    mockPathname = `/deck/${deck.id}/edit/new`;
    let resolve: ((res: Response) => void) | undefined;
    server.use(
      http.post(
        `${SB}/rest/v1/rpc/get_public_deck`,
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    render(wrap(<DeckBreadcrumb />));

    expect(await screen.findByText("…")).toBeInTheDocument();
    expect(screen.queryByText(deck.name)).not.toBeInTheDocument();

    resolve?.(HttpResponse.json(deck));
    await screen.findByText(deck.name);
  });

  it("collapses to nothing when the deck is not found", async () => {
    mockPathname = "/deck/missing/edit/new";
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(null)));
    const { container } = render(wrap(<DeckBreadcrumb />));

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("sets the full deck name on title for a truncated link", async () => {
    const longName = "A Very Long Deck Name That Will Overflow Twenty Four Characters";
    const deck = makePublicDeck.build({ name: longName });
    mockPathname = `/deck/${deck.id}/edit/new`;
    server.use(http.post(`${SB}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)));
    render(wrap(<DeckBreadcrumb />));

    const link = await screen.findByRole("link", { name: longName });
    expect(link).toHaveAttribute("title", longName);
  });
});
