import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { itemCardFactory, spellCardFactory } from "../cards/factories";
import type { CardId, RenderableCard } from "../cards/types";
import { render, screen } from "../test/render";
import { PrintSelectionModal } from "./PrintSelectionModal";

function open(cards: RenderableCard[], initial: Set<CardId>, onApply = vi.fn()) {
  function Harness() {
    const [closed, setClosed] = useState(false);
    if (closed) return <p>closed</p>;
    return (
      <PrintSelectionModal
        cards={cards}
        initialSelection={initial}
        onApply={onApply}
        onClose={() => setClosed(true)}
      />
    );
  }
  render(<Harness />);
  return { onApply };
}

const allIds = (cards: RenderableCard[]) => new Set(cards.map((c) => c.id));

describe("<PrintSelectionModal>", () => {
  test("lists every renderable card with a checkbox, recency-sorted (newest first)", () => {
    const older = itemCardFactory.build({ name: "Older", updatedAt: "2026-05-01T00:00:00Z" });
    const newer = itemCardFactory.build({ name: "Newer", updatedAt: "2026-05-20T00:00:00Z" });
    const cards = [older, newer];
    open(cards, allIds(cards));
    const rowChecks = screen.getAllByRole("checkbox", { name: /Older|Newer/ });
    expect(rowChecks).toHaveLength(2);
    expect(rowChecks[0]).toHaveAccessibleName("Newer");
    expect(rowChecks[1]).toHaveAccessibleName("Older");
  });

  test("focus lands on the name search input on open", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(screen.getByRole("searchbox", { name: /search cards/i })).toHaveFocus();
  });

  test("Apply commits the current draft and closes", async () => {
    const cards = itemCardFactory.buildList(2);
    const { onApply } = open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const committed = onApply.mock.calls[0]?.[0] as Set<string>;
    expect([...committed].sort()).toEqual([...allIds(cards)].sort());
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("Cancel discards the draft (onApply not called) and closes", async () => {
    const cards = itemCardFactory.buildList(2);
    const { onApply } = open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected cards");
    await userEvent.click(screen.getByRole("checkbox", { name: first.name }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("toggling a row updates the Apply total", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
    const [first] = cards;
    if (!first) throw new Error("expected cards");
    await userEvent.click(screen.getByRole("checkbox", { name: first.name }));
    expect(screen.getByRole("button", { name: "Apply (2 cards)" })).toBeInTheDocument();
  });

  test("a spell and an item both appear when present", () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    expect(screen.getByRole("checkbox", { name: "Cloak" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bless" })).toBeInTheDocument();
  });

  test("header checkbox clears all visible when all are checked", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    expect(header).toBeChecked();
    await userEvent.click(header);
    expect(screen.getByRole("button", { name: "Apply (0 cards)" })).toBeInTheDocument();
  });

  test("header checkbox selects all visible when none are checked", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, new Set()); // start empty
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    expect(header).not.toBeChecked();
    await userEvent.click(header);
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
  });

  test("header checkbox is indeterminate (mixed) when some visible are checked", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(screen.getByRole("checkbox", { name: first.name }));
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    expect(header).toBePartiallyChecked();
  });

  test("clicking an indeterminate header clears all visible", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(screen.getByRole("checkbox", { name: first.name })); // now 2 of 3
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    await userEvent.click(header);
    expect(screen.getByRole("button", { name: "Apply (0 cards)" })).toBeInTheDocument();
  });

  test("header shows 'X of Y shown' status", () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    expect(screen.getByText("3 of 3 shown")).toBeInTheDocument();
  });

  test("Kind filter hides the other kind without unchecking it", async () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("radio", { name: /items/i }));
    expect(screen.queryByRole("checkbox", { name: "Bless" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Cloak" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /all/i }));
    expect(screen.getByRole("checkbox", { name: "Bless" })).toBeChecked();
  });

  test("name search narrows the list case-insensitively", async () => {
    const a = itemCardFactory.build({ name: "Acid Arrow" });
    const b = itemCardFactory.build({ name: "Bless" });
    open([a, b], allIds([a, b]));
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "acid");
    expect(screen.getByRole("checkbox", { name: "Acid Arrow" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Bless" })).not.toBeInTheDocument();
  });

  test("hidden-checked line appears when a filter hides a selected card", async () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("radio", { name: /items/i }));
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    expect(screen.getByText("1 of 1 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply (2 cards)" })).toBeInTheDocument();
  });

  test("Clear filters link restores the full list and removes the hidden-checked line", async () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("radio", { name: /items/i }));
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByRole("checkbox", { name: "Bless" })).toBeInTheDocument();
    expect(screen.queryByText(/hidden by filters/i)).not.toBeInTheDocument();
  });

  test("exposes a polite live region announcing the selected total", () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const live = screen.getByText(/3 cards selected/i);
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  test("Clear filters resets a name search and restores hidden selected cards", async () => {
    const cloak = itemCardFactory.build({ name: "Cloak" });
    const bless = spellCardFactory.build({ name: "Bless" });
    const cards = [cloak, bless];
    open(cards, allIds(cards));
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "cloak");
    expect(screen.queryByRole("checkbox", { name: "Bless" })).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByRole("checkbox", { name: "Bless" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search cards/i })).toHaveValue("");
  });

  test("sorting by name reorders rows alphabetically", async () => {
    // Recency order (default) is Bravo (newer) then Alpha (older); name sort flips it.
    const bravo = itemCardFactory.build({ name: "Bravo", updatedAt: "2026-05-20T00:00:00Z" });
    const alpha = itemCardFactory.build({ name: "Alpha", updatedAt: "2026-05-01T00:00:00Z" });
    const cards = [bravo, alpha];
    open(cards, allIds(cards));
    // Default recency: Bravo first.
    let rows = screen.getAllByRole("checkbox", { name: /Alpha|Bravo/ });
    expect(rows[0]).toHaveAccessibleName("Bravo");
    expect(rows[1]).toHaveAccessibleName("Alpha");
    await userEvent.click(screen.getByRole("button", { name: /sort/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /name/i }));
    rows = screen.getAllByRole("checkbox", { name: /Alpha|Bravo/ });
    expect(rows[0]).toHaveAccessibleName("Alpha");
    expect(rows[1]).toHaveAccessibleName("Bravo");
  });
});
