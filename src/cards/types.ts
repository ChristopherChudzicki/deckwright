export type CardId = string;

export type BaseCard = {
  id: CardId;
  name: string;
  body: string;
  imageUrl?: string;
  source: "custom" | "api";
  apiRef?: { system: "dnd5eapi"; slug: string; ruleset: "2014" | "2024" };
  createdAt: string;
  updatedAt: string;
  iconKey?: string;
};

export type ItemCard = BaseCard & {
  kind: "item";
  typeLine: string;
  footerTags: string[];
};

export type SpellCard = BaseCard & { kind: "spell" };
export type AbilityCard = BaseCard & { kind: "ability" };

export type Card = ItemCard | SpellCard | AbilityCard;

export type Deck = {
  version: 1;
  cards: Card[];
};
