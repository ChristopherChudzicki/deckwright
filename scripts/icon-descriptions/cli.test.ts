import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { buildProgram, parseCliArgs, SHIPPED_CORPUS, workbenchCorpus } from "./cli";

// Commander writes its own diagnostics to stderr before throwing; silenced so a
// test asserting on a rejection does not print one.
const parse = (...argv: string[]) =>
  parseCliArgs(argv, buildProgram().configureOutput({ writeErr: () => {} }));

describe("--out", () => {
  // The whole point of a model-keyed default: a run cannot land in the corpus
  // that ships, and two models cannot land in one file without an explicit --out.
  test("defaults to the workbench corpus for the model", () => {
    expect(parse().out).toBe(workbenchCorpus("sonnet"));
    expect(parse("--model", "opus").out).toBe(workbenchCorpus("opus"));
  });

  // An alias and its canonical id are the same model, so they must not be able
  // to open two files that each believe they hold one model's output.
  test("gives an alias and its canonical id the same file", () => {
    expect(parse("--model", "opus").out).toBe(parse("--model", "claude-opus-5").out);
  });

  // --validate scores a finished corpus rather than writing one, and the corpus
  // worth scoring by default is the one that ships.
  test("defaults to the shipped corpus under --validate", () => {
    expect(parse("--validate").out).toBe(SHIPPED_CORPUS);
  });

  test("resolves an explicit path against the invocation, not the script", () => {
    expect(parse("--out", "corpus/pilot.json").out).toBe(resolve("corpus/pilot.json"));
  });
});

describe("exclusive modes", () => {
  // One message naming every offender is why this stayed hand-rolled instead of
  // using commander's .conflicts(), which reports a single pair.
  test("name every conflicting flag at once", () => {
    expect(() => parse("--validate", "--model", "opus", "--transport", "api")).toThrow(
      "--validate is exclusive; remove: --model, --transport",
    );
  });

  // The flags carry defaults, so this only holds because the check reads where a
  // value came from rather than whether it is set.
  test("ignore flags left at their defaults", () => {
    expect(parse("--validate").validate).toBe(true);
  });

  // --dry-run previews a run, and neither mode is one: --validate calls no model
  // and --fetch collects work already submitted.
  test("reject --dry-run, which has nothing to preview", () => {
    expect(() => parse("--validate", "--dry-run")).toThrow(
      "--validate is exclusive; remove: --dry-run",
    );
  });

  test("let --fetch keep the corpus its own record names", () => {
    expect(() => parse("--fetch", "msgbatch_1", "--out", "corpus/opus.json")).toThrow(
      "--fetch is exclusive; remove: --out",
    );
  });
});

describe("coercion", () => {
  test.each(["0", "2.5", "many"])("rejects --limit %s", (raw) => {
    expect(() => parse("--limit", raw)).toThrow("must be a positive integer");
  });

  test("rejects a --max-cost of zero", () => {
    expect(() => parse("--max-cost", "0")).toThrow("must be a positive number of dollars");
  });

  test("rejects an unknown --transport", () => {
    expect(() => parse("--transport", "grpc")).toThrow("must be one of: cli, api, batch");
  });

  // A window the API does not recognize would be sent verbatim and rejected per
  // request, and a misspelt one would silently reprice the whole run. The default
  // is the longer window: 5m only wins if it writes the prefix barely more often
  // than 1h would, which saves cents, and loses dollars when it does not hold.
  test("rejects an unknown --cache-ttl, and defaults to the window that survives a gap", () => {
    expect(() => parse("--cache-ttl", "10m")).toThrow("must be one of: 5m, 1h, off");
    expect(parse().cacheTtl).toBe("1h");
  });

  test("collects a repeated --only", () => {
    expect(parse("--only", "fireball", "--only", "broadsword").only).toEqual([
      "fireball",
      "broadsword",
    ]);
  });
});
