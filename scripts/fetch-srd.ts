import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { magicItemListSchema } from "../src/data/srd-schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RULESETS = ["2014", "2024"] as const;
type Ruleset = (typeof RULESETS)[number];

const FETCH_LIMIT = 2000;
const documentKey = (ruleset: Ruleset): string => (ruleset === "2024" ? "srd-2024" : "srd-2014");

type Open5eMagicItemsResponse = {
  count: number;
  results: unknown[];
};

const fetchRuleset = async (ruleset: Ruleset): Promise<Open5eMagicItemsResponse> => {
  const url = `https://api.open5e.com/v2/magicitems/?document=${documentKey(ruleset)}&limit=${FETCH_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Open5e fetch failed for ${ruleset}: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as Open5eMagicItemsResponse;
  if (json.count > json.results.length) {
    throw new Error(
      `SRD ${ruleset} has ${json.count} items, exceeding the ${FETCH_LIMIT}-row limit. Add pagination.`,
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

const CATASTROPHIC_SHRINK = 0.1;

for (const ruleset of RULESETS) {
  const slimPath = resolve(__dirname, `../src/data/srd-${ruleset}-magicitems.json`);
  const previous = previousCount(slimPath);

  const raw = await fetchRuleset(ruleset);
  // Parse first so a malformed Open5e payload throws before any file is written.
  const slim = magicItemListSchema.parse(raw.results);

  if (previous !== null && slim.length < previous) {
    const lost = previous - slim.length;
    const fraction = lost / previous;
    if (fraction > CATASTROPHIC_SHRINK) {
      throw new Error(
        `SRD ${ruleset} shrank from ${previous} to ${slim.length} (${(fraction * 100).toFixed(1)}% loss). Investigate before committing.`,
      );
    }
    console.warn(`  WARN: SRD ${ruleset} shrank from ${previous} to ${slim.length} (-${lost})`);
  }

  writeJson(resolve(__dirname, `../data/srd-${ruleset}-magicitems.raw.json`), raw);
  writeJson(slimPath, slim);

  console.log(`  ${ruleset}: ${slim.length} items`);
}
