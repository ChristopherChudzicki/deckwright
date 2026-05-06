import type { RenderableCard } from "./types";

export type IconRule = {
  pattern: RegExp;
  iconKey: string;
  description: string;
};

export const ITEM_RULES: readonly IconRule[] = [
  {
    pattern: /\b(?:axe|battleaxe|greataxe|handaxe|tomahawk|hatchet)\b/i,
    iconKey: "battle-axe",
    description: "axe variants",
  },
  {
    pattern: /\b(?:war ?hammer|maul|sledgehammer)\b/i,
    iconKey: "warhammer",
    description: "hammer / maul",
  },
  {
    pattern: /\bcrossbow\b/i,
    iconKey: "crossbow",
    description: "crossbow",
  },
  {
    pattern: /\b(?:bow|longbow|shortbow)\b/i,
    iconKey: "bow-arrow",
    description: "bow",
  },
  {
    pattern: /\b(?:trident|spear|polearm|halberd|glaive|pike|lance)\b/i,
    iconKey: "trident",
    description: "polearm / spear",
  },
  {
    pattern:
      /\b(?:weapons?|sword|blade|dagger|mace|flail|scimitar|rapier|greatsword|longsword|shortsword)\b/i,
    iconKey: "broadsword",
    description: "generic weapon / sword",
  },
  {
    pattern: /\b(?:armor|shield|plate|chainmail|mail|helm|cuirass|gauntlet|bracers)\b/i,
    iconKey: "shield",
    description: "armor / shield / helmet",
  },
  {
    pattern: /\brings?\b/i,
    iconKey: "ring",
    description: "ring",
  },
  {
    pattern: /\b(?:potions?|elixir|philter|oil)\b/i,
    iconKey: "potion-ball",
    description: "potion / elixir",
  },
  {
    pattern: /\bscrolls?\b/i,
    iconKey: "scroll-unfurled",
    description: "scroll",
  },
  {
    pattern: /\b(?:rods?|wands?|staff|staves)\b/i,
    iconKey: "wizard-staff",
    description: "rod / wand / staff",
  },
  {
    pattern: /\b(?:ammunition|arrows?|bolts?|bullets?|darts?)\b/i,
    iconKey: "arrow-cluster",
    description: "ammunition",
  },
];

export const FALLBACK_ICON_KEY = "perspective-dice-six-faces-random";

export function pickIconKey(card: RenderableCard): string {
  const haystack = `${card.name} ${card.headerTags.join(" ")}`;
  for (const rule of ITEM_RULES) {
    if (rule.pattern.test(haystack)) return rule.iconKey;
  }
  return FALLBACK_ICON_KEY;
}

export const SCHOOL_ICONS = {
  abjuration: "magic-shield",
  conjuration: "magic-portal",
  divination: "crystal-ball",
  enchantment: "charm",
  evocation: "magic-swirl",
  illusion: "drama-masks",
  necromancy: "skull-crossed-bones",
  transmutation: "transform",
} as const satisfies Record<string, string>;

const SCHOOL_NAMES = Object.keys(SCHOOL_ICONS) as (keyof typeof SCHOOL_ICONS)[];

export function pickSpellIconKey(card: RenderableCard): string {
  for (const tag of card.headerTags) {
    const lower = tag.toLowerCase();
    for (const school of SCHOOL_NAMES) {
      if (new RegExp(`\\b${school}\\b`).test(lower)) {
        return SCHOOL_ICONS[school];
      }
    }
  }
  return FALLBACK_ICON_KEY;
}
