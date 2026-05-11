import { beforeEach, describe, expect, it } from "vitest";
import { clearLastProvider, readLastProvider, writeLastProvider } from "./lastProvider";

describe("lastProvider storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to google when nothing is stored", () => {
    expect(readLastProvider()).toBe("google");
  });

  it("round-trips a github write", () => {
    writeLastProvider("github");
    expect(readLastProvider()).toBe("github");
  });

  it("reads a value stashed under the legacy dndCards key", () => {
    window.localStorage.setItem("dndCards.lastProvider", "github");
    expect(readLastProvider()).toBe("github");
  });

  it("writeLastProvider drops any legacy dndCards key", () => {
    window.localStorage.setItem("dndCards.lastProvider", "github");
    writeLastProvider("google");
    expect(window.localStorage.getItem("dndCards.lastProvider")).toBeNull();
    expect(readLastProvider()).toBe("google");
  });

  it("clearLastProvider removes both new and legacy keys", () => {
    window.localStorage.setItem("dndCards.lastProvider", "github");
    writeLastProvider("github");
    clearLastProvider();
    expect(window.localStorage.getItem("deckwright.lastProvider")).toBeNull();
    expect(window.localStorage.getItem("dndCards.lastProvider")).toBeNull();
  });
});
