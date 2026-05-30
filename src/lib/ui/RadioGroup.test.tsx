import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/render";
import { Radio, RadioGroup } from "./RadioGroup";

describe("<RadioGroup>", () => {
  it("renders its options as radios inside a radiogroup", () => {
    render(
      <RadioGroup aria-label="Alignment" defaultValue="left">
        <Radio value="left">Left</Radio>
        <Radio value="right">Right</Radio>
      </RadioGroup>,
    );
    expect(screen.getByRole("radiogroup", { name: "Alignment" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Left" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Right" })).not.toBeChecked();
  });

  it("moves selection to the chosen option", async () => {
    function Harness() {
      const [value, setValue] = useState("left");
      return (
        <RadioGroup aria-label="Alignment" value={value} onChange={setValue}>
          <Radio value="left">Left</Radio>
          <Radio value="right">Right</Radio>
        </RadioGroup>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: "Right" }));
    expect(screen.getByRole("radio", { name: "Right" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Left" })).not.toBeChecked();
  });

  it("moves selection with the arrow keys", async () => {
    render(
      <RadioGroup aria-label="Alignment" defaultValue="left">
        <Radio value="left">Left</Radio>
        <Radio value="right">Right</Radio>
      </RadioGroup>,
    );
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Left" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Right" })).toBeChecked();
  });
});
