// Descriptions can end up on the wrong icons, shifted by one, and nothing else
// in the pipeline can see it: the validators read one entry at a time, and
// promotion only checks that a chosen model has *a* description. Every name is
// present and every description is valid prose.
//
// The arms on disk were generated 30 icons to a request, where the model owned
// that correspondence. Twice in 138 requests Opus lost it partway through and
// labelled each remaining description with the *following* icon's name, so 36
// icons shipped holding their predecessor's. One icon per request moves the
// correspondence to the harness, which is why the gate is kept rather than
// retired: it now checks the harness's `custom_id` bookkeeping against a second
// arm, and a collection path that shifted by one would look the same from here.
//
// This finds it by asking whether a description is aligned, never whether it is
// correct — no judgement, no model call. Scored against a second arm that
// described the same icons in the same order, a displaced description resembles
// the reference text of the icon *before* it more than its own.

const STOP = new Set(
  (
    "a an the of with and or in on at its their two three four five above below " +
    "from into over under is are shape shaped like"
  ).split(" "),
);

const tokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replaceAll(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP.has(word)),
  );

const overlap = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
};

// How much better a description must match the previous icon's reference text
// than its own to count as displaced. Measured against the two known incidents:
// 0.05 and 0 both recover them whole, while 0.10 splits the shorter one into
// fragments. 0 is avoided because it admits the most lexical noise — 60 isolated
// hits against 41 at this margin.
export const SHIFT_MARGIN = 0.05;

// A lone displaced icon is noise: at the margin above, a known-good arm scored
// against a known-bad one produces 11 of them and no runs at all. A contiguous
// run is the signature, because the failure displaces every icon after it in the
// request. Both real incidents ran to the end of their request — 26 icons and 10.
export const MIN_SHIFT_RUN = 3;

// An icon the reference does not describe is skipped, so a reference that
// describes almost nothing reports a clean corpus by having nothing to say.
// `readDescriptions` returns `{}` for a file that is not there, which is how a
// mistyped `--reference` earned a passing alignment check.
export const MIN_REFERENCE_COVERAGE = 0.9;

// Guards against the empty subject too: `0 / 0` is NaN, and every comparison
// against NaN is false, so an unguarded ratio would read as coverage met.
export function referenceCoverage(
  subject: Readonly<Record<string, string>>,
  reference: Readonly<Record<string, string>>,
): number {
  const names = Object.keys(subject);
  if (!names.length) return 0;
  return names.filter((name) => reference[name] !== undefined).length / names.length;
}

export type ShiftRun = { startIndex: number; names: string[] };

// `order` must be the order the icons were *requested* in, not sorted or corpus
// order: "the icon before this one" is only meaningful there. That is
// `shuffleSeeded(iconNames(collection), SHUFFLE_SEED)`, the same expression
// selection.ts batches from.
//
// An icon either arm leaves undescribed is skipped and breaks the run, since a
// gap makes "the icon before this one" the wrong question.
export function detectShiftRuns(opts: {
  order: readonly string[];
  subject: Readonly<Record<string, string>>;
  reference: Readonly<Record<string, string>>;
  margin?: number;
  minRun?: number;
}): ShiftRun[] {
  const { order, subject, reference, margin = SHIFT_MARGIN, minRun = MIN_SHIFT_RUN } = opts;
  const runs: ShiftRun[] = [];
  let current: ShiftRun | null = null;

  const close = () => {
    if (current && current.names.length >= minRun) runs.push(current);
    current = null;
  };

  for (const [index, name] of order.entries()) {
    const text: string | undefined = subject[name];
    const own: string | undefined = reference[name];
    const previous: string | undefined =
      index > 0 ? reference[order[index - 1] as string] : undefined;
    if (text === undefined || own === undefined || previous === undefined) {
      close();
      continue;
    }
    const scored = tokens(text);
    if (overlap(scored, tokens(previous)) > overlap(scored, tokens(own)) + margin) {
      if (current) current.names.push(name);
      else current = { startIndex: index, names: [name] };
    } else {
      close();
    }
  }
  close();
  return runs;
}
