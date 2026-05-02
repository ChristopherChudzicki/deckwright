import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { TagInput } from "./TagInput";

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return <TagInput aria-label="footer tags" value={value} onChange={setValue} />;
}

describe("<TagInput>", () => {
  test("renders existing tags as chips", () => {
    render(<Harness initial={["500 gp", "10 lb"]} />);
    expect(screen.getByText("500 gp")).toBeInTheDocument();
    expect(screen.getByText("10 lb")).toBeInTheDocument();
  });

  test("typing and pressing Enter commits a new chip and clears the input", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "rare{Enter}");
    expect(screen.getByText("rare")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("typing a comma commits a chip", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "uncommon,");
    expect(screen.getByText("uncommon")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("Enter on an empty/whitespace input does nothing", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "   {Enter}");
    expect(screen.queryByText("   ")).not.toBeInTheDocument();
    expect(input).toHaveValue("   ");
  });

  test("Backspace on an empty input removes the last chip", async () => {
    render(<Harness initial={["a", "b"]} />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    input.focus();
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByText("b")).not.toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  test("Backspace with text in the input does NOT remove a chip", async () => {
    render(<Harness initial={["a"]} />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "x");
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("clicking the per-tag remove button removes that tag", async () => {
    render(<Harness initial={["500 gp", "10 lb"]} />);
    await userEvent.click(screen.getByRole("button", { name: /remove 500 gp/i }));
    expect(screen.queryByText("500 gp")).not.toBeInTheDocument();
    expect(screen.getByText("10 lb")).toBeInTheDocument();
  });

  test("trims whitespace around a committed chip", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "   spaced   {Enter}");
    expect(screen.getByText("spaced")).toBeInTheDocument();
  });

  test("blurring the input commits any pending text as a chip", async () => {
    render(
      <>
        <Harness />
        <button type="button">elsewhere</button>
      </>,
    );
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "draft");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  test("comma-then-blur does not double-commit the same chip", async () => {
    render(
      <>
        <Harness />
        <button type="button">elsewhere</button>
      </>,
    );
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "foo,");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getAllByText("foo")).toHaveLength(1);
  });
});
