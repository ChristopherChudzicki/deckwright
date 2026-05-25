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

// Newest-first: pass higher day numbers first so recency order == call order.
const mk = (name: string, day: string) =>
  itemCardFactory.build({ name, updatedAt: `2026-05-${day}T00:00:00Z` });

describe("<PrintSelectionModal> range + keyboard selection", () => {
  test("the card list is a multi-selectable listbox; options expose aria-selected", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(cardList()).toHaveAttribute("aria-multiselectable", "true");
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    expect(cardOption(first.name)).toHaveAttribute("aria-selected", "true");
  });

  test("the listbox is described by the range hint", () => {
    const cards = itemCardFactory.buildList(2);
    open(cards, allIds(cards));
    expect(cardList()).toHaveAccessibleDescription(/shift-click/i);
  });

  test("Escape closes the modal rather than only clearing selection", async () => {
    const cards = itemCardFactory.buildList(3);
    const { onApply } = open(cards, allIds(cards));
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    await userEvent.click(cardOption(first.name)); // moves focus into the listbox
    await userEvent.keyboard("{Escape}");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("bare ArrowDown moves focus without changing selection", async () => {
    const cards = [mk("First", "20"), mk("Second", "19"), mk("Third", "18")];
    open(cards, new Set()); // none selected
    cardOption("First").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(cardOption("Second")).toHaveFocus();
    expect(cardOption("First")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("Second")).toHaveAttribute("aria-selected", "false");
  });

  test("a plain click toggles a single card and never replaces the selection", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18")];
    open(cards, allIds(cards)); // all selected
    await user.click(cardOption("A")); // toggle A off; B and C stay
    expect(cardOption("A")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
  });

  test("Shift-click selects the inclusive range (additive)", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18"), mk("D", "17")];
    open(cards, new Set());
    await user.click(cardOption("A"));
    await user.keyboard("{Shift>}");
    await user.click(cardOption("C"));
    await user.keyboard("{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("D")).toHaveAttribute("aria-selected", "false");
  });

  test("Shift-click from a deselected anchor clears the range (Gmail-style)", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18"), mk("D", "17")];
    open(cards, allIds(cards)); // all selected
    await user.click(cardOption("A")); // A becomes the deselected anchor
    await user.keyboard("{Shift>}");
    await user.click(cardOption("C")); // range follows anchor A's (deselected) state -> A..C clear
    await user.keyboard("{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("D")).toHaveAttribute("aria-selected", "true");
  });

  test("Shift-click from a selected anchor fills the range, incl. cards between (Gmail-style)", async () => {
    const user = userEvent.setup();
    const a = mk("A", "20");
    const b = mk("B", "19");
    const c = mk("C", "18");
    const d = mk("D", "17");
    open([a, b, c, d], new Set([a.id, d.id])); // A & D selected; B, C not
    await user.click(cardOption("B")); // B becomes the selected anchor
    await user.keyboard("{Shift>}");
    await user.click(cardOption("D")); // range follows anchor B's (selected) state -> B..D fill
    await user.keyboard("{/Shift}");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true"); // was unselected, now filled
    expect(cardOption("D")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
  });

  test("shrinking a Shift-range drops the clicked row too (Gmail-style)", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18"), mk("D", "17"), mk("E", "16")];
    open(cards, new Set()); // none selected
    await user.click(cardOption("A")); // select A, anchor A
    await user.keyboard("{Shift>}");
    await user.click(cardOption("E")); // extend: fill A..E
    expect(cardOption("E")).toHaveAttribute("aria-selected", "true");
    await user.click(cardOption("C")); // still holding Shift: shrink back to C
    await user.keyboard("{/Shift}");
    // Gmail: shrinking deselects the clicked row (C) and everything out to the old
    // extent (D, E), leaving only A..B.
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("D")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("E")).toHaveAttribute("aria-selected", "false");
  });

  test("Shift-clicking the anchor then extending still includes the clicked row", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18"), mk("D", "17"), mk("E", "16")];
    open(cards, new Set());
    await user.click(cardOption("A")); // anchor A
    await user.keyboard("{Shift>}");
    await user.click(cardOption("E")); // fill A..E (extent now E)
    await user.click(cardOption("A")); // Shift-click the anchor — collapses, must reset the extent
    await user.click(cardOption("D")); // extend A..D — D must be included, not read as a shrink
    await user.keyboard("{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("D")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("E")).toHaveAttribute("aria-selected", "false");
  });

  test("a card selected via a Shift-range survives being filtered out (stays in Apply)", async () => {
    const user = userEvent.setup();
    // recency order: Aaa, Sss(spell), Bbb, Ddd
    const aaa = itemCardFactory.build({ name: "Aaa", updatedAt: "2026-05-20T00:00:00Z" });
    const sss = spellCardFactory.build({ name: "Sss", updatedAt: "2026-05-19T00:00:00Z" });
    const bbb = itemCardFactory.build({ name: "Bbb", updatedAt: "2026-05-18T00:00:00Z" });
    const ddd = itemCardFactory.build({ name: "Ddd", updatedAt: "2026-05-17T00:00:00Z" });
    open([aaa, sss, bbb, ddd], new Set());
    await user.click(cardOption("Aaa")); // anchor
    await user.keyboard("{Shift>}");
    await user.click(cardOption("Ddd")); // fill Aaa..Ddd, incl. the spell Sss
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("button", { name: "Apply (4 cards)" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /items/i })); // hides Sss (still selected)
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    await user.keyboard("{Shift>}");
    await user.click(cardOption("Bbb")); // shrink within the visible items
    await user.keyboard("{/Shift}");
    // The shrink drops the visible run, but the hidden spell must NOT be lost:
    // Aaa (visible) + Sss (hidden) = 2.
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply (2 cards)" })).toBeInTheDocument();
  });

  test("Cmd/Ctrl-click toggles a single card without disturbing others", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18")];
    open(cards, new Set());
    await user.click(cardOption("A"));
    await user.keyboard("{Meta>}");
    await user.click(cardOption("C"));
    await user.keyboard("{/Meta}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "false");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
  });

  test("Shift+ArrowDown extends the selection by keyboard", async () => {
    const user = userEvent.setup();
    const cards = [mk("A", "20"), mk("B", "19"), mk("C", "18")];
    open(cards, new Set());
    await user.click(cardOption("A")); // select + anchor + focus A
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("B")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "false");
  });

  test("range selection spans only visible rows; a filtered-out selected card is preserved", async () => {
    const user = userEvent.setup();
    const a = itemCardFactory.build({ name: "A", updatedAt: "2026-05-20T00:00:00Z" });
    const b = spellCardFactory.build({ name: "B", updatedAt: "2026-05-19T00:00:00Z" });
    const c = itemCardFactory.build({ name: "C", updatedAt: "2026-05-18T00:00:00Z" });
    const cards = [a, b, c];
    open(cards, new Set([b.id])); // only the spell B is selected
    await user.click(screen.getByRole("radio", { name: /items/i })); // hides B; A, C visible
    expect(screen.getByText(/1 selected card is hidden by filters/i)).toBeInTheDocument();
    await user.click(cardOption("A"));
    await user.keyboard("{Shift>}");
    await user.click(cardOption("C"));
    await user.keyboard("{/Shift}");
    expect(cardOption("A")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("C")).toHaveAttribute("aria-selected", "true");
    // A + C (visible) + B (hidden, preserved) = 3
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
  });

  test("range selection works after changing the sort order", async () => {
    const user = userEvent.setup();
    const bravo = itemCardFactory.build({ name: "Bravo", updatedAt: "2026-05-20T00:00:00Z" });
    const alpha = itemCardFactory.build({ name: "Alpha", updatedAt: "2026-05-18T00:00:00Z" });
    const cards = [bravo, alpha];
    open(cards, new Set());
    await user.click(screen.getByRole("button", { name: /sort/i }));
    await user.click(screen.getByRole("option", { name: "Name" })); // order -> Alpha, Bravo
    await user.click(cardOption("Alpha"));
    await user.keyboard("{Shift>}");
    await user.click(cardOption("Bravo"));
    await user.keyboard("{/Shift}");
    expect(cardOption("Alpha")).toHaveAttribute("aria-selected", "true");
    expect(cardOption("Bravo")).toHaveAttribute("aria-selected", "true");
  });

  test("Cmd/Ctrl+A selects all shown and the header reads checked", async () => {
    const user = userEvent.setup();
    const cards = itemCardFactory.buildList(3);
    open(cards, new Set()); // none
    const [first] = cards;
    if (!first) throw new Error("expected a card");
    cardOption(first.name).focus();
    // jsdom is treated as non-Mac, so Ctrl+A is select-all. If this env resolves as
    // Mac, switch to "{Meta>}a{/Meta}".
    await user.keyboard("{Control>}a{/Control}");
    expect(screen.getByRole("button", { name: "Apply (3 cards)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /select all shown cards/i })).toBeChecked();
  });
});
