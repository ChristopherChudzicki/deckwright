import { addCollection, Icon, iconLoaded } from "@iconify/react";
import type { IconifyIcon, IconifyJSON } from "@iconify/types";
import iconAllSeeingEye from "@iconify-icons/game-icons/all-seeing-eye";
import iconAngelWings from "@iconify-icons/game-icons/angel-wings";
import iconAnkh from "@iconify-icons/game-icons/ankh";
import iconAnvil from "@iconify-icons/game-icons/anvil";
import iconArcingBolt from "@iconify-icons/game-icons/arcing-bolt";
import iconArrowCluster from "@iconify-icons/game-icons/arrow-cluster";
import iconBarbute from "@iconify-icons/game-icons/barbute";
import iconBattleAxe from "@iconify-icons/game-icons/battle-axe";
import iconBloodyStash from "@iconify-icons/game-icons/bloody-stash";
import iconBoltSpellCast from "@iconify-icons/game-icons/bolt-spell-cast";
import iconBoots from "@iconify-icons/game-icons/boots";
import iconBottleVapors from "@iconify-icons/game-icons/bottle-vapors";
import iconBowArrow from "@iconify-icons/game-icons/bow-arrow";
import iconBowieKnife from "@iconify-icons/game-icons/bowie-knife";
import iconBread from "@iconify-icons/game-icons/bread";
import iconBroadsword from "@iconify-icons/game-icons/broadsword";
import iconCaduceus from "@iconify-icons/game-icons/caduceus";
import iconCape from "@iconify-icons/game-icons/cape";
import iconChainMail from "@iconify-icons/game-icons/chain-mail";
import iconCharm from "@iconify-icons/game-icons/charm";
import iconCheckedShield from "@iconify-icons/game-icons/checked-shield";
import iconChestArmor from "@iconify-icons/game-icons/chest-armor";
import iconClaws from "@iconify-icons/game-icons/claws";
import iconCompass from "@iconify-icons/game-icons/compass";
import iconCrossbow from "@iconify-icons/game-icons/crossbow";
import iconCrystalBall from "@iconify-icons/game-icons/crystal-ball";
import iconCrystalCluster from "@iconify-icons/game-icons/crystal-cluster";
import iconCrystalShrine from "@iconify-icons/game-icons/crystal-shrine";
import iconCursedStar from "@iconify-icons/game-icons/cursed-star";
import iconDeathJuice from "@iconify-icons/game-icons/death-juice";
import iconDiamondRing from "@iconify-icons/game-icons/diamond-ring";
import iconDragonHead from "@iconify-icons/game-icons/dragon-head";
import iconDramaMasks from "@iconify-icons/game-icons/drama-masks";
import iconDrinkMe from "@iconify-icons/game-icons/drink-me";
import iconEnrage from "@iconify-icons/game-icons/enrage";
import iconEvilEyes from "@iconify-icons/game-icons/evil-eyes";
import iconEyeOfHorus from "@iconify-icons/game-icons/eye-of-horus";
import iconFangs from "@iconify-icons/game-icons/fangs";
import iconFeatheredWing from "@iconify-icons/game-icons/feathered-wing";
import iconFireFlower from "@iconify-icons/game-icons/fire-flower";
import iconFireSpellCast from "@iconify-icons/game-icons/fire-spell-cast";
import iconFishingPole from "@iconify-icons/game-icons/fishing-pole";
import iconFizzingFlask from "@iconify-icons/game-icons/fizzing-flask";
import iconFlail from "@iconify-icons/game-icons/flail";
import iconFrogPrince from "@iconify-icons/game-icons/frog-prince";
import iconFrozenOrb from "@iconify-icons/game-icons/frozen-orb";
import iconGauntlet from "@iconify-icons/game-icons/gauntlet";
import iconGemPendant from "@iconify-icons/game-icons/gem-pendant";
import iconGhost from "@iconify-icons/game-icons/ghost";
import iconGlaive from "@iconify-icons/game-icons/glaive";
import iconGrimReaper from "@iconify-icons/game-icons/grim-reaper";
import iconHalberd from "@iconify-icons/game-icons/halberd";
import iconHandSaw from "@iconify-icons/game-icons/hand-saw";
import iconHealing from "@iconify-icons/game-icons/healing";
import iconHealingShield from "@iconify-icons/game-icons/healing-shield";
import iconHeavyBullets from "@iconify-icons/game-icons/heavy-bullets";
import iconHighShot from "@iconify-icons/game-icons/high-shot";
import iconHolySymbol from "@iconify-icons/game-icons/holy-symbol";
import iconHoneyJar from "@iconify-icons/game-icons/honey-jar";
import iconHornedSkull from "@iconify-icons/game-icons/horned-skull";
import iconIceCube from "@iconify-icons/game-icons/ice-cube";
import iconIceSpellCast from "@iconify-icons/game-icons/ice-spell-cast";
import iconImprisoned from "@iconify-icons/game-icons/imprisoned";
import iconKatana from "@iconify-icons/game-icons/katana";
import iconKnapsack from "@iconify-icons/game-icons/knapsack";
import iconLanternFlame from "@iconify-icons/game-icons/lantern-flame";
import iconLeatherArmor from "@iconify-icons/game-icons/leather-armor";
import iconLightningArc from "@iconify-icons/game-icons/lightning-arc";
import iconLockedChest from "@iconify-icons/game-icons/locked-chest";
import iconLockpicks from "@iconify-icons/game-icons/lockpicks";
import iconLoveMystery from "@iconify-icons/game-icons/love-mystery";
import iconMaceHead from "@iconify-icons/game-icons/mace-head";
import iconMagicLamp from "@iconify-icons/game-icons/magic-lamp";
import iconMagicPortal from "@iconify-icons/game-icons/magic-portal";
import iconMagicShield from "@iconify-icons/game-icons/magic-shield";
import iconMagicSwirl from "@iconify-icons/game-icons/magic-swirl";
import iconMagnifyingGlass from "@iconify-icons/game-icons/magnifying-glass";
import iconMeat from "@iconify-icons/game-icons/meat";
import iconMoon from "@iconify-icons/game-icons/moon";
import iconMorphBall from "@iconify-icons/game-icons/morph-ball";
import iconNecklace from "@iconify-icons/game-icons/necklace";
import iconNightSleep from "@iconify-icons/game-icons/night-sleep";
import iconPerspectiveDiceSixFacesRandom from "@iconify-icons/game-icons/perspective-dice-six-faces-random";
import iconPlainDagger from "@iconify-icons/game-icons/plain-dagger";
import iconPlasmaBolt from "@iconify-icons/game-icons/plasma-bolt";
import iconPoisonCloud from "@iconify-icons/game-icons/poison-cloud";
import iconPotionBall from "@iconify-icons/game-icons/potion-ball";
import iconPrayer from "@iconify-icons/game-icons/prayer";
import iconRing from "@iconify-icons/game-icons/ring";
import iconRopeCoil from "@iconify-icons/game-icons/rope-coil";
import iconRoundBottomFlask from "@iconify-icons/game-icons/round-bottom-flask";
import iconRuneStone from "@iconify-icons/game-icons/rune-stone";
import iconScrollUnfurled from "@iconify-icons/game-icons/scroll-unfurled";
import iconScythe from "@iconify-icons/game-icons/scythe";
import iconShield from "@iconify-icons/game-icons/shield";
import iconShinyApple from "@iconify-icons/game-icons/shiny-apple";
import iconSkullCrossedBones from "@iconify-icons/game-icons/skull-crossed-bones";
import iconSnowflake1 from "@iconify-icons/game-icons/snowflake-1";
import iconSpade from "@iconify-icons/game-icons/spade";
import iconSparklingSabre from "@iconify-icons/game-icons/sparkling-sabre";
import iconSpearHook from "@iconify-icons/game-icons/spear-hook";
import iconSpectre from "@iconify-icons/game-icons/spectre";
import iconSpellBook from "@iconify-icons/game-icons/spell-book";
import iconSun from "@iconify-icons/game-icons/sun";
import iconSunbeams from "@iconify-icons/game-icons/sunbeams";
import iconSwapBag from "@iconify-icons/game-icons/swap-bag";
import iconTheaterCurtains from "@iconify-icons/game-icons/theater-curtains";
import iconThrownKnife from "@iconify-icons/game-icons/thrown-knife";
import iconThrownSpear from "@iconify-icons/game-icons/thrown-spear";
import iconThunderStruck from "@iconify-icons/game-icons/thunder-struck";
import iconTorch from "@iconify-icons/game-icons/torch";
import iconTornado from "@iconify-icons/game-icons/tornado";
import iconTransform from "@iconify-icons/game-icons/transform";
import iconTrident from "@iconify-icons/game-icons/trident";
import iconVial from "@iconify-icons/game-icons/vial";
import iconVisoredHelm from "@iconify-icons/game-icons/visored-helm";
import iconWarhammer from "@iconify-icons/game-icons/warhammer";
import iconWhip from "@iconify-icons/game-icons/whip";
import iconWingedScepter from "@iconify-icons/game-icons/winged-scepter";
import iconWingfoot from "@iconify-icons/game-icons/wingfoot";
import iconWizardStaff from "@iconify-icons/game-icons/wizard-staff";
import iconWolfHead from "@iconify-icons/game-icons/wolf-head";
import iconWoodClub from "@iconify-icons/game-icons/wood-club";
import { isCurated } from "./curatedIcons";

