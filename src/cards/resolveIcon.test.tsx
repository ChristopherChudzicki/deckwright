import { describe, expect, test } from "vitest";
import { render, waitFor } from "../test/render";
import { ResolvedIcon } from "./resolveIcon";

describe("<ResolvedIcon>", () => {
  test("renders a known icon", async () => {
    const { container } = render(<ResolvedIcon iconKey="trident" />);
    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });
  });

  test("renders without crashing for an unknown key", async () => {
    const { container } = render(<ResolvedIcon iconKey="definitely-not-a-real-icon" />);
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });
});
