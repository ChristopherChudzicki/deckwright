import { z } from "zod";

const apiRefSchema = z.object({
  system: z.literal("open5e"),
  slug: z.string(),
  ruleset: z.enum(["2014", "2024"]),
  kind: z.enum(["magic-items", "mundane-items", "spells"]),
});

const baseCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string(),
  source: z.enum(["custom", "api"]),
  apiRef: apiRefSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  iconKey: z.string().optional(),
  headerTags: z.array(z.string()).default([]),
  footerTags: z.array(z.string()).default([]),
});

export const itemCardSchema = baseCardSchema.extend({ kind: z.literal("item") });
export const spellCardSchema = baseCardSchema.extend({ kind: z.literal("spell") });
export const abilityCardSchema = baseCardSchema.extend({ kind: z.literal("ability") });

const itemPayloadSchema = itemCardSchema.omit({ id: true });
const spellPayloadSchema = spellCardSchema.omit({ id: true });
const abilityPayloadSchema = abilityCardSchema.omit({ id: true });

export const cardPayloadSchema = z.discriminatedUnion("kind", [
  itemPayloadSchema,
  spellPayloadSchema,
  abilityPayloadSchema,
]);
