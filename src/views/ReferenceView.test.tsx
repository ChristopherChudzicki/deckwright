import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type ReferenceKind, ReferenceView } from "./ReferenceView";

function wrap(kind: ReferenceKind, cardKey: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => <ReferenceView kind={kind} cardKey={cardKey} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ReferenceView", () => {
  test("renders the magic item by key (2014 prefix)", async () => {
    wrap("magic-items", "srd_wand-of-wonder");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Wand of Wonder" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Rarity", { selector: "dt" })).toBeInTheDocument();
  });

  test("renders the magic item by key (2024 prefix)", async () => {
    wrap("magic-items", "srd-2024_wand-of-wonder");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Wand of Wonder" }),
    ).toBeInTheDocument();
  });

  test("renders a spell", async () => {
    wrap("spells", "srd_acid-arrow");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Acid Arrow" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Casting Time", { selector: "dt" })).toBeInTheDocument();
  });

  test("renders a mundane item", async () => {
    wrap("mundane-items", "srd_abacus");
    expect(await screen.findByRole("heading", { level: 1, name: "Abacus" })).toBeInTheDocument();
    expect(await screen.findByText("Category", { selector: "dt" })).toBeInTheDocument();
  });

  test("unknown key → 404 view with a 'Back to Deckwright' link", async () => {
    wrap("magic-items", "srd_no-such-thing");
    expect(await screen.findByRole("heading", { level: 1, name: "Not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Deckwright/i })).toHaveAttribute("href", "/");
  });

  test("unknown kind → 404 view", async () => {
    wrap("widgets" as never, "srd_acid-arrow");
    expect(await screen.findByRole("heading", { level: 1, name: "Not found" })).toBeInTheDocument();
  });

  test("sets document.title to '<name> · Deckwright'", async () => {
    wrap("spells", "srd_fireball");
    await waitFor(() => {
      expect(document.title).toBe("Fireball · Deckwright");
    });
  });

  test("404 view sets document.title to 'Not found · Deckwright'", async () => {
    wrap("magic-items", "srd_no-such-thing");
    await waitFor(() => {
      expect(document.title).toBe("Not found · Deckwright");
    });
  });

  test("resets document.title on unmount (no leak across navigation)", async () => {
    const { unmount } = wrap("spells", "srd_fireball");
    await waitFor(() => {
      expect(document.title).toBe("Fireball · Deckwright");
    });
    unmount();
    expect(document.title).toBe("Deckwright");
  });
});
