import { describe, expect, test } from "vitest";
import { SHUFFLE_SEED, shuffleSeeded } from "./shuffle";

const alphabet = Array.from({ length: 100 }, (_, i) => `icon-${String(i).padStart(3, "0")}`);

describe("shuffleSeeded", () => {
  test("is deterministic for a given seed", () => {
    expect(shuffleSeeded(alphabet, SHUFFLE_SEED)).toEqual(shuffleSeeded(alphabet, SHUFFLE_SEED));
  });

  test("differs from the input order", () => {
    expect(shuffleSeeded(alphabet, SHUFFLE_SEED)).not.toEqual(alphabet);
  });

  test("is a permutation, losing and duplicating nothing", () => {
    expect(shuffleSeeded(alphabet, SHUFFLE_SEED).sort()).toEqual([...alphabet].sort());
  });

  test("differs between seeds", () => {
    expect(shuffleSeeded(alphabet, SHUFFLE_SEED)).not.toEqual(
      shuffleSeeded(alphabet, SHUFFLE_SEED + 1),
    );
  });

  test("does not mutate its input", () => {
    const input = [...alphabet];
    shuffleSeeded(input, SHUFFLE_SEED);
    expect(input).toEqual(alphabet);
  });
});
