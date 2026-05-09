import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/render";
import { ToggleButton } from "./ToggleButton";
import { ToggleButtonGroup } from "./ToggleButtonGroup";

describe("<ToggleButtonGroup>", () => {
  it("renders its children inside a group", () => {
    render(
      <ToggleButtonGroup aria-label="Alignment" selectionMode="single">
        <ToggleButton id="left">Left</ToggleButton>
        <ToggleButton id="right">Right</ToggleButton>
      </ToggleButtonGroup>,
    );
    expect(screen.getByRole("radio", { name: "Left" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Right" })).toBeInTheDocument();
  });

  it("toggles single selection through the children", async () => {
    function Harness() {
      const [keys, setKeys] = useState<Set<string>>(new Set(["left"]));
      return (
        <ToggleButtonGroup
          aria-label="Alignment"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={keys}
          onSelectionChange={(next) => setKeys(next as Set<string>)}
        >
          <ToggleButton id="left">Left</ToggleButton>
          <ToggleButton id="right">Right</ToggleButton>
        </ToggleButtonGroup>
      );
    }
    render(<Harness />);
    const left = screen.getByRole("radio", { name: "Left" });
    const right = screen.getByRole("radio", { name: "Right" });
    expect(left).toBeChecked();
    expect(right).not.toBeChecked();
    await userEvent.click(right);
    expect(left).not.toBeChecked();
    expect(right).toBeChecked();
  });
});
