import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeckBreadcrumb } from "./DeckBreadcrumb";

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
});
