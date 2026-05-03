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
  it("auto-selects the single match for a specific hint", async () => {
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
        hint={{ kind: "specific", hint: "longsword" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const longswordButton = await screen.findByRole("button", { name: /longsword/i });
    await waitFor(() => expect(longswordButton).toHaveAttribute("aria-pressed", "true"));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0]![0]).toMatchObject({ index: "longsword" });
  });

  it("does not auto-select for an 'any X' template; allows skip", async () => {
    const onConfirm = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "any", hint: "sword" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: /skip/i });
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("lets the user override the auto-selection", async () => {
    server.use(
      equipmentDetailHandler("2014", "plate-armor", {
        index: "plate-armor",
        name: "Plate Armor",
        armor_class: { base: 18 },
        weight: 65,
      }),
    );
    const onConfirm = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "specific", hint: "longsword" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: /longsword/i });
    await userEvent.clear(screen.getByRole("searchbox"));
    await screen.findByRole("button", { name: /plate armor/i });
    await userEvent.click(screen.getByRole("button", { name: /plate armor/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0]![0]).toMatchObject({ index: "plate-armor" });
  });

  it("calls onCancel when Back is pressed", async () => {
    const onCancel = vi.fn();
    renderWithClient(
      <EnrichmentStep
        ruleset="2014"
        hint={{ kind: "any", hint: "sword" }}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await screen.findByRole("button", { name: /back/i });
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
