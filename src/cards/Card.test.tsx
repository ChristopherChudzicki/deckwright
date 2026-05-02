import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Card } from "./Card";
import { itemCardFactory } from "./factories";

describe("<Card>", () => {
  test("shows name, type line, and body", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByRole("heading", { name: card.name })).toBeInTheDocument();
    expect(screen.getByText(card.typeLine)).toBeInTheDocument();
    expect(screen.getByText(card.body)).toBeInTheDocument();
  });

  test("renders cost/weight when present", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByText(card.costWeight!)).toBeInTheDocument();
  });

  test("omits footer when cost/weight is absent", () => {
    const card = itemCardFactory.build({ costWeight: undefined });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.queryByTestId("card-footer")).not.toBeInTheDocument();
  });

  test("renders image when imageUrl is set", () => {
    const card = itemCardFactory.build({ imageUrl: "https://example.com/pic.png" });
    render(<Card card={card} cardsPerPage={4} />);
    const img = screen.getByTestId("card-image");
    expect(img).toHaveAttribute("src", card.imageUrl!);
  });

  test("splits body on blank lines into paragraphs", () => {
    const card = itemCardFactory.build({ body: "First paragraph.\n\nSecond paragraph." });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
  });

  test("replaces the image with a fallback icon when the src fails to load", () => {
    const card = itemCardFactory.build({ imageUrl: "https://example.com/broken.png" });
    render(<Card card={card} cardsPerPage={4} />);
    const img = screen.getByTestId("card-image");
    expect(img).toHaveAttribute("src", card.imageUrl!);
    fireEvent.error(img);
    expect(screen.queryByTestId("card-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-fallback-icon")).toBeInTheDocument();
  });

  test("treats an empty-string imageUrl as no image and shows the fallback icon", () => {
    const card = itemCardFactory.build({ imageUrl: "" });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.queryByTestId("card-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-fallback-icon")).toBeInTheDocument();
  });

  test("shows a fallback icon when the card has no imageUrl", () => {
    const card = itemCardFactory.build({ imageUrl: undefined });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.queryByTestId("card-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-fallback-icon")).toBeInTheDocument();
  });

  test("renders the heuristic-picked icon when iconKey is unset", () => {
    const card = itemCardFactory.build({
      name: "Flame Tongue Trident",
      typeLine: "Weapon, rare",
      imageUrl: undefined,
      iconKey: undefined,
    });
    render(<Card card={card} cardsPerPage={4} />);
    const slot = screen.getByTestId("card-fallback-icon");
    expect(slot.querySelector("svg")).not.toBeNull();
  });

  test("renders the explicit override icon when iconKey is set", () => {
    const card = itemCardFactory.build({
      name: "Anything",
      typeLine: "",
      imageUrl: undefined,
      iconKey: "trident",
    });
    render(<Card card={card} cardsPerPage={4} />);
    const slot = screen.getByTestId("card-fallback-icon");
    expect(slot.querySelector("svg")).not.toBeNull();
  });

  test("does not crash for a stale or unknown iconKey", () => {
    const card = itemCardFactory.build({
      name: "X",
      typeLine: "",
      imageUrl: undefined,
      iconKey: "definitely-removed-icon",
    });
    expect(() => render(<Card card={card} cardsPerPage={4} />)).not.toThrow();
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

  test("hides type line on continuation pages", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 2, total: 3 }} />);
    expect(screen.queryByText(card.typeLine)).not.toBeInTheDocument();
  });

  test("shows type line on the first page when paginated", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 1, total: 3 }} />);
    expect(screen.getByText(card.typeLine)).toBeInTheDocument();
  });

  test("renders bodyOverride instead of card.body", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} bodyOverride="chunk text" />);
    expect(screen.getByText("chunk text")).toBeInTheDocument();
    expect(screen.queryByText(card.body)).not.toBeInTheDocument();
  });

  test("retains costWeight on continuation pages alongside pagination", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 2, total: 2 }} />);
    expect(screen.getByText(card.costWeight!)).toBeInTheDocument();
    expect(screen.getByTestId("card-pagination")).toBeInTheDocument();
  });

  test("renders footer with pagination only when card has no costWeight", () => {
    const card = itemCardFactory.build({ costWeight: undefined });
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 1, total: 3 }} />);
    expect(screen.getByTestId("card-footer")).toBeInTheDocument();
    expect(screen.getByTestId("card-pagination")).toHaveTextContent(/^Card 1 of 3$/);
  });
});
