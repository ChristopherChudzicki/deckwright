import { resolve } from "node:path";
import { Command } from "@commander-js/extra-typings";
import { SHUFFLE_SEED, shuffleSeeded } from "../src/data/iconDescriptions/shuffle";
import {
  detectShiftRuns,
  MIN_REFERENCE_COVERAGE,
  referenceCoverage,
} from "./icon-descriptions/alignment";
import { CHOICES, SHIPPED_CORPUS, workbenchCorpus } from "./icon-descriptions/cli";
import { canonicalModel } from "./icon-descriptions/invoke-api";
import { loadArms, promote, readChoices } from "./icon-descriptions/promote";
import { iconNames, loadCollection } from "./icon-descriptions/rasterize";
import { readDescriptions, writeDescriptions } from "./icon-descriptions/store";

const program = new Command()
  .name("npm run promote:icon-descriptions")
  .usage("-- [flags]")
  .description(
    "Assembles the corpus that ships from the per-model corpora in corpus/ and the " +
      "per-icon winners in corpus/choices.json. Calls no model, sends nothing, spends " +
      "nothing — the shipped corpus is derived, and this is what derives it.\n\n" +
      "Hand-written descriptions do not belong here: overrides.json is merged at read " +
      "time by src/data/iconDescriptions/load.ts and is never baked in.\n\n" +
      "Requires a second arm to check alignment against: descriptions can end up on " +
      "the wrong icons, shifted by one, and nothing about a single arm reveals it — " +
      "the names are all present and the prose is all valid. That happened when the " +
      "arms were generated 30 icons to a request and a model could lose track of which " +
      "image it was on. One icon per request retires it, so on today's arms this check " +
      "is expected to pass; it guards re-promotions from the 30-era history and any " +
      "return to grouping. It cannot audit the harness — both arms go through it in " +
      "the same order, so a shift there would move subject and reference alike.",
  )
  .option("--choices <path>", "which model won each icon", CHOICES)
  .option("--out <path>", "corpus to write", SHIPPED_CORPUS)
  .option("--reference <model>", "arm to check the promoted corpus's alignment against")
  .option("--skip-alignment-check", "promote without checking alignment; says why in the log")
  .parse();

const opts = program.opts();

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const { corpus, problems } = (() => {
  try {
    const choices = readChoices(resolve(opts.choices));
    return promote(loadArms(choices), choices);
  } catch (err) {
    return fail((err as Error).message);
  }
})();

if (problems.length) {
  const count = problems.length;
  console.error(
    `Refusing to write ${opts.out}; ${count} icon${count === 1 ? "" : "s"} unresolved:`,
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

// Fail closed. A check that silently does nothing when its input is absent is
// how the corpus went out with 36 displaced descriptions and a green suite.
if (opts.reference === undefined && !opts.skipAlignmentCheck) {
  fail(
    "Refusing to promote unchecked: pass --reference <model> to name a second arm to " +
      "check alignment against, or --skip-alignment-check to promote without one.",
  );
}

if (opts.reference !== undefined) {
  const model = canonicalModel(opts.reference);
  const reference = (() => {
    try {
      return readDescriptions(workbenchCorpus(model));
    } catch (err) {
      return fail((err as Error).message);
    }
  })();
  const coverage = referenceCoverage(corpus, reference);
  if (coverage < MIN_REFERENCE_COVERAGE) {
    fail(
      `Refusing to promote: ${model} describes ${(coverage * 100).toFixed(1)}% of the ` +
        `${Object.keys(corpus).length} icons being promoted, below the ` +
        `${(MIN_REFERENCE_COVERAGE * 100).toFixed(0)}% an alignment check needs to mean ` +
        "anything. Name an arm that covers the same collection.",
    );
  }
  // The order the icons were requested in, which is the only order in which
  // "the icon before this one" means anything. Same expression selection.ts
  // draws from.
  const order = shuffleSeeded(iconNames(loadCollection()), SHUFFLE_SEED);
  const runs = detectShiftRuns({ order, subject: corpus, reference });
  if (runs.length) {
    const displaced = runs.reduce((sum, run) => sum + run.names.length, 0);
    console.error(
      `Refusing to write ${opts.out}; ${displaced} descriptions look displaced by one ` +
        `against ${model}, in ${runs.length} run${runs.length === 1 ? "" : "s"}:`,
    );
    for (const run of runs) {
      console.error(`  from request index ${run.startIndex}: ${run.names.join(", ")}`);
    }
    console.error(
      "Re-describe those icons with --only and promote again. Read scripts/" +
        "icon-descriptions/alignment.ts before dismissing this as a false positive.",
    );
    process.exit(1);
  }
  console.log(`Alignment checked against ${model}; no displaced runs.`);
} else {
  console.warn("Alignment NOT checked: --skip-alignment-check was passed.");
}

const out = resolve(opts.out);
writeDescriptions(out, corpus);
console.log(`Promoted ${Object.keys(corpus).length} descriptions into ${out}.`);
