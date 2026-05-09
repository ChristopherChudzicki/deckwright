import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import { IconButton } from "./IconButton";

describe("<IconButton>", () => {
  it("renders with the given aria-label", () => {
    render(
      <IconButton aria-label="Delete">
        <svg aria-hidden="true" />
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls onPress when clicked", async () => {
    const onPress = vi.fn();
    render(
      <IconButton aria-label="Delete" onPress={onPress}>
        <svg aria-hidden="true" />
      </IconButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
