import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("returns / for null/undefined/empty/non-string", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(42)).toBe("/");
  });

  it("returns / for protocol-relative URLs", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("//evil.com/foo")).toBe("/");
  });

  it("returns / for absolute URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://evil.com/path")).toBe("/");
  });

  it("returns / for backslash-prefixed paths", () => {
    expect(safeNext("/\\evil.com")).toBe("/");
  });

  it("returns / for paths that don't start with /", () => {
    expect(safeNext("evil.com")).toBe("/");
    expect(safeNext("./../etc")).toBe("/");
  });

  it("returns the path for valid relative paths", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/deck/abc")).toBe("/deck/abc");
    expect(safeNext("/login?next=/foo")).toBe("/login?next=/foo");
  });
});
