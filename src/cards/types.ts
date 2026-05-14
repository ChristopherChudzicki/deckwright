export type CardId = string;

export type BaseCard = {
  id: CardId;
  name: string;
  body: string;
  source: "custom" | "api";
  apiRef?: {
    system: "open5e";
    slug: string;
    ruleset: "2014" | "2024";
    kind: "magic-items" | "mundane-items" | "spells";
  };
  referenceUrl?: string;
  createdAt: string;
  updatedAt: string;
  iconKey?: string;
  headerTags: string[];
  footerTags: string[];
};

export type ItemCard = BaseCard & { kind: "item" };
export type SpellCard = BaseCard & { kind: "spell" };
export type AbilityCard = BaseCard & { kind: "ability" };

export type Card = ItemCard | SpellCard | AbilityCard;

export type RenderableCard = ItemCard | SpellCard;

export const isRenderableCard = (card: Card): card is RenderableCard =>
  card.kind === "item" || card.kind === "spell";
