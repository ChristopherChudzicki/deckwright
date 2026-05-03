import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Link } from "./Link";

describe("<Link>", () => {
  it("renders an anchor with the given href", () => {
    render(<Link href="https://example.test/docs">Docs</Link>);
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://example.test/docs",
    );
  });

  it("applies an extra className alongside the primitive class", () => {
    render(
      <Link href="https://example.test/" className="extra">
        Home
      </Link>,
    );
    expect(screen.getByRole("link", { name: "Home" }).className).toContain("extra");
  });

  it("forwards target and rel attributes", () => {
    render(
      <Link href="https://example.test/" target="_blank" rel="noopener noreferrer">
        External
      </Link>,
    );
    const link = screen.getByRole("link", { name: "External" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
