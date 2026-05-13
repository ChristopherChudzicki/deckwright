import type { Spell } from "../../data/srd-schema";
import {
  castingTimeLabel,
  classesLabel,
  componentsLabel,
  durationLabel,
  levelLabel,
} from "../../lib/srd-format/spells";
import { type StatItem, StatList } from "./StatList";

export function SpellStatBlock({ spell }: { spell: Spell }) {
  const items: StatItem[] = [];
  items.push({ label: "Level", value: levelLabel(spell.level, spell.school.name) });
  items.push({
    label: "Casting Time",
    value: castingTimeLabel(spell.casting_time, spell.ritual),
  });
  if (spell.range_text) items.push({ label: "Range", value: spell.range_text });

  const components = componentsLabel({
    verbal: spell.verbal,
    somatic: spell.somatic,
    material: spell.material,
    materialSpecified: spell.material_specified,
  });
  if (components) items.push({ label: "Components", value: components });

  const duration = durationLabel(spell.duration, spell.concentration);
  if (duration) items.push({ label: "Duration", value: duration });

  const classes = classesLabel(spell.classes);
  if (classes) items.push({ label: "Classes", value: classes });

  return <StatList items={items} />;
}
