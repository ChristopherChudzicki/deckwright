import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "@commander-js/extra-typings";
import { CHOICES } from "./icon-descriptions/cli";
import { renderGallery } from "./icon-descriptions/gallery";
import { loadArms, readChoices } from "./icon-descriptions/promote";
import { iconNames, loadCollection } from "./icon-descriptions/rasterize";

const program = new Command()
  .name("npm run gallery:icon-descriptions")
  .usage("-- [flags]")
  .description(
    "Writes a standalone HTML page showing every icon beside what each arm said " +
      "about it. Reads the arms named by corpus/choices.json, calls no model, and " +
      "spends nothing.\n\n" +
      "This is the review surface the app does not have: IconDebugView reads the " +
      "shipped corpus, which is one description per icon with no record of who " +
      "wrote it. Comparing arms is the whole job here, and the arms live in " +
      "corpus/ rather than under src/ — deliberately, since they are experiment " +
      "data and nothing that ships should import them.\n\n" +
      "The output is a single self-contained file with the SVGs inlined, so it is " +
      "large and belongs in corpus/tmp/ with the rest of the scratch.",
  )
  .option("--choices <path>", "which model won each icon", CHOICES)
  .option("--out <path>", "page to write", "corpus/tmp/gallery.html")
  .option("--only <name>", "show exactly these icons; repeatable", collect)
  .parse();

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

const opts = program.opts();

const choices = (() => {
  try {
    return readChoices(resolve(opts.choices));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
})();

const arms = loadArms(choices);
const collection = loadCollection();
const all = iconNames(collection);
const names = opts.only ? all.filter((name) => opts.only?.includes(name)) : all;

const missing = opts.only?.filter((name) => !all.includes(name)) ?? [];
if (missing.length) {
  console.error(`Not in the collection: ${missing.join(", ")}`);
  process.exit(1);
}

const out = resolve(opts.out);
mkdirSync(dirname(out), { recursive: true });
const html = renderGallery({ collection, names, arms, choices });
writeFileSync(out, html, "utf8");

const size = (html.length / 1_000_000).toFixed(1);
console.log(
  `Wrote ${names.length} icons across ${Object.keys(arms).length} arms to ${out} (${size} MB).`,
);
