import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import { DialogShell } from "./DialogShell";

describe("<DialogShell>", () => {
  it("renders the dialog with the given aria-label", () => {
    render(
      <DialogShell isOpen aria-label="Pick a thing" onOpenChange={() => {}}>
        {() => <p>Body</p>}
      </DialogShell>,
    );
    expect(screen.getByRole("dialog", { name: "Pick a thing" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when dismissed via Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <DialogShell isOpen aria-label="Pick a thing" onOpenChange={onOpenChange}>
        {() => <button type="button">Inside</button>}
      </DialogShell>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("exposes a close function to the children render-prop", async () => {
    const onOpenChange = vi.fn();
    render(
      <DialogShell isOpen aria-label="Pick a thing" onOpenChange={onOpenChange}>
        {({ close }) => (
          <button type="button" onClick={close}>
            Close me
          </button>
        )}
      </DialogShell>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close me" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports bleed for full-bleed layouts", () => {
    render(
      <DialogShell isOpen aria-label="Bare" onOpenChange={() => {}} bleed>
        {() => <p>Body</p>}
      </DialogShell>,
    );
    expect(screen.getByRole("dialog", { name: "Bare" })).toHaveAttribute("data-bleed");
  });
});
