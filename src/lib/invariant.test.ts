import { describe, expect, it } from "vitest";
import { invariant } from "./invariant";

describe("invariant", () => {
  it("returns silently when the condition is truthy", () => {
    expect(() => invariant(1, "should not throw")).not.toThrow();
    expect(() => invariant("x", "should not throw")).not.toThrow();
    expect(() => invariant({}, "should not throw")).not.toThrow();
  });

  it("throws with a prefixed message when the condition is falsy", () => {
    expect(() => invariant(false, "boom")).toThrow("Invariant failed: boom");
    expect(() => invariant(0, "zero")).toThrow("Invariant failed: zero");
    expect(() => invariant(null, "null")).toThrow("Invariant failed: null");
    expect(() => invariant(undefined, "missing")).toThrow("Invariant failed: missing");
  });

  it("narrows the type for code after the call", () => {
    const x: string | null = "hello" as string | null;
    invariant(x, "x must be set");
    expect(x.length).toBe(5);
  });
});
