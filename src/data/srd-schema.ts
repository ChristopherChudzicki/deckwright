import { z } from "zod";

const namedSchema = z.object({ name: z.string() });

export const magicItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  desc: z.string(),
  category: namedSchema,
  rarity: namedSchema,
  requires_attunement: z.boolean(),
  attunement_detail: z.string().nullable(),
  weapon: z
    .object({
      damage_dice: z.string(),
      damage_type: namedSchema,
    })
    .nullable(),
  armor: z
    .object({
      ac_base: z.number(),
      ac_add_dexmod: z.boolean(),
      ac_cap_dexmod: z.number().nullable(),
    })
    .nullable(),
  weight: z.string(),
  weight_unit: z.string(),
});

export type MagicItem = z.infer<typeof magicItemSchema>;

export const magicItemListSchema = z.array(magicItemSchema);

export const CASTING_TIME_VALUES = [
  "action",
  "bonus-action",
  "reaction",
  "minute",
  "hour",
  // 2014 SRD uses concatenated forms (e.g. "1minute", "8hours") instead of
  // bare unit names.
  "1minute",
  "10minutes",
  "1hour",
  "8hours",
  "12hours",
  "24hours",
] as const;

export const spellSchema = z.object({
  key: z.string(),
  name: z.string(),
  level: z.number(),
  school: namedSchema,
  casting_time: z.enum(CASTING_TIME_VALUES),
  ritual: z.boolean(),
  range_text: z.string(),
  duration: z.string(),
  concentration: z.boolean(),
  verbal: z.boolean(),
  somatic: z.boolean(),
  material: z.boolean(),
  material_specified: z.string(),
  classes: z.array(namedSchema),
  desc: z.string(),
  higher_level: z.string(),
});

export type Spell = z.infer<typeof spellSchema>;

export const spellListSchema = z.array(spellSchema);
