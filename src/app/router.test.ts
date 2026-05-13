import { describe, expect, it } from "vitest";
import { validateDeckSearch } from "./router";

describe("validateDeckSearch", () => {
  it("returns empty object for empty input (defaults are implicit)", () => {
    expect(validateDeckSearch({})).toEqual({});
  });

  it("strips explicit default values so the URL normalizes to clean", () => {
    expect(validateDeckSearch({ kind: "all", sort: "updated" })).toEqual({});
  });

  it("passes non-default values through", () => {
    expect(validateDeckSearch({ kind: "spell", sort: "name" })).toEqual({
      kind: "spell",
      sort: "name",
    });
    expect(validateDeckSearch({ kind: "item" })).toEqual({ kind: "item" });
  });

  it("drops unknown kind", () => {
    expect(validateDeckSearch({ kind: "weapons" })).toEqual({});
  });

  it("drops unknown sort", () => {
    expect(validateDeckSearch({ sort: "rarity" })).toEqual({});
  });

  it("drops non-string values", () => {
    expect(validateDeckSearch({ kind: 42, sort: null })).toEqual({});
  });

  it("ignores unknown keys", () => {
    expect(validateDeckSearch({ kind: "spell", sort: "name", extra: "x" })).toEqual({
      kind: "spell",
      sort: "name",
    });
  });

  it("treats mixed inputs independently (strip one, keep the other)", () => {
    expect(validateDeckSearch({ kind: "spell", sort: "updated" })).toEqual({ kind: "spell" });
    expect(validateDeckSearch({ kind: "all", sort: "name" })).toEqual({ sort: "name" });
  });
});
