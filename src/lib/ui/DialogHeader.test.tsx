import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import { DialogHeader } from "./DialogHeader";

describe("<DialogHeader>", () => {
  it("renders the title and a default Close button", () => {
    render(<DialogHeader title="My dialog" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "My dialog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = vi.fn();
    render(<DialogHeader title="My dialog" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders middle children between title and close button", () => {
    render(
      <DialogHeader title="My dialog" onClose={() => {}}>
        <span>middle content</span>
      </DialogHeader>,
    );
    expect(screen.getByText("middle content")).toBeInTheDocument();
  });
});
