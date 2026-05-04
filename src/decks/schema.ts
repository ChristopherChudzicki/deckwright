import { z } from "zod";

const apiRefSchema = z.object({
  system: z.literal("open5e"),
  slug: z.string(),
  ruleset: z.enum(["2014", "2024"]),
});

const baseCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string(),
  imageUrl: z.string().optional(),
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

export const cardSchema = z.discriminatedUnion("kind", [
  itemCardSchema,
  spellCardSchema,
  abilityCardSchema,
]);

const itemPayloadSchema = itemCardSchema.omit({ id: true });
const spellPayloadSchema = spellCardSchema.omit({ id: true });
const abilityPayloadSchema = abilityCardSchema.omit({ id: true });

export const cardPayloadSchema = z.discriminatedUnion("kind", [
  itemPayloadSchema,
  spellPayloadSchema,
  abilityPayloadSchema,
]);

export const deckSchema = z.object({
  version: z.literal(1),
  cards: z.array(cardSchema),
});
