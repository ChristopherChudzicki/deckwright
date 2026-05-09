import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/render";
import { Input } from "./Input";

describe("<Input>", () => {
  it("renders an accessible textbox with the given aria-label", () => {
    render(<Input aria-label="Search" />);
    expect(screen.getByRole("textbox", { name: "Search" })).toBeInTheDocument();
  });

  it("forwards typed text via onChange", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return <Input aria-label="Name" value={value} onChange={(e) => setValue(e.target.value)} />;
    }
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Name" });
    await userEvent.type(input, "Hello");
    expect(input).toHaveValue("Hello");
  });

  it("applies an extra className alongside the primitive class", () => {
    render(<Input aria-label="Search" className="extra" />);
    const input = screen.getByRole("textbox", { name: "Search" });
    expect(input.className).toContain("extra");
  });
});
