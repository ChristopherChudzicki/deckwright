import { describe, expect, test } from "vitest";
import { render, screen, waitFor } from "../../test/render";
import { IconPreview } from "./IconPreview";

describe("<IconPreview>", () => {
  test("renders an icon for a known key", async () => {
    render(<IconPreview iconKey="trident" label="trident" />);
    const wrapper = screen.getByLabelText("trident");
    expect(wrapper).toBeInTheDocument();
    await waitFor(() => {
      expect(wrapper.querySelector("svg")).not.toBeNull();
    });
  });

  test("renders without throwing for an unknown key", () => {
    render(<IconPreview iconKey="not-a-real-icon" label="not-a-real-icon" />);
    expect(screen.getByLabelText("not-a-real-icon")).toBeInTheDocument();
  });
});
