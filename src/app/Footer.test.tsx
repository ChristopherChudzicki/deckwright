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
    expect(link).toHaveAttribute("href", "https://github.com/ChristopherChudzicki/dnd-cards");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
    expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
  });
});
