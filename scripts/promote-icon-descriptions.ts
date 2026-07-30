import { resolve } from "node:path";
import { Command } from "@commander-js/extra-typings";
import { CHOICES, SHIPPED_CORPUS } from "./icon-descriptions/cli";
import { loadArms, promote, readChoices } from "./icon-descriptions/promote";
import { writeDescriptions } from "./icon-descriptions/store";

const program = new Command()
  .name("npm run promote:icon-descriptions")
  .usage("-- [flags]")
  .description(
    "Assembles the corpus that ships from the per-model corpora in corpus/ and the " +
      "per-icon winners in corpus/choices.json. Calls no model, sends nothing, spends " +
      "nothing — the shipped corpus is derived, and this is what derives it.\n\n" +
      "Hand-written descriptions do not belong here: overrides.json is merged at read " +
      "time by src/data/iconDescriptions/load.ts and is never baked in.",
  )
  .option("--choices <path>", "which model won each icon", CHOICES)
  .option("--out <path>", "corpus to write", SHIPPED_CORPUS)
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

const out = resolve(opts.out);
writeDescriptions(out, corpus);
console.log(`Promoted ${Object.keys(corpus).length} descriptions into ${out}.`);