const CURATED_PREFIX = "game-icons";

const CURATED: Record<string, IconifyIcon> = {
  "all-seeing-eye": iconAllSeeingEye,
  "angel-wings": iconAngelWings,
  ankh: iconAnkh,
  anvil: iconAnvil,
  "arcing-bolt": iconArcingBolt,
  "arrow-cluster": iconArrowCluster,
  barbute: iconBarbute,
  "battle-axe": iconBattleAxe,
  "bloody-stash": iconBloodyStash,
  "bolt-spell-cast": iconBoltSpellCast,
  boots: iconBoots,
  "bottle-vapors": iconBottleVapors,
  "bow-arrow": iconBowArrow,
  "bowie-knife": iconBowieKnife,
  bread: iconBread,
  broadsword: iconBroadsword,
  caduceus: iconCaduceus,
  cape: iconCape,
  "chain-mail": iconChainMail,
  charm: iconCharm,
  "checked-shield": iconCheckedShield,
  "chest-armor": iconChestArmor,
  claws: iconClaws,
  compass: iconCompass,
  crossbow: iconCrossbow,
  "crystal-ball": iconCrystalBall,
  "crystal-cluster": iconCrystalCluster,
  "crystal-shrine": iconCrystalShrine,
  "cursed-star": iconCursedStar,
  "death-juice": iconDeathJuice,
  "diamond-ring": iconDiamondRing,
  "dragon-head": iconDragonHead,
  "drama-masks": iconDramaMasks,
  "drink-me": iconDrinkMe,
  enrage: iconEnrage,
  "evil-eyes": iconEvilEyes,
  "eye-of-horus": iconEyeOfHorus,
  fangs: iconFangs,
  "feathered-wing": iconFeatheredWing,
  "fire-flower": iconFireFlower,
  "fire-spell-cast": iconFireSpellCast,
  "fishing-pole": iconFishingPole,
  "fizzing-flask": iconFizzingFlask,
  flail: iconFlail,
  "frog-prince": iconFrogPrince,
  "frozen-orb": iconFrozenOrb,
  gauntlet: iconGauntlet,
  "gem-pendant": iconGemPendant,
  ghost: iconGhost,
  glaive: iconGlaive,
  "grim-reaper": iconGrimReaper,
  halberd: iconHalberd,
  "hand-saw": iconHandSaw,
  healing: iconHealing,
  "healing-shield": iconHealingShield,
  "heavy-bullets": iconHeavyBullets,
  "high-shot": iconHighShot,
  "holy-symbol": iconHolySymbol,
  "honey-jar": iconHoneyJar,
  "horned-skull": iconHornedSkull,
  "ice-cube": iconIceCube,
  "ice-spell-cast": iconIceSpellCast,
  imprisoned: iconImprisoned,
  katana: iconKatana,
  knapsack: iconKnapsack,
  "lantern-flame": iconLanternFlame,
  "leather-armor": iconLeatherArmor,
  "lightning-arc": iconLightningArc,
  "locked-chest": iconLockedChest,
  lockpicks: iconLockpicks,
  "love-mystery": iconLoveMystery,
  "mace-head": iconMaceHead,
  "magic-lamp": iconMagicLamp,
  "magic-portal": iconMagicPortal,
  "magic-shield": iconMagicShield,
  "magic-swirl": iconMagicSwirl,
  "magnifying-glass": iconMagnifyingGlass,
  meat: iconMeat,
  moon: iconMoon,
  "morph-ball": iconMorphBall,
  necklace: iconNecklace,
  "night-sleep": iconNightSleep,
  "perspective-dice-six-faces-random": iconPerspectiveDiceSixFacesRandom,
  "plain-dagger": iconPlainDagger,
  "plasma-bolt": iconPlasmaBolt,
  "poison-cloud": iconPoisonCloud,
  "potion-ball": iconPotionBall,
  prayer: iconPrayer,
  ring: iconRing,
  "rope-coil": iconRopeCoil,
  "round-bottom-flask": iconRoundBottomFlask,
  "rune-stone": iconRuneStone,
  "scroll-unfurled": iconScrollUnfurled,
  scythe: iconScythe,
  shield: iconShield,
  "shiny-apple": iconShinyApple,
  "skull-crossed-bones": iconSkullCrossedBones,
  "snowflake-1": iconSnowflake1,
  spade: iconSpade,
  "sparkling-sabre": iconSparklingSabre,
  "spear-hook": iconSpearHook,
  spectre: iconSpectre,
  "spell-book": iconSpellBook,
  sun: iconSun,
  sunbeams: iconSunbeams,
  "swap-bag": iconSwapBag,
  "theater-curtains": iconTheaterCurtains,
  "thrown-knife": iconThrownKnife,
  "thrown-spear": iconThrownSpear,
  "thunder-struck": iconThunderStruck,
  torch: iconTorch,
  tornado: iconTornado,
  transform: iconTransform,
  trident: iconTrident,
  vial: iconVial,
  "visored-helm": iconVisoredHelm,
  warhammer: iconWarhammer,
  whip: iconWhip,
  "winged-scepter": iconWingedScepter,
  wingfoot: iconWingfoot,
  "wizard-staff": iconWizardStaff,
  "wolf-head": iconWolfHead,
  "wood-club": iconWoodClub,
};

