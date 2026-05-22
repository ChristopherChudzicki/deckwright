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
});
