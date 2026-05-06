import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ITEM_RULES } from "../cards/iconRules";
import { IconDebugView } from "./IconDebugView";

describe("<IconDebugView>", () => {
  test("renders a row per ITEM_RULES entry plus a fallback row", () => {
    render(<IconDebugView />);
    const rows = screen.getAllByRole("row");
    // header row + ITEM_RULES.length + fallback row
    expect(rows.length).toBe(1 + ITEM_RULES.length + 1);
  });

  test("simulator updates the matched-rule readout when name changes", async () => {
    render(<IconDebugView />);
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.type(nameInput, "Trident");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/trident/i);
  });

  test("simulator falls back when nothing matches", async () => {
    render(<IconDebugView />);
    await userEvent.type(screen.getByLabelText(/name/i), "Xyzzy");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/no match/i);
  });
});
