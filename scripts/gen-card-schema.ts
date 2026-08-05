import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "@commander-js/extra-typings";
import { toJSONSchema } from "zod";
import { cardPayloadSchema } from "../src/decks/schema";

const { check: isCheck } = new Command()
  .name("npm run gen:schema")
  .usage("-- [flags]")
  .description(
    "Derives supabase/schemas/card-payload.json from the zod card payload schema, " +
      "so the database's JSON-schema constraint stays in step with the app's types.",
  )
  .option("--check", "report drift and exit 1 instead of rewriting the file")
  .parse()
  .opts();

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, "../supabase/schemas/card-payload.json");
const generated = `${JSON.stringify(toJSONSchema(cardPayloadSchema), null, 2)}\n`;

if (isCheck) {
  if (!existsSync(out)) {
    console.error(`Schema drift: ${out} is missing. Run \`npm run gen:schema\`.`);
    process.exit(1);
  }
  const existing = readFileSync(out, "utf8");
  if (existing !== generated) {
    console.error(
      `Schema drift detected at ${out}. Run \`npm run gen:schema\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`No drift in ${out}`);
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, generated, "utf8");
  console.log(`Wrote ${out}`);
}
