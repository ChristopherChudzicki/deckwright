import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "../../test/render";
import { IconPickerDialog } from "./IconPickerDialog";

function Harness({ initial, autoHint }: { initial: string | undefined; autoHint?: string }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <>
      <IconPickerDialog value={value} autoHint={autoHint} onChange={setValue} />
      <div data-testid="value">{value === undefined ? "<auto>" : value}</div>
    </>
  );
}

// react-aria-components' GridListItem uses role="row" (not "option").
// Each tile carries the kebab key (or "Auto") as its accessible name via textValue.
const tile = (name: RegExp | string) => screen.getByRole("row", { name });
const findTile = (name: RegExp | string) => screen.findByRole("row", { name });
const queryTile = (name: RegExp | string) => screen.queryByRole("row", { name });

describe("<IconPickerDialog>", () => {
  test("opens on trigger press", async () => {
    render(<Harness initial={undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    expect(screen.getByRole("dialog", { name: "Pick an icon" })).toBeInTheDocument();
  });

  test("close button dismisses without changing value", async () => {
    render(<Harness initial="trident" />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("value")).toHaveTextContent("trident");
  });

  test("selecting the Auto tile sets value to undefined and closes", async () => {
    render(<Harness initial="trident" />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.click(tile(/auto/i));
    expect(screen.getByTestId("value")).toHaveTextContent("<auto>");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("selecting an icon tile sets the kebab key and closes", async () => {
    render(<Harness initial={undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.type(screen.getByRole("searchbox"), "trident");
    await userEvent.click(await findTile("trident"));
    expect(screen.getByTestId("value")).toHaveTextContent("trident");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("search filters visible tiles", async () => {
    render(<Harness initial={undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.type(screen.getByRole("searchbox"), "trident");
    expect(await findTile("trident")).toBeInTheDocument();
    expect(queryTile("broadsword")).not.toBeInTheDocument();
  });

  test("trigger button shows the current key when one is set", () => {
    render(<Harness initial="trident" />);
    expect(screen.getByRole("button", { name: /pick icon.*trident/i })).toBeInTheDocument();
  });

  test("trigger button shows 'Auto' when value is undefined", () => {
    render(<Harness initial={undefined} />);
    expect(screen.getByRole("button", { name: /pick icon.*auto/i })).toBeInTheDocument();
  });

  test("hovering an icon tile shows a tooltip with the kebab key", async () => {
    render(<Harness initial={undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.type(screen.getByRole("searchbox"), "trident");
    await userEvent.hover(await findTile("trident"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("trident");
  });

  test("leaving the tile hides the tooltip", async () => {
    render(<Harness initial={undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.type(screen.getByRole("searchbox"), "trident");
    const tridentTile = await findTile("trident");
    await userEvent.hover(tridentTile);
    await screen.findByRole("tooltip");
    await userEvent.unhover(tridentTile);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("pre-selects the Auto tile when value is undefined", async () => {
    render(<Harness initial={undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    expect(tile(/auto/i)).toHaveAttribute("data-current", "true");
  });

  test("pre-selects the chosen tile when value is set", async () => {
    render(<Harness initial="trident" />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.type(screen.getByRole("searchbox"), "trident");
    expect(await findTile("trident")).toHaveAttribute("data-current", "true");
    expect(tile(/auto/i)).not.toHaveAttribute("data-current", "true");
  });

  test("shows autoHint inside the dialog when value is undefined", async () => {
    render(<Harness initial={undefined} autoHint="Auto chose fireball based on name." />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    expect(screen.getByText(/Auto chose fireball based on name\./)).toBeInTheDocument();
  });

  test("hides autoHint when value is set", async () => {
    render(<Harness initial="trident" autoHint="Auto chose fireball based on name." />);
    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    expect(screen.queryByText(/Auto chose fireball/)).not.toBeInTheDocument();
  });
});
