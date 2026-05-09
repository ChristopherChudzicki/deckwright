import { render, screen } from "@testing-library/react";
import { useId } from "react";
import { describe, expect, test } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

function Harness() {
  const id = useId();
  return (
    <>
      <MarkdownToolbar htmlFor={id} />
      <textarea id={id} aria-label="body" defaultValue="" />
    </>
  );
}

describe("<MarkdownToolbar>", () => {
  test("renders four buttons with accessible labels", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /italic/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bullet list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /numbered list/i })).toBeInTheDocument();
  });

  test("bold and italic buttons advertise their keyboard shortcut", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /bold/i })).toHaveAccessibleName(/⌘B/);
    expect(screen.getByRole("button", { name: /italic/i })).toHaveAccessibleName(/⌘I/);
  });

  test("toolbar is labelled and has role=toolbar", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: /formatting/i });
    expect(toolbar.tagName.toLowerCase()).toBe("markdown-toolbar");
  });

  test("toolbar's for= matches a real textarea id (the library targets that field)", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: /formatting/i });
    const targetId = toolbar.getAttribute("for");
    expect(targetId).toBeTruthy();
    expect(document.getElementById(targetId as string)?.tagName.toLowerCase()).toBe("textarea");
  });

  test("first button has tabindex=0, others tabindex=-1 (roving-tabindex init)", () => {
    render(<Harness />);
    const bold = screen.getByRole("button", { name: /bold/i });
    const italic = screen.getByRole("button", { name: /italic/i });
    const bullet = screen.getByRole("button", { name: /bullet list/i });
    const numbered = screen.getByRole("button", { name: /numbered list/i });
    expect(bold).toHaveAttribute("tabindex", "0");
    expect(italic).toHaveAttribute("tabindex", "-1");
    expect(bullet).toHaveAttribute("tabindex", "-1");
    expect(numbered).toHaveAttribute("tabindex", "-1");
  });
});
