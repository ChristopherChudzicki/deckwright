import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, test } from "vitest";
import { ReferenceView } from "./ReferenceView";

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("ReferenceView", () => {
  test("renders the magic item by key (2014 prefix)", async () => {
    wrap(<ReferenceView kind="magic-items" cardKey="srd_wand-of-wonder" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Wand of Wonder" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Rarity", { selector: "dt" })).toBeInTheDocument();
  });

  test("renders the magic item by key (2024 prefix)", async () => {
    wrap(<ReferenceView kind="magic-items" cardKey="srd-2024_wand-of-wonder" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Wand of Wonder" }),
    ).toBeInTheDocument();
  });

  test("renders a spell", async () => {
    wrap(<ReferenceView kind="spells" cardKey="srd_acid-arrow" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Acid Arrow" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Casting Time", { selector: "dt" })).toBeInTheDocument();
  });

  test("renders a mundane item", async () => {
    wrap(<ReferenceView kind="mundane-items" cardKey="srd_abacus" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Abacus" })).toBeInTheDocument();
    expect(await screen.findByText("Category", { selector: "dt" })).toBeInTheDocument();
  });

  test("unknown key → 404 view with a 'Deckwright home' link", async () => {
    wrap(<ReferenceView kind="magic-items" cardKey="srd_no-such-thing" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deckwright home/i })).toHaveAttribute("href", "/");
  });

  test("unknown kind → 404 view", async () => {
    wrap(<ReferenceView kind={"widgets" as never} cardKey="srd_acid-arrow" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Not found" })).toBeInTheDocument();
  });

  test("sets document.title to '<name> · Deckwright'", async () => {
    wrap(<ReferenceView kind="spells" cardKey="srd_fireball" />);
    await waitFor(() => {
      expect(document.title).toBe("Fireball · Deckwright");
    });
  });

  test("404 view sets document.title to 'Not found · Deckwright'", async () => {
    wrap(<ReferenceView kind="magic-items" cardKey="srd_no-such-thing" />);
    await waitFor(() => {
      expect(document.title).toBe("Not found · Deckwright");
    });
  });
});
