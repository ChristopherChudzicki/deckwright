import { describe, expect, test, vi } from "vitest";
import base from "./icon-descriptions.json";
import overrides from "./icon-descriptions-overrides.json";
import { validateEntry } from "./iconDescriptions";

// Bypass the 2-icon fixture from src/test/setup.ts; every assertion here is
// about the real collection and would pass vacuously against the stub.
// Matches src/cards/iconRules.test.ts:16.
const describableIcons = async () => {
  const real = await vi.importActual<{ default: { icons: Record<string, unknown> } }>(
    "@iconify-json/game-icons/icons.json",
  );
  return new Set(Object.keys(real.default.icons));
};

describe("the shipped description corpus", () => {
  test.each([
    ["generated", base],
    ["hand-written override", overrides],
  ])("every %s entry passes the same validators the run applies", (_label, entries) => {
    const problems = Object.entries(entries).flatMap(
      ([name, description]) => validateEntry(name, description) ?? [],
    );
    expect(problems).toEqual([]);
  });

  // The pipeline is strictly image → description, so every key must name an icon
  // that has artwork to describe. Aliases have no `body` and are excluded
  // deliberately: consumers resolve an alias to its parent at lookup time rather
  // than the corpus carrying a duplicate that drifts when the parent changes.
  // The likely causes of a stray key are a typo in a hand-written override and
  // an icon dropped by an upstream bump.
  test("every entry names a describable icon", async () => {
    const describable = await describableIcons();
    const named = [...Object.keys(base), ...Object.keys(overrides)];
    expect(named.filter((name) => !describable.has(name))).toEqual([]);
  });
});
