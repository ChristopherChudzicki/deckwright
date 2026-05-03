import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { equipmentDetailHandler, equipmentIndexHandler, server } from "../test/msw";
import { EnrichmentStep } from "./EnrichmentStep";

const renderWithClient = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const equipmentIndex = {
  count: 2,
  results: [
    { index: "longsword", name: "Longsword", url: "/api/2014/equipment/longsword" },
    { index: "plate-armor", name: "Plate Armor", url: "/api/2014/equipment/plate-armor" },
  ],
};

beforeEach(() => {
  server.use(equipmentIndexHandler("2014", equipmentIndex));
});

describe("EnrichmentStep", () => {
  it("clicking a row saves with that equipment as enrichment", async () => {
    server.use(
      equipmentDetailHandler("2014", "longsword", {
        index: "longsword",
        name: "Longsword",
        damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
        weight: 3,
      }),
    );
    const onConfirm = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "specific", hint: "longsword", source: "Weapon (longsword)" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: /longsword/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0]![0]).toMatchObject({ index: "longsword" });
  });

  it("clicking Skip saves without enrichment", async () => {
    const onConfirm = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "any", hint: "sword", source: "Weapon (any sword)" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: /skip/i }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("calls onCancel when Back is pressed", async () => {
    const onCancel = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "any", hint: "sword", source: "Weapon (any sword)" }}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await screen.findByRole("button", { name: /back/i });
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not pre-fill the search when the hint matches nothing", async () => {
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "any", hint: "melee weapon", source: "Weapon (Any Melee Weapon)" }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: /longsword/i });
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("renders the description source line", async () => {
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "specific", hint: "longsword", source: "Weapon (longsword)" }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Weapon \(longsword\)/i)).toBeInTheDocument();
  });

  it("renders the intro instructions", () => {
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "any", hint: "sword", source: "Weapon (any sword)" }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/auto-fill damage\/AC and weight/i)).toBeInTheDocument();
  });
});
