import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Announcement, AnnouncementProvider, useSetNextAnnouncement } from "./Announcement";

function Setter({ message }: { message: string | null }) {
  const setNext = useSetNextAnnouncement();
  return (
    <button type="button" onClick={() => setNext(message)}>
      set
    </button>
  );
}

describe("<Announcement>", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when no announcement is queued", () => {
    const { container } = render(
      <AnnouncementProvider>
        <Announcement />
      </AnnouncementProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the queued message when mounted after the setter ran", async () => {
    const user = userEvent.setup();
    function Harness() {
      return (
        <AnnouncementProvider>
          <Setter message="Signed in" />
          <Announcement />
        </AnnouncementProvider>
      );
    }
    render(<Harness />);
    await user.click(screen.getByText("set"));
    expect(screen.getByRole("status")).toHaveTextContent("Signed in");
  });

  it("auto-dismisses after 10 seconds", async () => {
    const user = userEvent.setup();
    render(
      <AnnouncementProvider>
        <Setter message="Imported 3 decks" />
        <Announcement />
      </AnnouncementProvider>,
    );
    await user.click(screen.getByText("set"));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses on user click of the close button", async () => {
    const user = userEvent.setup();
    render(
      <AnnouncementProvider>
        <Setter message="Imported 3 decks" />
        <Announcement />
      </AnnouncementProvider>,
    );
    await user.click(screen.getByText("set"));
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it('marks the message with role="status" and aria-live="polite"', async () => {
    const user = userEvent.setup();
    render(
      <AnnouncementProvider>
        <Setter message="Hello" />
        <Announcement />
      </AnnouncementProvider>,
    );
    await user.click(screen.getByText("set"));
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
