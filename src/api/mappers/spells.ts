import type { SpellCard } from "../../cards/types";
import { newId } from "../../lib/id";
import {
  castingTimeLabel,
  classesLabel,
  componentsLabel,
  durationLabel,
  levelLabel,
  spellBodyMarkdown,
} from "../../lib/srd-format/spells";
import { nowIso } from "../../lib/time";
import type { SpellDetail } from "../endpoints/spells";

export const spellDetailToCard = (detail: SpellDetail): SpellCard => {
  const now = nowIso();
  const headerTags: string[] = [
    levelLabel(detail.level, detail.school.name),
    castingTimeLabel(detail.casting_time, detail.ritual),
    detail.range_text,
    durationLabel(detail.duration, detail.concentration),
  ].filter((t) => t !== "");
  const footerTags: string[] = [
    componentsLabel({
      verbal: detail.verbal,
      somatic: detail.somatic,
      material: detail.material,
      // Intentionally do NOT pass materialSpecified — card footer stays compact.
    }),
    classesLabel(detail.classes),
  ].filter((t) => t !== "");
  return {
    id: newId(),
    kind: "spell",
    name: detail.name,
    headerTags,
    body: spellBodyMarkdown(detail.desc, detail.higher_level),
    footerTags,
    source: "api",
    apiRef: { system: "open5e", slug: detail.key, ruleset: detail.ruleset },
    createdAt: now,
    updatedAt: now,
  };
};
