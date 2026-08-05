import { describe, expect, test } from "vitest";
import { detectShiftRuns, referenceCoverage } from "./alignment";

// Each description shares wording with its own icon and little with the others,
// so this map is aligned by construction and a copy of it shifted by one is not.
const REFERENCE: Record<string, string> = {
  anvil: "A heavy anvil with a broad flat face and a pointed horn.",
  bell: "A hanging bell with a rounded body and a clapper below.",
  candle: "A lit candle with a teardrop flame above its wick.",
  drum: "A barrel drum with taut skins and crossed tension ropes.",
  egg: "An upright egg with a smooth tapering shell.",
  flute: "A slender flute pierced by a row of finger holes.",
};

const order = Object.keys(REFERENCE);

// Every icon from `from` onward holds the description of the icon before it,
// which is what the model did to 36 icons across two requests.
const shiftedFrom = (from: number): Record<string, string> =>
  Object.fromEntries(
    order.map((name, index) => [
      name,
      index >= from ? REFERENCE[order[index - 1] as string] : REFERENCE[name],
    ]),
  );

describe("detectShiftRuns", () => {
  test("an aligned corpus has no runs", () => {
    expect(detectShiftRuns({ order, subject: REFERENCE, reference: REFERENCE })).toEqual([]);
  });

  test("names the displaced icons and where the run starts", () => {
    expect(detectShiftRuns({ order, subject: shiftedFrom(2), reference: REFERENCE })).toEqual([
      { startIndex: 2, names: ["candle", "drum", "egg", "flute"] },
    ]);
  });

  test("ignores a displacement shorter than the run threshold", () => {
    expect(
      detectShiftRuns({
        order,
        subject: { ...REFERENCE, candle: REFERENCE.bell },
        reference: REFERENCE,
      }),
    ).toEqual([]);
  });

  // An unscoreable icon makes "the icon before this one" the wrong question for
  // itself and for its successor, so the run cannot simply span the hole.
  test("an icon missing from the reference breaks the run instead of extending it", () => {
    const { drum: _absent, ...reference } = REFERENCE;
    expect(
      detectShiftRuns({ order, subject: shiftedFrom(2), reference, minRun: 1 }).map(
        (run) => run.names,
      ),
    ).toEqual([["candle"], ["flute"]]);
  });
});

describe("referenceCoverage", () => {
  test("reports the share of the subject the reference can speak for", () => {
    const { drum: _absent, egg: _also, ...reference } = REFERENCE;
    expect(referenceCoverage(REFERENCE, reference)).toBeCloseTo(4 / 6);
  });

  // A missing corpus reads as `{}`, and an unguarded 0/0 would be NaN — which
  // compares false against any floor and so reads as coverage met.
  test("an empty subject has no coverage rather than NaN", () => {
    expect(referenceCoverage({}, REFERENCE)).toBe(0);
  });
});
