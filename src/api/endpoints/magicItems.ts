import { apiGet } from "../apiClient";

export type Ruleset = "2014" | "2024";

const documentKey = (ruleset: Ruleset): string => (ruleset === "2024" ? "srd-2024" : "srd-2014");

export type MagicItemIndexEntry = {
  key: string;
  name: string;
};

export type MagicItemIndex = {
  count: number;
  results: MagicItemIndexEntry[];
};

type WeaponInfo = {
  damage_dice: string;
  damage_type: { name: string };
};

type ArmorInfo = {
  ac_base: number;
};

export type MagicItemDetail = {
  key: string;
  name: string;
  desc: string;
  category: { name: string };
  rarity: { name: string };
  requires_attunement: boolean;
  attunement_detail: string | null;
  weapon: WeaponInfo | null;
  armor: ArmorInfo | null;
  weight: string;
  weight_unit: string;
  ruleset: Ruleset;
};

type Open5ePage<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type RawMagicItem = {
  key: string;
  name: string;
  desc: string;
  category: { name: string };
  rarity: { name: string };
  requires_attunement: boolean;
  attunement_detail: string | null;
  weapon: WeaponInfo | null;
  armor: ArmorInfo | null;
  weight: string;
  weight_unit: string;
};

const FETCH_LIMIT = 2000;

export const fetchMagicItemIndex = async (ruleset: Ruleset): Promise<MagicItemIndex> => {
  const path = `/v2/magicitems/?document=${documentKey(ruleset)}&limit=${FETCH_LIMIT}`;
  const page = await apiGet<Open5ePage<RawMagicItem>>(path);
  if (page.count > page.results.length) {
    throw new Error(
      `fetchMagicItemIndex: SRD ${ruleset} has ${page.count} magic items, exceeding the ${FETCH_LIMIT}-row limit. Pagination needs to be added.`,
    );
  }
  return {
    count: page.count,
    results: page.results.map(({ key, name }) => ({ key, name })),
  };
};

export const fetchMagicItemDetail = async (
  ruleset: Ruleset,
  key: string,
): Promise<MagicItemDetail> => {
  const raw = await apiGet<RawMagicItem>(`/v2/magicitems/${key}/`);
  return { ...raw, ruleset };
};
