import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportAccountDialog } from "./ImportAccountDialog";

describe("<ImportAccountDialog>", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportAccountDialog isOpen={false} deckCount={3} onImport={() => {}} onSkip={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders heading, deck count, and unrecoverable warning", () => {
    render(<ImportAccountDialog isOpen deckCount={3} onImport={() => {}} onSkip={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /you already have a dnd-cards account/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/bring your/)).toHaveTextContent("3 decks");
    expect(screen.getByText(/cannot be recovered/i)).toBeInTheDocument();
  });

  it("calls onImport when the primary action is clicked", async () => {
    const onImport = vi.fn();
    render(<ImportAccountDialog isOpen deckCount={2} onImport={onImport} onSkip={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /yes, import 2 decks/i }));
    expect(onImport).toHaveBeenCalled();
  });

  it("calls onSkip when the skip text link is clicked", async () => {
    const onSkip = vi.fn();
    render(<ImportAccountDialog isOpen deckCount={2} onImport={() => {}} onSkip={onSkip} />);
    await userEvent.click(screen.getByRole("button", { name: /skip — leave decks behind/i }));
    expect(onSkip).toHaveBeenCalled();
  });
});
