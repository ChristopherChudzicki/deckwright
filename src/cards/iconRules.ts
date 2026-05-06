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

export const SPELL_NAME_RULES: readonly IconRule[] = [
  {
    pattern: /\b(?:fireball|fire|flame|flaming|burning|incendiary|combust|scorching)\b/i,
    iconKey: "fire-flower",
    description: "fire / flame / burning",
  },
  {
    pattern: /\b(?:lightning|thunderwave|thunder|shock|shocking)\b/i,
    iconKey: "lightning-arc",
    description: "lightning / thunder / shock",
  },
  {
    pattern: /\b(?:ice|cold|frost|freezing|snow)\b/i,
    iconKey: "ice-cube",
    description: "cold / ice / frost",
  },
  {
    pattern: /\b(?:poison|venom|cloudkill|stinking|acid)\b/i,
    iconKey: "poison-cloud",
    description: "poison / venom / acid / cloudkill",
  },
  {
    pattern: /\b(?:cure|heal|healing|mending|revivify|regenerate|resurrect|resurrection)\b/i,
    iconKey: "caduceus",
    description: "healing / cure / restore",
  },
  {
    pattern: /\b(?:bless|prayer|sacred|divine|guidance|sanctuary)\b/i,
    iconKey: "holy-symbol",
    description: "bless / divine / prayer",
  },
  {
    pattern: /\b(?:shield|ward|warding|protection|aid)\b/i,
    iconKey: "magic-shield",
    description: "shield / ward / protection",
  },
  {
    pattern: /\b(?:fly|levitate|jump|leap)\b/i,
    iconKey: "feathered-wing",
    description: "fly / levitate / jump",
  },
  {
    pattern: /\b(?:sleep|dream)\b/i,
    iconKey: "night-sleep",
    description: "sleep / dream",
  },
  {
    pattern: /\b(?:charm|friends|suggestion|command|compulsion|dominate|hold)\b/i,
    iconKey: "charm",
    description: "charm / hold / dominate / command",
  },
  {
    pattern: /\b(?:fear|frighten|frightened|terror)\b/i,
    iconKey: "evil-eyes",
    description: "fear / frighten",
  },
  {
    pattern: /\b(?:curse|cursed|bane|hex)\b/i,
    iconKey: "cursed-star",
    description: "curse / hex / bane",
  },
  {
    pattern:
      /\b(?:summon|conjure|conjuration|familiar|gate|planar|teleport|teleportation|misty|dimension)\b/i,
    iconKey: "magic-portal",
    description: "summon / conjure / teleport",
  },
  {
    pattern: /\b(?:light|lights|daylight|sunbeam|sunburst)\b/i,
    iconKey: "sun",
    description: "light / daylight / sun",
  },
  {
    pattern: /\b(?:moon|moonbeam)\b/i,
    iconKey: "moon",
    description: "moon",
  },
  {
    pattern: /\b(?:detect|scrying|clairvoyance|seeing|invisibility|locate)\b/i,
    iconKey: "evil-eyes",
    description: "detect / scry / see",
  },
];

function pickItemIconKey(card: RenderableCard): string {
  const haystack = `${card.name} ${card.headerTags.join(" ")}`;
  for (const rule of ITEM_RULES) {
    if (rule.pattern.test(haystack)) return rule.iconKey;
  }
  return FALLBACK_ICON_KEY;
}

export function pickIconKey(card: RenderableCard): string {
  if (card.kind === "spell") return pickSpellIconKey(card);
  return pickItemIconKey(card);
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
  const haystack = `${card.name} ${card.headerTags.join(" ")}`;
  for (const rule of SPELL_NAME_RULES) {
    if (rule.pattern.test(haystack)) return rule.iconKey;
  }
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
