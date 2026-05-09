import { describe, expect, it } from "vitest";
import { pluralize } from "./pluralize";

describe("pluralize", () => {
  it("uses the plural form for zero", () => {
    expect(pluralize(0, "deck")).toBe("0 decks");
  });

  it("uses the singular form for one", () => {
    expect(pluralize(1, "deck")).toBe("1 deck");
  });

  it("uses the plural form for counts greater than one", () => {
    expect(pluralize(2, "deck")).toBe("2 decks");
  });

  it("accepts a custom plural form", () => {
    expect(pluralize(3, "octopus", "octopi")).toBe("3 octopi");
  });
});
