import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FirstDeckDialog } from "./FirstDeckDialog";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...rest
    }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
      <a href={to as string} {...rest}>
        {children}
      </a>
    ),
  };
});

describe("<FirstDeckDialog>", () => {
  it("renders the heading and copy when open", () => {
    render(<FirstDeckDialog isOpen onOpenChange={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /your decks live on this browser/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/30 days/i)).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<FirstDeckDialog isOpen={false} onOpenChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onOpenChange(false) when "Not yet" is clicked', async () => {
    const onOpenChange = vi.fn();
    render(<FirstDeckDialog isOpen onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: /not yet/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('"Sign in now" is a link to /login', () => {
    render(<FirstDeckDialog isOpen onOpenChange={() => {}} />);
    const link = screen.getByRole("link", { name: /sign in now/i });
    expect(link).toHaveAttribute("href", "/login");
  });
});
