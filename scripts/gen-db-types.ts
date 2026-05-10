import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Wraps `supabase gen types typescript --local` so the emitted file has
// exactly one trailing newline. The raw CLI output ends with a blank line,
// which the pre-commit `end-of-file-fixer` normalizes on commit — leaving
// `npm run check:db-types` to fail in CI with a one-character diff.
const out = execFileSync(
  "npx",
  ["--silent", "supabase", "gen", "types", "typescript", "--local", "--schema", "public"],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  },
);
writeFileSync("src/api/database.types.ts", `${out.replace(/\n+$/, "")}\n`);
