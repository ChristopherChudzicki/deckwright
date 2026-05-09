import { describe, expect, test } from "vitest";
import { render, screen } from "../test/render";
import { CardBack } from "./CardBack";
import { itemCardFactory, spellCardFactory } from "./factories";

describe("<CardBack>", () => {
  test("uses the card's explicit iconKey when set", () => {
    const card = itemCardFactory.build({ iconKey: "trident" });
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back")).toHaveAttribute("data-icon-key", "trident");
  });

  test("falls back to the heuristic-picked iconKey for an item card", () => {
    const card = itemCardFactory.build({ name: "Flame Tongue Trident" });
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back")).toHaveAttribute("data-icon-key", "trident");
  });

  test("falls back to the heuristic-picked iconKey for a spell card", () => {
    const card = spellCardFactory.build({ name: "Fireball" });
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back")).toHaveAttribute("data-icon-key", "fireball");
  });

  test("does not crash for a stale or unknown iconKey", () => {
    const card = itemCardFactory.build({ iconKey: "definitely-removed-icon" });
    expect(() => render(<CardBack card={card} cardsPerPage={4} />)).not.toThrow();
  });

  test("applies the 4-up layout class at cardsPerPage=4", () => {
    const card = itemCardFactory.build();
    const { container } = render(<CardBack card={card} cardsPerPage={4} />);
    const root = container.querySelector('[data-testid="card-back"]');
    expect(root?.className).toMatch(/perPage4/);
  });

  test("applies the 2-up layout class at cardsPerPage=2", () => {
    const card = itemCardFactory.build();
    const { container } = render(<CardBack card={card} cardsPerPage={2} />);
    const root = container.querySelector('[data-testid="card-back"]');
    expect(root?.className).toMatch(/perPage2/);
  });

  test("exposes the card id on the root for slot-order verification", () => {
    const card = itemCardFactory.build();
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back")).toHaveAttribute("data-card-id", card.id);
  });

  test("renders a rounded-square frame for an item card", () => {
    const card = itemCardFactory.build();
    render(<CardBack card={card} cardsPerPage={4} />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "square");
    expect(frame.querySelector("rect")).not.toBeNull();
  });

  test("renders a hexagon frame for a spell card", () => {
    const card = spellCardFactory.build();
    render(<CardBack card={card} cardsPerPage={4} />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "hex");
    expect(frame.querySelector("polygon")).not.toBeNull();
  });
});
