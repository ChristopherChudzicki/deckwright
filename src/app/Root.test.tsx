import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionContext, type SessionState } from "../auth/useSession";
import { render, screen, within } from "../test/render";
import { Root } from "./Root";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...rest
    }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
      <a href={to as string} {...rest}>
        {children}
      </a>
    ),
    Outlet: () => null,
    useLocation: () => ({ pathname: "/" }),
  };
});

const loadingSession: SessionState = { status: "loading", user: null, session: null };

function renderRoot() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={loadingSession}>
        <Root />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("<Root>", () => {
  it("does not render the GitHub link inside the header", () => {
    renderRoot();
    const banner = screen.getByRole("banner");
    expect(within(banner).queryByRole("link", { name: /github/i })).not.toBeInTheDocument();
  });

  it("renders the GitHub link inside the footer", () => {
    renderRoot();
    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: /view source on github/i }),
    ).toBeInTheDocument();
  });
});
