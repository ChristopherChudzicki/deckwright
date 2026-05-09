import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/render";
import { Textarea } from "./Textarea";

describe("<Textarea>", () => {
  it("renders an accessible textbox with the given aria-label", () => {
    render(<Textarea aria-label="Notes" />);
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("forwards typed text via onChange", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <Textarea aria-label="Notes" value={value} onChange={(e) => setValue(e.target.value)} />
      );
    }
    render(<Harness />);
    const textarea = screen.getByRole("textbox", { name: "Notes" });
    await userEvent.type(textarea, "Hello");
    expect(textarea).toHaveValue("Hello");
  });

  it("applies an extra className alongside the primitive class", () => {
    render(<Textarea aria-label="Notes" className="extra" />);
    const textarea = screen.getByRole("textbox", { name: "Notes" });
    expect(textarea.className).toContain("extra");
  });
});
