import { describe, expect, it } from "vitest";
import { render, screen, within } from "../test/render";
import { Footer } from "./Footer";

describe("<Footer>", () => {
  it("renders a contentinfo landmark", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("links to the GitHub repo with a visible label", () => {
    render(<Footer />);
    const link = within(screen.getByRole("contentinfo")).getByRole("link", {
      name: /view source on github/i,
    });
    expect(link).toHaveAttribute("href", "https://github.com/ChristopherChudzicki/deckwright");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
    expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
  });

  it("credits Open5e with a link to open5e.com", () => {
    render(<Footer />);
    const link = within(screen.getByRole("contentinfo")).getByRole("link", {
      name: /open5e/i,
    });
    expect(link).toHaveAttribute("href", "https://open5e.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
    expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
  });
});
