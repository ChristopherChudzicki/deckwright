import { describe, expect, test } from "vitest";
import { render, screen } from "../test/render";
import { FramedIcon } from "./FramedIcon";

describe("<FramedIcon>", () => {
  test("renders a rounded-square frame and a plain glyph for an item", () => {
    const { container } = render(<FramedIcon kind="item" iconKey="trident" />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "square");
    expect(frame.querySelector("rect")).not.toBeNull();
    expect(frame.querySelector("polygon")).toBeNull();
    expect(container.querySelector('[class*="glyph"]')?.className).not.toMatch(/glyphSpell/);
  });

  test("renders a hexagon frame and an inset spell glyph for a spell", () => {
    const { container } = render(<FramedIcon kind="spell" iconKey="fireball" />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "hex");
    expect(frame.querySelector("polygon")).not.toBeNull();
    expect(frame.querySelector("rect")).toBeNull();
    expect(container.querySelector('[class*="glyph"]')?.className).toMatch(/glyphSpell/);
  });
});
