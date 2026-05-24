import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import { Select } from "./Select";

const items = [
  { id: "updated", label: "Last updated" },
  { id: "name", label: "Name" },
];

describe("Select", () => {
  it("shows the label prefix and the selected value in the trigger", () => {
    render(
      <Select label="Sort" selectedKey="updated" items={items} onSelectionChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /sort/i })).toHaveTextContent("Sort: Last updated");
  });

  it("opens a listbox and marks the current option selected", async () => {
    render(
      <Select label="Sort" selectedKey="updated" items={items} onSelectionChange={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /sort/i }));
    expect(screen.getByRole("option", { selected: true })).toHaveAccessibleName("Last updated");
  });

  it("fires onSelectionChange with the chosen id", async () => {
    const onSelectionChange = vi.fn();
    render(
      <Select
        label="Sort"
        selectedKey="updated"
        items={items}
        onSelectionChange={onSelectionChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /sort/i }));
    await userEvent.click(screen.getByRole("option", { name: "Name" }));
    expect(onSelectionChange).toHaveBeenCalledWith("name");
  });

  // The one deliberate class-based assertion: triggerClassName is the load-bearing
  // escape hatch for BrowseApiModal's responsive Type trigger. "extra" is synthetic.
  it("composes triggerClassName onto the trigger", () => {
    render(
      <Select
        label="Type"
        selectedKey="all"
        items={[{ id: "all", label: "All" }]}
        triggerClassName="extra"
        onSelectionChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /type/i })).toHaveClass("extra");
  });
});
