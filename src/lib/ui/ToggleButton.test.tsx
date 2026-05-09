import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import { ToggleButton } from "./ToggleButton";

describe("<ToggleButton>", () => {
  it("renders an accessible button with the given label", () => {
    render(<ToggleButton aria-label="Bold">B</ToggleButton>);
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
  });

  it("calls onChange when toggled", async () => {
    const onChange = vi.fn();
    render(
      <ToggleButton aria-label="Bold" onChange={onChange}>
        B
      </ToggleButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects selected state via aria-pressed", () => {
    render(
      <ToggleButton aria-label="Bold" isSelected>
        B
      </ToggleButton>,
    );
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not call onChange when disabled", async () => {
    const onChange = vi.fn();
    render(
      <ToggleButton aria-label="Bold" isDisabled onChange={onChange}>
        B
      </ToggleButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
