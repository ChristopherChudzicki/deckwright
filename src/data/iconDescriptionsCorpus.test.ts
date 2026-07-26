import { describe, expect, test, vi } from "vitest";
import base from "./icon-descriptions.json";
import overrides from "./icon-descriptions-overrides.json";
import { validateEntry } from "./iconDescriptions";

// Bypass the 2-icon fixture from src/test/setup.ts; every assertion here is
// about the real collection and would pass vacuously against the stub.
// Matches src/cards/iconRules.test.ts:16.
const collection = async () => {
  const real = await vi.importActual<{
    default: { icons: Record<string, unknown>; aliases?: Record<string, unknown> };
  }>("@iconify-json/game-icons/icons.json");
  return {
    generated: new Set(Object.keys(real.default.icons)),
    aliases: new Set(Object.keys(real.default.aliases ?? {})),
  };
};

describe("the shipped description corpus", () => {
  test("every generated entry passes the same validators the run applies", () => {
    const problems = Object.entries(base).flatMap(
      ([name, description]) => validateEntry(name, description) ?? [],
    );
    expect(problems).toEqual([]);
  });

  test("every override passes them too", () => {
    const problems = Object.entries(overrides).flatMap(
      ([name, description]) => validateEntry(name, description) ?? [],
    );
    expect(problems).toEqual([]);
  });

  // A description keyed to an icon that does not exist is dead weight the picker
  // can never surface — the likely causes are a typo in a hand-written override
  // and an icon dropped by an upstream bump.
  test("no entry names an icon outside the collection", async () => {
    const { generated, aliases } = await collection();
    const named = [...Object.keys(base), ...Object.keys(overrides)];
    expect(named.filter((name) => !generated.has(name) && !aliases.has(name))).toEqual([]);
  });
});
