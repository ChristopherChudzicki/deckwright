import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../test/render";
import { ImportAccountDialog } from "./ImportAccountDialog";

describe("<ImportAccountDialog>", () => {
  const noop = () => {};

  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportAccountDialog
        isOpen={false}
        deckCount={3}
        onImport={noop}
        onSkip={noop}
        onCancel={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders heading, deck count, and unrecoverable warning", () => {
    render(
      <ImportAccountDialog isOpen deckCount={3} onImport={noop} onSkip={noop} onCancel={noop} />,
    );
    expect(
      screen.getByRole("heading", { name: /you already have a dnd-cards account/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/bring your/)).toHaveTextContent("3 decks");
    expect(screen.getByText(/cannot be recovered/i)).toBeInTheDocument();
  });

  it("uses the singular form when deckCount is 1", () => {
    render(
      <ImportAccountDialog isOpen deckCount={1} onImport={noop} onSkip={noop} onCancel={noop} />,
    );
    expect(screen.getByText(/bring your/)).toHaveTextContent("1 deck");
    expect(screen.getByRole("button", { name: /yes, import 1 deck$/i })).toBeInTheDocument();
  });

  it("calls onImport when the primary action is clicked", async () => {
    const onImport = vi.fn();
    render(
      <ImportAccountDialog
        isOpen
        deckCount={2}
        onImport={onImport}
        onSkip={noop}
        onCancel={noop}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /yes, import 2 decks/i }));
    expect(onImport).toHaveBeenCalled();
  });

  it("calls onSkip (NOT onCancel) when the skip text link is clicked", async () => {
    const onSkip = vi.fn();
    const onCancel = vi.fn();
    render(
      <ImportAccountDialog
        isOpen
        deckCount={2}
        onImport={noop}
        onSkip={onSkip}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /skip — leave decks behind/i }));
    expect(onSkip).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel (NOT onSkip) when the dialog is dismissed via Escape", async () => {
    const onSkip = vi.fn();
    const onCancel = vi.fn();
    render(
      <ImportAccountDialog
        isOpen
        deckCount={2}
        onImport={noop}
        onSkip={onSkip}
        onCancel={onCancel}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("calls onCancel (NOT onSkip) when the labelled Cancel button is clicked", async () => {
    const onSkip = vi.fn();
    const onCancel = vi.fn();
    render(
      <ImportAccountDialog
        isOpen
        deckCount={2}
        onImport={noop}
        onSkip={onSkip}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });
});
