import gameIcons from "@iconify-json/game-icons/icons.json";
import { describe, expect, test } from "vitest";
import { CURATED_ICONS } from "./curatedIcons";
import { FALLBACK_ICON_KEY, ITEM_RULES, SCHOOL_ICONS, SPELL_NAME_RULES } from "./iconRules";

describe("CURATED_ICONS", () => {
  test("every entry exists in @iconify-json/game-icons", () => {
    const available = new Set(Object.keys(gameIcons.icons));
    const missing = CURATED_ICONS.filter((key) => !available.has(key));
    expect(missing).toEqual([]);
  });

  test("every icon referenced by the heuristic is in CURATED_ICONS", () => {
    const referenced = new Set<string>();
    for (const rule of ITEM_RULES) referenced.add(rule.iconKey);
    for (const rule of SPELL_NAME_RULES) referenced.add(rule.iconKey);
    for (const icon of Object.values(SCHOOL_ICONS)) referenced.add(icon);
    referenced.add(FALLBACK_ICON_KEY);

    const curated = new Set(CURATED_ICONS as readonly string[]);
    const missing = [...referenced].filter((k) => !curated.has(k));
    expect(missing).toEqual([]);
  });
});
