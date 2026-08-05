import { existsSync, readFileSync } from "node:fs";
import { validateEntry } from "../../src/data/iconDescriptions/entries";
import { workbenchCorpus } from "./cli";
import { canonicalModel } from "./invoke-api";
import { readDescriptions } from "./store";

// Which model won each icon. `default` is mandatory and `choices` lists only the
// icons that go the other way, so the file cannot be incomplete: every icon
// resolves to a model whether or not anyone graded it. Listing all 4,134 icons
// instead would say the same thing at 4,134 times the length, and bury the
// handful of real decisions among the entries that merely restate the default.
export type Choices = { default: string; choices: Record<string, string> };

export type Arms = Record<string, Record<string, string>>;

const isStringMap = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

export function readChoices(path: string): Choices {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const { default: fallback, choices } = (parsed ?? {}) as Partial<Choices>;
  if (typeof fallback !== "string" || !isStringMap(choices)) {
    throw new Error(
      `${path} is not a choices file: expected {"default": "<model>", "choices": {"<icon>": "<model>"}}.`,
    );
  }
  return {
    default: canonicalModel(fallback),
    choices: Object.fromEntries(
      Object.entries(choices).map(([name, model]) => [name, canonicalModel(model)]),
    ),
  };
}

// The choices file names every model that can contribute, so it also decides
// which corpora to read — there is no separate list of arms to keep in step with
// it. A model with no corpus on disk is reported here rather than as 4,134 icons
// that nothing describes.
export function loadArms(choices: Choices): Arms {
  const models = new Set([choices.default, ...Object.values(choices.choices)]);
  return Object.fromEntries(
    [...models].map((model) => {
      const path = workbenchCorpus(model);
      if (!existsSync(path)) {
        throw new Error(`choices name ${model}, but there is no corpus at ${path}.`);
      }
      return [model, readDescriptions(path)];
    }),
  );
}

// Problems are collected and refused rather than dropped, which is the opposite
// of what a run does with a bad response. A run can re-describe what it drops;
// here the input is fixed, so dropping would quietly ship fewer icons than the
// arms hold and leave nothing to re-run.
export function promote(
  arms: Arms,
  { default: fallback, choices }: Choices,
): { corpus: Record<string, string>; problems: string[] } {
  const described = new Set(Object.values(arms).flatMap((arm) => Object.keys(arm)));
  const problems: string[] = [];
  const corpus: Record<string, string> = {};

  for (const name of Object.keys(choices)) {
    if (!described.has(name)) problems.push(`${name}: chosen, but no arm describes it`);
  }

  for (const name of [...described].sort()) {
    const model = choices[name] ?? fallback;
    const description = arms[model]?.[name];
    if (description === undefined) {
      problems.push(`${name}: ${model} has no description for it`);
      continue;
    }
    const problem = validateEntry(name, description);
    if (problem) {
      problems.push(problem);
      continue;
    }
    corpus[name] = description;
  }

  return { corpus, problems };
}
