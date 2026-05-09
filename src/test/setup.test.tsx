import { expect, test } from "vitest";
import { render, screen } from "./render";

test("renders a heading", () => {
  render(<h1>hello</h1>);
  expect(screen.getByRole("heading", { name: "hello" })).toBeInTheDocument();
});
