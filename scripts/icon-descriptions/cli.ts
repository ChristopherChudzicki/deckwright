import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError } from "@commander-js/extra-typings";
import { canonicalModel } from "./invoke-api";
import { DEFAULT_RENDER_SIZE } from "./rasterize";
import { type CacheTtl, DEFAULT_MODEL } from "./transport";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");

export const SHIPPED_CORPUS = resolve(REPO, "src/data/iconDescriptions/corpus.json");

// Which model won each icon. Read by the promote script, which assembles the
// shipped corpus from the workbench files; kept here so every corpus path in the
// pipeline resolves in one place.
export const CHOICES = resolve(REPO, "corpus/choices.json");

// Runs write to a per-model workbench file rather than to the corpus that ships.
// Keyed on the canonical id so `--model opus` and `--model claude-opus-5` name
// the same file: a corpus holding two models' output is indistinguishable
// afterwards from one holding either, and a path derived from the model is what
// makes that unrepresentable rather than merely refused.
export const workbenchCorpus = (model: string): string =>
  resolve(REPO, "corpus", `${canonicalModel(model)}.json`);

export const TRANSPORTS = ["cli", "api", "batch"] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const CACHE_TTLS = ["5m", "1h", "off"] as const satisfies readonly CacheTtl[];

export type CliOptions = {
  transport: Transport;
  model: string;
  out: string;
  limit?: number;
  only?: string[];
  force?: boolean;
  cacheTtl: CacheTtl;
  size: number;
  maxCost?: number;
  dryRun?: boolean;
  validate?: boolean;
  fetch?: string;
};

export const positiveInt = (raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return value;
};

export const positiveDollars = (raw: string): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidArgumentError("must be a positive number of dollars");
  }
  return value;
};

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

// --fetch reads everything it needs from the submitted batch's record, so a
// selection or model flag alongside it would silently do nothing.
const RUN_FLAGS = [
  "only",
  "cacheTtl",
  "force",
  "limit",
  "model",
  "size",
  "transport",
  "maxCost",
  "dryRun",
] as const;

// `--out` names which corpus to work on, so it is meaningful to a run and to
// `--validate` — scoring a second model's file is what the warning counts exist
// for. `--fetch` is the exception: its batch record already carries the corpus
// the submit chose, and accepting a flag that could disagree with it would let a
// mistyped path merge Opus descriptions into the Sonnet corpus hours later.
const EXCLUSIVE_TO = {
  validate: [...RUN_FLAGS, "fetch"],
  fetch: [...RUN_FLAGS, "validate", "out"],
} as const;

export function buildProgram() {
  return (
    new Command()
      // Throw rather than exit, so the caller owns the exit code and a test can
      // assert on a rejected flag without taking the runner down with it.
      .exitOverride()
      .name("npm run gen:icon-descriptions")
      .usage("-- [flags]")
      .description(
        "Describes game-icons artwork with a Claude model and merges the result into a corpus. " +
          "The defaults are the safe ones: work goes to the subscription CLI rather than a billed " +
          "API, icons that already have an entry are skipped, and output lands in a per-model " +
          "workbench file rather than the corpus that ships.\n\n" +
          "To see what a run would do without paying for it, add --dry-run: it prints the " +
          "selection and the estimate and exits before rendering or sending anything.\n\n" +
          "Full documentation: scripts/icon-descriptions/README.md",
      )
      .option(
        "--transport <cli|api|batch>",
        "where to send the work",
        (raw) => {
          if (!TRANSPORTS.includes(raw as Transport)) {
            throw new InvalidArgumentError(`must be one of: ${TRANSPORTS.join(", ")}`);
          }
          return raw as Transport;
        },
        "cli" as Transport,
      )
      .option("--model <name>", "model to describe with", DEFAULT_MODEL)
      .option(
        "--out <path>",
        "corpus to read and write (default: corpus/<model>.json, or the shipped corpus under --validate)",
      )
      .option("--limit <n>", "describe at most n icons", positiveInt)
      .option("--only <name>", "describe exactly these; repeatable", collect)
      .option("--force", "re-describe icons that already have an entry")
      .option(
        "--cache-ttl <5m|1h|off>",
        "how long the API caches the invariant instruction prefix",
        (raw) => {
          if (!CACHE_TTLS.includes(raw as CacheTtl)) {
            throw new InvalidArgumentError(`must be one of: ${CACHE_TTLS.join(", ")}`);
          }
          return raw as CacheTtl;
        },
        "1h" as CacheTtl,
      )
      .option("--size <px>", "PNG render size", positiveInt, DEFAULT_RENDER_SIZE)
      .option("--max-cost <usd>", "spend ceiling", positiveDollars)
      .option("--dry-run", "print the selection and the estimate, then exit without sending")
      .option("--validate", "score a corpus and exit; calls no model, writes nothing")
      .option("--fetch <batch-id>", "collect a submitted batch; takes no other flags")
  );
}

// Commander tracks whether a value came from the command line or from its own
// default, which is what makes exclusivity answerable at all: `--transport cli`
// is a conflict with `--validate` and a defaulted "cli" is not. Kept hand-rolled
// rather than using .conflicts() so one message names every offending flag.
const assertExclusive = (program: Command, mode: "validate" | "fetch"): void => {
  const conflicting = EXCLUSIVE_TO[mode].filter(
    (flag) => program.getOptionValueSource(flag) === "cli",
  );
  if (conflicting.length) {
    const named = conflicting.map(
      (flag) => `--${flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
    );
    program.error(`error: --${mode} is exclusive; remove: ${named.join(", ")}`);
  }
};

export function parseCliArgs(argv: readonly string[], program = buildProgram()): CliOptions {
  program.parse(argv, { from: "user" });
  const opts = program.opts();

  if (opts.validate) assertExclusive(program, "validate");
  if (opts.fetch !== undefined) assertExclusive(program, "fetch");

  return {
    ...opts,
    // Relative to the invocation, not the script, so `--out corpus/opus.json`
    // means what it looks like it means.
    out:
      opts.out !== undefined
        ? resolve(opts.out)
        : opts.validate
          ? SHIPPED_CORPUS
          : workbenchCorpus(opts.model),
  };
}
