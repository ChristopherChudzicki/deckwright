const ordinal = (n: number): string => {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
};

export const levelLabel = (level: number, schoolName: string): string => {
  if (level === 0) {
    const cap = schoolName.charAt(0).toUpperCase() + schoolName.slice(1).toLowerCase();
    return `${cap} cantrip`;
  }
  return `${ordinal(level)}-level ${schoolName.toLowerCase()}`;
};

// 2014 SRD packs the count into casting_time (e.g. "10minutes"); 2024 strips it
// (e.g. just "minute"). Parse out a quantity if present, otherwise default to 1.
const CONCATENATED_CASTING = /^(\d+)(minute|hour|day|round|turn)s?$/i;

export const castingTimeLabel = (castingTime: string, ritual: boolean): string => {
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

export const durationLabel = (duration: string, concentration: boolean): string => {
  const formatted = formatDuration(duration);
  if (!concentration) return formatted;
  if (formatted === "") return "Concentration";
  return `Concentration, up to ${formatted.toLowerCase()}`;
};

export type ComponentsInput = {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  /** Free-form material description. Appended in parens when material=true and non-empty. */
  materialSpecified?: string;
};

export const componentsLabel = (input: ComponentsInput): string => {
  const pieces: string[] = [];
  if (input.verbal) pieces.push("V");
  if (input.somatic) pieces.push("S");
  if (input.material) pieces.push("M");
  const base = pieces.join(", ");
  if (!input.material) return base;
  const spec = input.materialSpecified?.trim();
  if (!spec) return base;
  return `${base} (${spec})`;
};

export const classesLabel = (classes: { name: string }[]): string =>
  classes
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
