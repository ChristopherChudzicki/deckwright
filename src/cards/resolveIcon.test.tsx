import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, waitFor } from "../test/render";
import { ensureIcons, ResolvedIcon } from "./resolveIcon";

describe("<ResolvedIcon>", () => {
  beforeAll(async () => {
    await ensureIcons();
  });

  test("renders a known icon", async () => {
    const { container } = render(<ResolvedIcon iconKey="trident" />);
    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });
  });

  test("warns once for an unknown iconKey in dev", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unknownKey = `definitely-not-a-real-icon-${Date.now()}`;
    render(<ResolvedIcon iconKey={unknownKey} />);
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(unknownKey));
    });
    warnSpy.mockRestore();
  });
});
