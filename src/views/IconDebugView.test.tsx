import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ITEM_RULES, SCHOOL_ICONS, SPELL_NAME_RULES } from "../cards/iconRules";
import { IconDebugView } from "./IconDebugView";

describe("<IconDebugView>", () => {
  test("default kind is item; rules table shows ITEM_RULES + fallback row", () => {
    render(<IconDebugView />);
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(1 + ITEM_RULES.length + 1);
  });

  test("simulator updates the matched-rule readout when name changes", async () => {
    render(<IconDebugView />);
    await userEvent.type(screen.getByLabelText(/name/i), "Trident");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/trident/i);
  });

  test("item simulator falls back when nothing matches", async () => {
    render(<IconDebugView />);
    await userEvent.type(screen.getByLabelText(/name/i), "Xyzzy");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/no match/i);
  });

  test("toggling to spell shows SPELL_NAME_RULES rows + a schools section", async () => {
    render(<IconDebugView />);
    const spellRadio = screen.getByRole("radio", { name: /spell/i });
    await userEvent.click(spellRadio);
    const rows = screen.getAllByRole("row");
    // header + SPELL_NAME_RULES + fallback row + (schools header + 8 school rows)
    expect(rows.length).toBe(
      1 + SPELL_NAME_RULES.length + 1 + 1 + Object.keys(SCHOOL_ICONS).length,
    );
  });

  test("spell simulator: 'Fireball' resolves to fireball", async () => {
    render(<IconDebugView />);
    await userEvent.click(screen.getByRole("radio", { name: /spell/i }));
    await userEvent.type(screen.getByLabelText(/name/i), "Fireball");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(/\bfireball\b/i);
  });

  test("spell simulator: only school in headerTags resolves to the school icon", async () => {
    render(<IconDebugView />);
    await userEvent.click(screen.getByRole("radio", { name: /spell/i }));
    await userEvent.type(screen.getByLabelText(/header tags/i), "3rd-level evocation");
    expect(screen.getByTestId("simulator-result")).toHaveTextContent(SCHOOL_ICONS.evocation);
  });
});
