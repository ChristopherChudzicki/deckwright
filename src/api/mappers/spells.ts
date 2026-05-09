import type { SpellCard } from "../../cards/types";
import { newId } from "../../lib/id";
import { nowIso } from "../../lib/time";
import type { SpellDetail } from "../endpoints/spells";

const ordinal = (n: number): string => {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
};

export const levelTag = (level: number, schoolName: string): string => {
  if (level === 0) {
    const cap = schoolName.charAt(0).toUpperCase() + schoolName.slice(1).toLowerCase();
    return `${cap} cantrip`;
  }
  return `${ordinal(level)}-level ${schoolName.toLowerCase()}`;
};

// 2014 SRD packs the count into casting_time (e.g. "10minutes"); 2024 strips it
// (e.g. just "minute"). Parse out a quantity if present, otherwise default to 1.
const CONCATENATED_CASTING = /^(\d+)(minute|hour|day|round|turn)s?$/i;

const castingTimeTag = (castingTime: string, ritual: boolean): string => {
  let qty = 1;
  let unit: string;
  const m = CONCATENATED_CASTING.exec(castingTime);
  if (m) {
    qty = Number(m[1]);
    unit = (m[2] as string).toLowerCase();
  } else if (castingTime === "bonus-action") {
    unit = "bonus action";
  } else {
    unit = castingTime;
  }
  const word = qty === 1 ? unit : `${unit}s`;
  const base = `${qty} ${word}`;
  return ritual ? `${base} (ritual)` : base;
};

// 2024 returns singular units (e.g. "10 minute"); 2014 returns plural ("10 minutes").
const QUANTIFIED_DURATION = /^(\d+)\s+(minute|hour|day|round|turn)s?$/i;

const formatDuration = (duration: string): string => {
  const trimmed = duration.trim();
  if (trimmed === "") return "";
  const match = QUANTIFIED_DURATION.exec(trimmed);
  if (match) {
    const qty = match[1] as string;
    const unit = match[2] as string;
    const n = Number(qty);
    const pluralized = n === 1 ? unit.toLowerCase() : `${unit.toLowerCase()}s`;
    return `${qty} ${pluralized}`;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const durationTag = (duration: string, concentration: boolean): string => {
  const formatted = formatDuration(duration);
  if (!concentration) return formatted;
  if (formatted === "") return "Concentration";
  return `Concentration, up to ${formatted.toLowerCase()}`;
};

const componentsTag = (verbal: boolean, somatic: boolean, material: boolean): string => {
  const pieces: string[] = [];
  if (verbal) pieces.push("V");
  if (somatic) pieces.push("S");
  if (material) pieces.push("M");
  return pieces.join(", ");
};

const classesTag = (classes: { name: string }[]): string =>
  classes
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");

const buildBody = (desc: string, higherLevel: string): string => {
  if (higherLevel.trim() === "") return desc;
  return `${desc}\n\n***At Higher Levels.*** ${higherLevel}`;
};

export const spellDetailToCard = (detail: SpellDetail): SpellCard => {
  const now = nowIso();
  const headerTags: string[] = [
    levelTag(detail.level, detail.school.name),
    castingTimeTag(detail.casting_time, detail.ritual),
    detail.range_text,
    durationTag(detail.duration, detail.concentration),
  ].filter((t) => t !== ""); // duration may be "" on some 2024 spells
  const footerTags: string[] = [
    componentsTag(detail.verbal, detail.somatic, detail.material),
    classesTag(detail.classes),
  ].filter((t) => t !== ""); // some spells have no V/S/M components, or empty classes (e.g. 2014 Branding Smite)
  return {
    id: newId(),
    kind: "spell",
    name: detail.name,
    headerTags,
    body: buildBody(detail.desc, detail.higher_level),
    footerTags,
    source: "api",
    apiRef: { system: "open5e", slug: detail.key, ruleset: detail.ruleset },
    createdAt: now,
    updatedAt: now,
  };
};
