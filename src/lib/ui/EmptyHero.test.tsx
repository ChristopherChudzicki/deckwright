import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/render";
import { EmptyHero } from "./EmptyHero";

describe("<EmptyHero>", () => {
  it("renders the title as a heading", () => {
    render(<EmptyHero title="No decks yet" />);
    expect(screen.getByRole("heading", { name: "No decks yet" })).toBeInTheDocument();
  });

  it("renders an optional description", () => {
    render(<EmptyHero title="No decks yet" description="Create one to get started." />);
    expect(screen.getByText("Create one to get started.")).toBeInTheDocument();
  });

  it("renders actions in the actions slot", () => {
    render(<EmptyHero title="No decks yet" actions={<button type="button">Create deck</button>} />);
    expect(screen.getByRole("button", { name: "Create deck" })).toBeInTheDocument();
  });
});
