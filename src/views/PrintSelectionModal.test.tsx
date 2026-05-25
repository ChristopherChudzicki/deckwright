import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { itemCardFactory, spellCardFactory } from "../cards/factories";
import type { CardId, RenderableCard } from "../cards/types";
import { render, screen, within } from "../test/render";
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

// The card list is one of two listboxes in the modal (the Sort control is the
// other), so scope row queries to it by its accessible name.
const cardList = () => screen.getByRole("listbox", { name: /cards to print/i });
const cardOption = (name: string | RegExp) => within(cardList()).getByRole("option", { name });
const cardOptions = (name: RegExp) => within(cardList()).getAllByRole("option", { name });

describe("<PrintSelectionModal>", () => {
  test("lists every renderable card as an option, recency-sorted (newest first)", () => {
    const older = itemCardFactory.build({ name: "Older", updatedAt: "2026-05-01T00:00:00Z" });
    const newer = itemCardFactory.build({ name: "Newer", updatedAt: "2026-05-20T00:00:00Z" });
    const cards = [older, newer];
    open(cards, allIds(cards));
    const rows = cardOptions(/Older|Newer/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName("Newer");
    expect(rows[1]).toHaveAccessibleName("Older");
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
    await userEvent.click(cardOption(first.name));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("toggling a card updates the Apply total", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
    const [first] = cards;
    if (!first) throw new Error("expected cards");
    await userEvent.click(cardOption(first.name));
    expect(screen.getByRole("button", { name: "Apply (2 cards)" })).toBeInTheDocument();
  });

  test("kind and timestamp are decorative — the option's name is just the card name", () => {
    const card = itemCardFactory.build({ name: "Cloak", updatedAt: "2026-05-23T11:00:00Z" });
    open([card], allIds([card]));
    expect(cardOption("Cloak")).toHaveAccessibleName("Cloak");
  });

  test("a spell and an item both appear when present", () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    expect(cardOption("Cloak")).toBeInTheDocument();
    expect(cardOption("Bless")).toBeInTheDocument();
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

  test("header checkbox is indeterminate (mixed) when some visible are selected", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(cardOption(first.name));
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    expect(header).toBePartiallyChecked();
  });

  test("clicking an indeterminate header clears all visible", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(cardOption(first.name)); // now 2 of 3
    const header = screen.getByRole("checkbox", { name: /select all shown cards/i });
    await userEvent.click(header);
    expect(screen.getByRole("button", { name: "Apply (0 cards)" })).toBeInTheDocument();
  });

  test("header shows 'X of Y shown' status, associated with the checkbox", () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    expect(screen.getByText("3 of 3 shown")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /select all shown cards/i }),
    ).toHaveAccessibleDescription(/3 of 3 shown/);
  });

  test("the Kind filter defaults to All", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(screen.getByRole("radio", { name: /^all/i })).toBeChecked();
  });

  test("shows an empty state when no cards match, hiding the Updated header", async () => {
    const cards = itemCardFactory.buildList(3);
    open(cards, allIds(cards));
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "zzzzz");
    expect(screen.getByText("No cards match.")).toBeInTheDocument();
    expect(screen.getByText("0 of 0 shown")).toBeInTheDocument();
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
  });

  test("Kind filter hides the other kind without deselecting it", async () => {
    const item = itemCardFactory.build({ name: "Cloak" });
    const spell = spellCardFactory.build({ name: "Bless" });
    const cards = [item, spell];
    open(cards, allIds(cards));
    await userEvent.click(screen.getByRole("radio", { name: /items/i }));
    expect(within(cardList()).queryByRole("option", { name: "Bless" })).not.toBeInTheDocument();
    expect(cardOption("Cloak")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /all/i }));
    expect(cardOption("Bless")).toHaveAttribute("aria-selected", "true");
  });

  test("name search narrows the list case-insensitively", async () => {
    const a = itemCardFactory.build({ name: "Acid Arrow" });
    const b = itemCardFactory.build({ name: "Bless" });
    open([a, b], allIds([a, b]));
    await userEvent.type(screen.getByRole("searchbox", { name: /search cards/i }), "acid");
    expect(cardOption("Acid Arrow")).toBeInTheDocument();
    expect(within(cardList()).queryByRole("option", { name: "Bless" })).not.toBeInTheDocument();
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
    expect(cardOption("Bless")).toBeInTheDocument();
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
    expect(within(cardList()).queryByRole("option", { name: "Bless" })).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(cardOption("Bless")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search cards/i })).toHaveValue("");
  });

  test("sorting by name reorders rows alphabetically", async () => {
    // Recency order (default) is Bravo (newer) then Alpha (older); name sort flips it.
    const bravo = itemCardFactory.build({ name: "Bravo", updatedAt: "2026-05-20T00:00:00Z" });
    const alpha = itemCardFactory.build({ name: "Alpha", updatedAt: "2026-05-01T00:00:00Z" });
    const cards = [bravo, alpha];
    open(cards, allIds(cards));
    let rows = cardOptions(/Alpha|Bravo/);
    expect(rows[0]).toHaveAccessibleName("Bravo");
    expect(rows[1]).toHaveAccessibleName("Alpha");
    const sortTrigger = screen.getByRole("button", { name: /sort/i });
    expect(sortTrigger).toHaveTextContent(/recently edited/i);
    await userEvent.click(sortTrigger);
    // The Sort dropdown is a separate listbox; its "Name" option is unambiguous here.
    await userEvent.click(screen.getByRole("option", { name: "Name" }));
    rows = cardOptions(/Alpha|Bravo/);
    expect(rows[0]).toHaveAccessibleName("Alpha");
    expect(rows[1]).toHaveAccessibleName("Bravo");
  });
});
