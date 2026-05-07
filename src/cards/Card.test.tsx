import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Card } from "./Card";
import { itemCardFactory, spellCardFactory } from "./factories";

describe("<Card>", () => {
  test("shows name, header tags, and body", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByRole("heading", { name: card.name })).toBeInTheDocument();
    for (const tag of card.headerTags) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
    expect(screen.getByText(card.body)).toBeInTheDocument();
  });

  test("renders footer tags when present", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    for (const tag of card.footerTags) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
  });

  test("omits footer when footerTags is empty", () => {
    const card = itemCardFactory.build({ footerTags: [] });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.queryByTestId("card-footer")).not.toBeInTheDocument();
  });

  test("splits body on blank lines into paragraphs", () => {
    const card = itemCardFactory.build({ body: "First paragraph.\n\nSecond paragraph." });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
  });

  test("renders the heuristic-picked icon when iconKey is unset", () => {
    const card = itemCardFactory.build({
      name: "Flame Tongue Trident",
      iconKey: undefined,
    });
    render(<Card card={card} cardsPerPage={4} />);
    const slot = screen.getByTestId("card-icon");
    expect(slot.querySelector("svg")).not.toBeNull();
  });

  test("renders the explicit override icon when iconKey is set", () => {
    const card = itemCardFactory.build({
      name: "Anything",
      iconKey: "trident",
    });
    render(<Card card={card} cardsPerPage={4} />);
    const slot = screen.getByTestId("card-icon");
    expect(slot.querySelector("svg")).not.toBeNull();
  });

  test("does not crash for a stale or unknown iconKey", () => {
    const card = itemCardFactory.build({
      name: "X",
      iconKey: "definitely-removed-icon",
    });
    expect(() => render(<Card card={card} cardsPerPage={4} />)).not.toThrow();
  });

  test("renders the heuristic-picked icon for a spell card with iconKey unset", () => {
    const card = spellCardFactory.build({
      name: "Fireball",
      headerTags: ["3rd-level evocation"],
      iconKey: undefined,
    });
    render(<Card card={card} cardsPerPage={4} />);
    const slot = screen.getByTestId("card-icon");
    expect(slot.querySelector("svg")).not.toBeNull();
  });

  test("renders a rounded-square frame for an item card", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "square");
    expect(frame.querySelector("rect")).not.toBeNull();
  });

  test("renders a hexagon frame for a spell card", () => {
    const card = spellCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "hex");
    expect(frame.querySelector("polygon")).not.toBeNull();
  });
});

describe("<Card> with pagination", () => {
  test("does not suffix title when paginated", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 2, total: 4 }} />);
    expect(screen.getByRole("heading", { name: card.name })).toBeInTheDocument();
  });

  test("renders pagination indicator in the footer", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 2, total: 4 }} />);
    expect(screen.getByTestId("card-pagination")).toHaveTextContent(/^Card 2 of 4$/);
  });

  test("hides header tags on continuation pages", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 2, total: 3 }} />);
    for (const tag of card.headerTags) {
      expect(screen.queryByText(tag)).not.toBeInTheDocument();
    }
  });

  test("shows header tags on the first page when paginated", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 1, total: 3 }} />);
    for (const tag of card.headerTags) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
  });

  test("renders bodyOverride instead of card.body", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} bodyOverride="chunk text" />);
    expect(screen.getByText("chunk text")).toBeInTheDocument();
    expect(screen.queryByText(card.body)).not.toBeInTheDocument();
  });

  test("hides footer tags on continuation pages but keeps pagination", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 2, total: 2 }} />);
    for (const tag of card.footerTags) {
      expect(screen.queryByText(tag)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId("card-pagination")).toBeInTheDocument();
  });

  test("shows footer tags on the first page when paginated", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 1, total: 3 }} />);
    for (const tag of card.footerTags) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
  });

  test("renders footer with pagination only when card has no footerTags", () => {
    const card = itemCardFactory.build({ footerTags: [] });
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 1, total: 3 }} />);
    expect(screen.getByTestId("card-footer")).toBeInTheDocument();
    expect(screen.getByTestId("card-pagination")).toHaveTextContent(/^Card 1 of 3$/);
  });
});

describe("<Card> with markdown body", () => {
  test("renders bold and italic", () => {
    const card = itemCardFactory.build({ body: "**Curse**. _italic_ text." });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByText("Curse")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByText("italic")).toHaveProperty("tagName", "EM");
  });

  test("renders bullet lists", () => {
    const card = itemCardFactory.build({ body: "- alpha\n- beta" });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("renders GFM tables", () => {
    const card = itemCardFactory.build({
      body: "| a | b |\n|---|---|\n| 1 | 2 |",
    });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });
});
