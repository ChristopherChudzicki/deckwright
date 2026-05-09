import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import { Switch } from "./Switch";

describe("<Switch>", () => {
  it("renders an accessible switch with the given label", () => {
    render(<Switch>Show all</Switch>);
    expect(screen.getByRole("switch", { name: "Show all" })).toBeInTheDocument();
  });

  it("calls onChange with the next selected state when toggled", async () => {
    const onChange = vi.fn();
    render(<Switch onChange={onChange}>Show all</Switch>);
    await userEvent.click(screen.getByRole("switch", { name: "Show all" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects controlled isSelected via the switch role state", async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <Switch isSelected={on} onChange={setOn}>
          Show all
        </Switch>
      );
    }
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Show all" });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(sw).toBeChecked();
  });

  it("toggles via Space key", async () => {
    const onChange = vi.fn();
    render(<Switch onChange={onChange}>Show all</Switch>);
    const sw = screen.getByRole("switch", { name: "Show all" });
    sw.focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not call onChange when disabled", async () => {
    const onChange = vi.fn();
    render(
      <Switch isDisabled onChange={onChange}>
        Show all
      </Switch>,
    );
    await userEvent.click(screen.getByRole("switch", { name: "Show all" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
