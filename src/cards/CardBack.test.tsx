import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CardBack } from "./CardBack";
import { itemCardFactory, spellCardFactory } from "./factories";

describe("<CardBack>", () => {
  test("renders an icon SVG using the card's explicit iconKey", () => {
    const card = itemCardFactory.build({ iconKey: "trident" });
    render(<CardBack card={card} cardsPerPage={4} />);
    const root = screen.getByTestId("card-back");
    expect(root.querySelector("svg")).not.toBeNull();
  });

  test("renders the heuristic-picked icon when iconKey is unset", () => {
    const card = itemCardFactory.build({
      name: "Flame Tongue Trident",
      iconKey: undefined,
    });
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back").querySelector("svg")).not.toBeNull();
  });

  test("renders the heuristic-picked icon for a spell card with iconKey unset", () => {
    const card = spellCardFactory.build({
      name: "Fireball",
      headerTags: ["3rd-level evocation"],
      iconKey: undefined,
    });
    render(<CardBack card={card} cardsPerPage={4} />);
    expect(screen.getByTestId("card-back").querySelector("svg")).not.toBeNull();
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
});
