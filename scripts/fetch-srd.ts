import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "@commander-js/extra-typings";
import type { z } from "zod";
import {
  magicItemListSchema,
  mundaneItemListSchema,
  spellListSchema,
} from "../src/data/srd-schema";

new Command()
  .name("npm run fetch:srd")
  .description(
    "Re-fetches SRD spells, magic items, and mundane items from the Open5e API for both " +
      "rulesets, writing the full response to data/ and the schema-validated subset the app " +
      "reads to src/data/. Refuses a resource that has shrunk by more than 10% since the last " +
      "fetch, so an upstream outage cannot quietly empty the app's data.",
  )
  .parse();

const __dirname = dirname(fileURLToPath(import.meta.url));

const RULESETS = ["2014", "2024"] as const;
type Ruleset = (typeof RULESETS)[number];

const FETCH_LIMIT = 2000;
const CATASTROPHIC_SHRINK = 0.1;
const documentKey = (ruleset: Ruleset): string => (ruleset === "2024" ? "srd-2024" : "srd-2014");

type ResourceConfig = {
  name: string;
  url: (ruleset: Ruleset) => string;
  schema: z.ZodType<unknown[]>;
};

const RESOURCES: ResourceConfig[] = [
  {
    name: "magicitems",
    url: (r) =>
      `https://api.open5e.com/v2/magicitems/?document=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: magicItemListSchema,
  },
  {
    name: "spells",
    // Spells use the Django-ORM-style `document__key=` lookup; the bare
    // `document=` filter on /v2/spells/ does NOT filter and returns
    // third-party content. See handoff Quirk 1.
    url: (r) =>
      `https://api.open5e.com/v2/spells/?document__key=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: spellListSchema,
  },
  {
    name: "mundane-items",
    url: (r) => `https://api.open5e.com/v2/items/?document=${documentKey(r)}&limit=${FETCH_LIMIT}`,
    schema: mundaneItemListSchema,
  },
];

type Open5eListResponse = { count: number; results: unknown[] };

const fetchResource = async (
  resource: ResourceConfig,
  ruleset: Ruleset,
): Promise<Open5eListResponse> => {
  const res = await fetch(resource.url(ruleset));
  if (!res.ok)
    throw new Error(
      `Open5e fetch failed for ${resource.name} ${ruleset}: ${res.status} ${res.statusText}`,
    );
  const json = (await res.json()) as Open5eListResponse;
  if (json.count > json.results.length) {
    throw new Error(
      `SRD ${resource.name} ${ruleset} has ${json.count} rows, exceeding the ${FETCH_LIMIT}-row limit. Add pagination.`,
    );
  }
  return json;
};

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path}`);
};

const previousCount = (path: string): number | null => {
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return Array.isArray(json) ? json.length : null;
};

for (const resource of RESOURCES) {
  for (const ruleset of RULESETS) {
    const slimPath = resolve(__dirname, `../src/data/srd-${ruleset}-${resource.name}.json`);
    const rawPath = resolve(__dirname, `../data/srd-${ruleset}-${resource.name}.raw.json`);
    const previous = previousCount(slimPath);

    const raw = await fetchResource(resource, ruleset);
    const slim = resource.schema.parse(raw.results);

    if (previous !== null && slim.length < previous) {
      const lost = previous - slim.length;
      const fraction = lost / previous;
      if (fraction > CATASTROPHIC_SHRINK) {
        throw new Error(
          `SRD ${resource.name} ${ruleset} shrank from ${previous} to ${slim.length} (${(fraction * 100).toFixed(1)}% loss). Investigate before committing.`,
        );
      }
      console.warn(
        `  WARN: SRD ${resource.name} ${ruleset} shrank from ${previous} to ${slim.length} (-${lost})`,
      );
    }

    writeJson(rawPath, raw);
    writeJson(slimPath, slim);

    console.log(`  ${resource.name} ${ruleset}: ${slim.length} rows`);
  }
}
