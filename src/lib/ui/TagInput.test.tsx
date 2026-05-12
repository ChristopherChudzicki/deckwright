import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
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

  test("typing a comma does NOT commit a chip; the comma is preserved as text", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "5,000 gp");
    expect(input).toHaveValue("5,000 gp");
    expect(screen.queryByText("5,000 gp")).not.toBeInTheDocument();
    await userEvent.type(input, "{Enter}");
    expect(screen.getByText("5,000 gp")).toBeInTheDocument();
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

  test("blur commits pending text including any commas in the value", async () => {
    render(
      <>
        <Harness />
        <button type="button">elsewhere</button>
      </>,
    );
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "foo,");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByText("foo,")).toBeInTheDocument();
  });

  test("clicking a chip enters edit mode with text pre-filled and selected", async () => {
    render(<Harness initial={["fire"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("fire");
    await userEvent.keyboard("ice");
    expect(input).toHaveValue("ice");
  });

  test("editing + Enter commits the new value at the same index", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["fire", "ice"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("lightning|ice");
  });

  test("edit + Escape reverts and does not bubble", async () => {
    const onOuterKey = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: test-only outer listener verifying event propagation
      <div onKeyDown={onOuterKey}>
        <Harness initial={["fire"]} />
      </div>,
    );
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "ice");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("fire")).toBeInTheDocument();
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    onOuterKey.mockClear();
    await userEvent.click(screen.getByText("fire"));
    await userEvent.keyboard("a");
    expect(onOuterKey).toHaveBeenCalled();
    onOuterKey.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOuterKey).not.toHaveBeenCalled();
  });

  test("empty edit commit removes the chip and focuses the gap at that index", async () => {
    render(<Harness initial={["fire", "ice", "wind"]} />);
    await userEvent.click(screen.getByText("ice"));
    const input = screen.getByRole("textbox", { name: /edit tag 'ice'/i });
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /insert tag before wind/i })).toHaveFocus();
  });

  test("whitespace-only edit commit removes the chip", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "   {Enter}");
    expect(screen.queryByText("fire")).not.toBeInTheDocument();
  });

  test("edit + blur to outside the wrapper commits and does not restore focus", async () => {
    render(
      <>
        <Harness initial={["fire"]} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning");
    const outsideBtn = screen.getByRole("button", { name: "elsewhere" });
    await userEvent.click(outsideBtn);
    expect(screen.getByText("lightning")).toBeInTheDocument();
    expect(outsideBtn).toHaveFocus();
  });

  test("× on a chip in edit mode removes without committing edit text and focuses the gap", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning");
    await userEvent.click(screen.getByRole("button", { name: /remove fire/i }));
    expect(screen.queryByText("fire")).not.toBeInTheDocument();
    expect(screen.queryByText("lightning")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
  });

  test("clicking another chip while editing commits then opens edit on the new chip", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "lightning");
    await userEvent.click(screen.getByText("ice"));
    expect(screen.getByText("lightning")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /edit tag 'ice'/i })).toHaveFocus();
  });

  test("clicking a gap while editing commits the edit then opens insert at that gap", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const editInput = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "lightning");
    await userEvent.click(screen.getByRole("button", { name: /insert tag before ice/i }));
    expect(screen.getByText("lightning")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /insert tag before ice/i })).toHaveFocus();
  });

  test("pasting 'a\\nb' into an edit and committing yields a single chip 'a b'", async () => {
    render(<Harness initial={["x"]} />);
    await userEvent.click(screen.getByText("x"));
    const input = screen.getByRole("textbox", { name: /edit tag 'x'/i });
    await userEvent.clear(input);
    input.focus();
    await userEvent.paste("a\nb");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("a b")).toBeInTheDocument();
    expect(screen.queryByText("a\nb")).not.toBeInTheDocument();
  });

  test("non-empty edit commit is trimmed", async () => {
    render(<Harness initial={["x"]} />);
    await userEvent.click(screen.getByText("x"));
    const input = screen.getByRole("textbox", { name: /edit tag 'x'/i });
    await userEvent.clear(input);
    await userEvent.type(input, "   trimmed   {Enter}");
    expect(screen.getByText("trimmed")).toBeInTheDocument();
  });

  test("arrow keys traverse slots in order: gap → chip → gap → trailing", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getAllByRole("listitem")[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag before ice/i })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getAllByRole("listitem")[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
  });

  test("ArrowLeft inside non-empty trailing input moves the caret, does not navigate or commit", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i }) as HTMLInputElement;
    trailing.focus();
    await userEvent.type(trailing, "rare");
    await userEvent.keyboard("{ArrowLeft}");
    expect(trailing).toHaveValue("rare");
    expect(trailing).toHaveFocus();
    expect(trailing.selectionStart).toBe(3);
  });

  test("tabbing into the list lands on the trailing input by default", async () => {
    render(
      <>
        <button type="button">before</button>
        <Harness initial={["fire"]} />
      </>,
    );
    screen.getByRole("button", { name: "before" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("textbox", { name: /footer tags/i })).toHaveFocus();
  });

  test("Arrow Right from trailing goes nowhere; Arrow Left from leading gap goes nowhere", async () => {
    render(<Harness initial={["a"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(trailing).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toHaveFocus();
  });

  test("Enter on a focused chip enters edit mode", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: /edit tag 'fire'/i })).toHaveFocus();
  });

  test("F2 on a focused chip enters edit mode", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{F2}");
    expect(screen.getByRole("textbox", { name: /edit tag 'fire'/i })).toHaveFocus();
  });

  test("Enter on a focused gap opens insert with empty draft", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await userEvent.keyboard("{Enter}");
    const insertInput = screen.getByRole("textbox", { name: /insert tag at start/i });
    expect(insertInput).toHaveFocus();
    expect(insertInput).toHaveValue("");
  });

  test("printable key on focused gap opens insert with that key as initial draft", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await userEvent.keyboard("x");
    const insertInput = screen.getByRole("textbox", { name: /insert tag at start/i });
    expect(insertInput).toHaveValue("x");
    expect(insertInput).toHaveFocus();
  });

  test("Shift+letter on focused gap opens insert with capital letter", async () => {
    render(<Harness initial={["fire"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await userEvent.keyboard("X");
    const insertInput = screen.getByRole("textbox", { name: /insert tag at start/i });
    expect(insertInput).toHaveValue("X");
  });

  test("Delete on focused chip removes it; Backspace also removes", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{Delete}");
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    expect(screen.getByText("fire")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByText("fire")).not.toBeInTheDocument();
  });

  test("after Delete removes a chip, focus lands on the gap at the deleted index", async () => {
    render(<Harness initial={["fire", "ice", "wind"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    await userEvent.keyboard("{Delete}");
    expect(screen.getByRole("button", { name: /insert tag before wind/i })).toHaveFocus();
  });

  test("Backspace on empty trailing input removes last chip; focus stays on trailing", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByText("ice")).not.toBeInTheDocument();
    expect(trailing).toHaveFocus();
  });

  test("Backspace inside non-empty edit input edits text, does not remove chip", async () => {
    render(<Harness initial={["fire", "ice"]} />);
    await userEvent.click(screen.getByText("fire"));
    const input = screen.getByRole("textbox", { name: /edit tag 'fire'/i });
    await userEvent.keyboard("{End}{Backspace}");
    expect(input).toHaveValue("fir");
    expect(screen.getByText("ice")).toBeInTheDocument();
  });

  test("clicking a gap opens an input at that index; typing + Enter inserts at that index", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "c"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByRole("button", { name: /insert tag before c/i }));
    const insertInput = screen.getByRole("textbox", { name: /insert tag before c/i });
    await userEvent.type(insertInput, "b{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|b|c");
  });

  test("empty insert commit is a no-op", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "c"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByRole("button", { name: /insert tag before c/i }));
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|c");
  });

  test("whitespace-only insert commit is a no-op", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "c"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByRole("button", { name: /insert tag before c/i }));
    await userEvent.keyboard("   {Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|c");
  });

  test("after a successful insert at gap N, the next insert lands at N+1", async () => {
    const Watcher = () => {
      const [v, setV] = useState<string[]>(["a", "d"]);
      return (
        <>
          <TagInput aria-label="footer tags" value={v} onChange={setV} />
          <output>{v.join("|")}</output>
        </>
      );
    };
    render(<Watcher />);
    await userEvent.click(screen.getByRole("button", { name: /insert tag before d/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /insert tag before d/i }), "b{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|b|d");
    await userEvent.keyboard("{Enter}");
    await userEvent.type(screen.getByRole("textbox", { name: /insert tag before d/i }), "c{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("a|b|c|d");
  });

  test("Escape during insert discards draft (mid-list and trailing, empty and non-empty)", async () => {
    const onOuterKey = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: test-only outer listener verifying event propagation
      <div onKeyDown={onOuterKey}>
        <Harness initial={["a", "b"]} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /insert tag before b/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /insert tag before b/i }), "x");
    onOuterKey.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("x")).not.toBeInTheDocument();
    expect(onOuterKey).not.toHaveBeenCalled();
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    onOuterKey.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOuterKey).not.toHaveBeenCalled();
    // Non-empty trailing-input Escape: typed text is discarded.
    await userEvent.type(trailing, "y");
    onOuterKey.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOuterKey).not.toHaveBeenCalled();
    expect(trailing).toHaveValue("");
  });

  test("wrapper exposes role=group with the consumer's aria-label", () => {
    render(<Harness initial={["a"]} />);
    expect(screen.getByRole("group", { name: /footer tags/i })).toBeInTheDocument();
  });

  test("inner list has role=list; chip count matches value.length", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  test("gap slots have aria-labels: start / before <next>", () => {
    render(<Harness initial={["fire", "ice"]} />);
    expect(screen.getByRole("button", { name: /insert tag at start/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /insert tag before ice/i })).toBeInTheDocument();
  });

  test("roving tabindex: exactly one slot has tabindex=0 at idle and after nav", () => {
    const { container } = render(<Harness initial={["a", "b"]} />);
    const tabbable = () => container.querySelectorAll('[tabindex="0"]');
    expect(tabbable()).toHaveLength(1);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    trailing.focus();
    expect(tabbable()).toHaveLength(1);
    expect(trailing).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(screen.getByRole("group", { name: /footer tags/i }), {
      key: "ArrowLeft",
    });
    expect(tabbable()).toHaveLength(1);
  });

  test("chip slot exposes aria-keyshortcuts for Enter, F2, Delete, and Backspace", () => {
    render(<Harness initial={["a"]} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute(
      "aria-keyshortcuts",
      "Enter F2 Delete Backspace",
    );
  });

  test("value=[] renders only the trailing input as the active slot", () => {
    render(<Harness />);
    const trailing = screen.getByRole("textbox", { name: /footer tags/i });
    expect(trailing).toBeInTheDocument();
    expect(trailing).toHaveAttribute("tabindex", "0");
    // No chips, no gap buttons.
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /insert tag/i })).toHaveLength(0);
  });
});
