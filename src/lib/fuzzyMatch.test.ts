import { describe, expect, test } from "vitest";
import { fuzzyMatch } from "./fuzzyMatch";

describe("fuzzyMatch", () => {
  test("matches the user's motivating examples", () => {
    expect(fuzzyMatch("firebolt", "Fire Bolt")).not.toBeNull();
    expect(fuzzyMatch("fir bolt", "Fire Bolt")).not.toBeNull();
    expect(fuzzyMatch("cat", "Cornwall Times")).not.toBeNull();
  });

  test("returns null when the query is not a subsequence of the target", () => {
    expect(fuzzyMatch("xyz", "Fire Bolt")).toBeNull();
  });

  test("is case insensitive", () => {
    expect(fuzzyMatch("FIREBOLT", "fire bolt")).not.toBeNull();
  });

  test("empty query returns score 0", () => {
    expect(fuzzyMatch("", "Fire Bolt")).toEqual({ score: 0 });
  });

  test("empty target with non-empty query returns null", () => {
    expect(fuzzyMatch("a", "")).toBeNull();
  });

  test("query longer than target returns null", () => {
    expect(fuzzyMatch("abcd", "abc")).toBeNull();
  });

  test("matches repeated query characters when they appear in order", () => {
    expect(fuzzyMatch("ll", "Bell")).not.toBeNull();
  });

  test("rejects repeated query characters that exceed target supply", () => {
    expect(fuzzyMatch("ll", "Lab")).toBeNull();
  });

  test("word-start bonus: 'fb' scores higher against 'Fire Bolt' than 'Firebolt'", () => {
    const wordStart = fuzzyMatch("fb", "Fire Bolt");
    const midWord = fuzzyMatch("fb", "Firebolt");
    expect(wordStart).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(wordStart!.score).toBeGreaterThan(midWord!.score);
  });

  test("consecutive bonus: 'fi' scores higher against 'Fight' than 'Fortify'", () => {
    const consecutive = fuzzyMatch("fi", "Fight");
    const sparse = fuzzyMatch("fi", "Fortify");
    expect(consecutive).not.toBeNull();
    expect(sparse).not.toBeNull();
    expect(consecutive!.score).toBeGreaterThan(sparse!.score);
  });
});