let fullSetPromise: Promise<void> | null = null;
export function ensureFullSet(): Promise<void> {
  fullSetPromise ??= import("@iconify-json/game-icons/icons.json").then((m) => {
    addCollection(m.default as IconifyJSON);
  });
  return fullSetPromise;
}

const warned = new Set<string>();

type Props = {
  iconKey: string;
};

export function ResolvedIcon({ iconKey }: Props) {
  // Two guards, distinct purposes:
  //   1. CURATED[iconKey] hit → render synchronously via the per-icon
  //      import object; never load the full-set chunk.
  //   2. !isCurated(iconKey) → fall through to the lazy full-set load.
  //      The negation is the guard: if a key is in CURATED_ICONS but
  //      missing from the CURATED record (a developer forgot the import),
  //      we deliberately do NOT paper over it with a full-set load —
  //      that would silently defeat the curated-set perf optimization.
  const curated = CURATED[iconKey];
  if (curated) {
    return <Icon icon={curated} />;
  }
  if (!isCurated(iconKey)) {
    void ensureFullSet().then(() => {
      if (
        import.meta.env.DEV &&
        !iconLoaded(`${CURATED_PREFIX}:${iconKey}`) &&
        !warned.has(iconKey)
      ) {
        warned.add(iconKey);
        console.warn(`[ResolvedIcon] Unknown iconKey "${iconKey}" — rendering nothing.`);
      }
    });
  }
  return <Icon icon={`${CURATED_PREFIX}:${iconKey}`} />;
}
