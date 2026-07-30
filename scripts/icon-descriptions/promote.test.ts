import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CHOICES, SHIPPED_CORPUS } from "./cli";
import { type Arms, type Choices, loadArms, promote, readChoices } from "./promote";
import { readDescriptions } from "./store";

const SONNET = "claude-sonnet-5";
const OPUS = "claude-opus-5";

const arms: Arms = {
  [SONNET]: { fireball: "A ball of flame trailing sparks." },
  [OPUS]: { fireball: "A sphere of fire with a comet tail." },
};

const choosing = (choices: Record<string, string> = {}): Choices => ({ default: OPUS, choices });

describe("promote", () => {
  test("takes the default model's description where an icon has no choice", () => {
    expect(promote(arms, choosing()).corpus).toEqual({ fireball: arms[OPUS].fireball });
  });

  test("takes the named model's description where it has one", () => {
    expect(promote(arms, choosing({ fireball: SONNET })).corpus).toEqual({
      fireball: arms[SONNET].fireball,
    });
  });

  // Every icon any model described has to end up in the shipped corpus, so an
  // icon the winning model happens to have missed is a refusal rather than a
  // silent fall back to the other model — which would ship the loser unrecorded.
  test("refuses an icon the chosen model never described", () => {
    const { corpus, problems } = promote({ ...arms, [SONNET]: {} }, choosing({ fireball: SONNET }));

    expect(problems).toEqual(["fireball: claude-sonnet-5 has no description for it"]);
    expect(corpus).toEqual({});
  });

  // The likeliest way to write one is a typo, and a choice nothing acts on would
  // otherwise be invisible.
  test("refuses a choice for an icon no model described", () => {
    expect(promote(arms, choosing({ frieball: SONNET })).problems).toEqual([
      "frieball: chosen, but no arm describes it",
    ]);
  });

  // The arms were validated as they were collected, so this catches a corpus
  // edited by hand afterwards rather than a bad response.
  test("refuses an entry that fails the validators the app's corpus test applies", () => {
    const { corpus, problems } = promote({ [OPUS]: { fireball: "Fire." } }, choosing());

    expect(problems).toEqual(["fireball: description is 5 chars, below the 15 minimum"]);
    expect(corpus).toEqual({});
  });
});

describe("readChoices", () => {
  let path: string;
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "icon-choices-"));
    path = join(dir, "choices.json");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // The one rule that makes the file impossible to leave incomplete: with a
  // default, an icon nobody graded still resolves to a model.
  test("refuses a file with no default", () => {
    writeFileSync(path, JSON.stringify({ choices: { fireball: SONNET } }), "utf8");
    expect(() => readChoices(path)).toThrow(/not a choices file/);
  });

  // A corpus is keyed on the canonical id, so an alias has to reach the same file
  // rather than send loadArms looking for corpus/opus.json.
  test("canonicalizes an alias wherever a model is named", () => {
    writeFileSync(path, JSON.stringify({ default: "opus", choices: { fireball: "sonnet" } }));
    expect(readChoices(path)).toEqual({ default: OPUS, choices: { fireball: SONNET } });
  });
});

test("loadArms names the corpus a model has no file for", () => {
  expect(() => loadArms(choosing({ fireball: "claude-haiku-4-5" }))).toThrow(
    /no corpus at .*claude-haiku-4-5\.json/,
  );
});

// What makes the shipped corpus a derived artifact rather than a file that
// happens to be checked in: it must be exactly what the committed arms and
// choices produce, so a hand-edit to it fails here instead of surviving.
test("the committed corpus is what the committed arms and choices produce", () => {
  const choices = readChoices(CHOICES);
  const { corpus, problems } = promote(loadArms(choices), choices);

  expect(problems).toEqual([]);
  expect(corpus).toEqual(readDescriptions(SHIPPED_CORPUS));
});
