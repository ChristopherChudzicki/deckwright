import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "../../test/render";
import { Checkbox } from "./Checkbox";

function Harness() {
  const [selected, setSelected] = useState(false);
  return (
    <Checkbox isSelected={selected} onChange={setSelected}>
      Accept
    </Checkbox>
  );
}

describe("Checkbox", () => {
  test("renders a checkbox with its label as the accessible name", () => {
    render(
      <Checkbox isSelected={false} onChange={() => {}}>
        Accept
      </Checkbox>,
    );
    expect(screen.getByRole("checkbox", { name: "Accept" })).toBeInTheDocument();
  });

  test("toggles on click", async () => {
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: "Accept" });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(box).toBeChecked();
  });

  test("indeterminate renders as partially checked", () => {
    render(
      <Checkbox isSelected={false} isIndeterminate onChange={() => {}} aria-label="Select all">
        {null}
      </Checkbox>,
    );
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBePartiallyChecked();
  });
});
