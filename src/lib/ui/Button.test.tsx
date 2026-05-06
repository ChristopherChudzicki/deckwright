import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("<Button>", () => {
  it("renders an accessible button with the given label", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("calls onPress when clicked", async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("respects the disabled state", () => {
    render(
      <Button isDisabled onPress={() => {}}>
        Save
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("applies the variant via data-variant", () => {
    render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("data-variant", "primary");
  });

  it("applies size='lg' via data-size", () => {
    render(<Button size="lg">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("data-size", "lg");
  });
});
