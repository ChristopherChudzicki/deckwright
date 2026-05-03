import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Card } from "./Card";
import { itemCardFactory } from "./factories";

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
    expect(screen.getByTestId("card-icon")).toBeInTheDocument();
  });

  test("treats an empty-string imageUrl as no image and shows the fallback icon", () => {
    const card = itemCardFactory.build({ imageUrl: "" });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.queryByTestId("card-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-icon")).toBeInTheDocument();
  });

  test("shows a fallback icon when the card has no imageUrl", () => {
    const card = itemCardFactory.build({ imageUrl: undefined });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.queryByTestId("card-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-icon")).toBeInTheDocument();
  });

  test("renders the heuristic-picked icon when iconKey is unset", () => {
    const card = itemCardFactory.build({
      name: "Flame Tongue Trident",
      imageUrl: undefined,
      iconKey: undefined,
    });
    render(<Card card={card} cardsPerPage={4} />);
    const slot = screen.getByTestId("card-icon");
    expect(slot.querySelector("svg")).not.toBeNull();
  });

  test("renders the explicit override icon when iconKey is set", () => {
    const card = itemCardFactory.build({
      name: "Anything",
      imageUrl: undefined,
      iconKey: "trident",
    });
    render(<Card card={card} cardsPerPage={4} />);
    const slot = screen.getByTestId("card-icon");
    expect(slot.querySelector("svg")).not.toBeNull();
  });

  test("does not crash for a stale or unknown iconKey", () => {
    const card = itemCardFactory.build({
      name: "X",
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

describe("<Card> with title autofit", () => {
  const LINE_HEIGHT_PX = 20;
  let titleHeights: Record<string, number> = {};
  let originalOffsetHeight: PropertyDescriptor | undefined;
  let originalGetComputedStyle: typeof window.getComputedStyle;

  beforeEach(() => {
    originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLHeadingElement.prototype,
      "offsetHeight",
    );
    Object.defineProperty(HTMLHeadingElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLHeadingElement) {
        const fontSize = this.style.fontSize;
        const key = fontSize === "" ? "1" : fontSize.replace("em", "");
        return titleHeights[key] ?? 0;
      },
    });

    originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      const real = originalGetComputedStyle.call(window, el, pseudo);
      if (el instanceof HTMLHeadingElement) {
        return new Proxy(real, {
          get(target, prop, receiver) {
            if (prop === "lineHeight") return `${LINE_HEIGHT_PX}px`;
            const value = Reflect.get(target, prop, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      }
      return real;
    }) as typeof window.getComputedStyle;
  });

  afterEach(() => {
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLHeadingElement.prototype, "offsetHeight", originalOffsetHeight);
    } else {
      delete (HTMLHeadingElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
    window.getComputedStyle = originalGetComputedStyle;
    titleHeights = {};
  });

  test("title that fits on one line gets no inline font-size", async () => {
    titleHeights = { "1": LINE_HEIGHT_PX };
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    const heading = screen.getByRole("heading", { name: card.name });
    await waitFor(() => {
      expect(heading.style.fontSize).toBe("");
    });
  });

  test("title that wraps at 1.0 but fits at 0.9 shrinks to 0.9em", async () => {
    titleHeights = { "1": LINE_HEIGHT_PX * 2, "0.9": LINE_HEIGHT_PX };
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    const heading = screen.getByRole("heading", { name: card.name });
    await waitFor(() => {
      expect(heading.style.fontSize).toBe("0.9em");
    });
  });

  test("title that wraps at every scale ends up unstyled (gave-up state)", async () => {
    titleHeights = {
      "1": LINE_HEIGHT_PX * 2,
      "0.9": LINE_HEIGHT_PX * 2,
      "0.8": LINE_HEIGHT_PX * 2,
    };
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    const heading = screen.getByRole("heading", { name: card.name });
    await waitFor(() => {
      expect(heading.style.fontSize).toBe("");
    });
  });
});
