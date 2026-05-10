import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "./fuzzyMatch";

describe("fuzzyMatch", () => {
  it("matches when query characters appear in order in the target", () => {
    expect(fuzzyMatch("firebolt", "Fire Bolt")).not.toBeNull();
    expect(fuzzyMatch("fir bolt", "Fire Bolt")).not.toBeNull();
    expect(fuzzyMatch("cat", "Cornwall Times")).not.toBeNull();
  });

  it("returns null when the query is not a subsequence of the target", () => {
    expect(fuzzyMatch("xyz", "Fire Bolt")).toBeNull();
  });

  it("is case insensitive", () => {
    expect(fuzzyMatch("FIREBOLT", "fire bolt")).not.toBeNull();
  });

  it("empty query returns score 0", () => {
    expect(fuzzyMatch("", "Fire Bolt")).toEqual({ score: 0 });
  });

  it("empty target with non-empty query returns null", () => {
    expect(fuzzyMatch("a", "")).toBeNull();
  });

  it("query longer than target returns null", () => {
    expect(fuzzyMatch("abcd", "abc")).toBeNull();
  });

  it("matches repeated query characters when they appear in order", () => {
    expect(fuzzyMatch("ll", "Bell")).not.toBeNull();
  });

  it("rejects repeated query characters that exceed target supply", () => {
    expect(fuzzyMatch("ll", "Lab")).toBeNull();
  });

  it("treats internal whitespace in the query as significant", () => {
    expect(fuzzyMatch("fir  bolt", "Fire Bolt")).toBeNull();
  });

  it("word-start bonus: 'fb' scores higher against 'Fire Bolt' than 'Firebolt'", () => {
    const wordStart = fuzzyMatch("fb", "Fire Bolt");
    const midWord = fuzzyMatch("fb", "Firebolt");
    expect(wordStart).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordStart!.score).toBeGreaterThan(midWord!.score);
  });

  it("consecutive bonus: 'fi' scores higher against 'Fight' than 'Fortify'", () => {
    const consecutive = fuzzyMatch("fi", "Fight");
    const sparse = fuzzyMatch("fi", "Fortify");
    expect(consecutive).not.toBeNull();
    expect(sparse).not.toBeNull();
    expect(consecutive!.score).toBeGreaterThan(sparse!.score);
  });

  it("stacks word-start and consecutive bonuses when a boundary char is itself matched", () => {
    expect(fuzzyMatch("a b", "a b")).toEqual({ score: 13 });
    expect(fuzzyMatch("ab", "a b")).toEqual({ score: 8 });
  });
});
