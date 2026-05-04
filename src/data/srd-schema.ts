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
    })
    .nullable(),
  weight: z.string(),
  weight_unit: z.string(),
});

export type MagicItem = z.infer<typeof magicItemSchema>;

export const magicItemListSchema = z.array(magicItemSchema);
