import { describe, expect, test } from "vitest";
import { render, screen } from "../test/render";
import { FramedIcon } from "./FramedIcon";

describe("<FramedIcon>", () => {
  test("renders a rounded-square frame with a rect for an item", () => {
    render(<FramedIcon kind="item" iconKey="trident" />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "square");
    expect(frame.querySelector("rect")).not.toBeNull();
    expect(frame.querySelector("polygon")).toBeNull();
  });

  test("renders a hexagon frame with a polygon for a spell", () => {
    render(<FramedIcon kind="spell" iconKey="trident" />);
    const frame = screen.getByTestId("card-icon-frame");
    expect(frame).toHaveAttribute("data-frame", "hex");
    expect(frame.querySelector("polygon")).not.toBeNull();
    expect(frame.querySelector("rect")).toBeNull();
  });
});
