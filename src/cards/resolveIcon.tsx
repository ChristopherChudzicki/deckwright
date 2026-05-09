import { addCollection, Icon } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";

const PREFIX = "game-icons";

let iconsPromise: Promise<void> | null = null;
export function ensureIcons(): Promise<void> {
  iconsPromise ??= import("@iconify-json/game-icons/icons.json").then((m) => {
    addCollection(m.default as IconifyJSON);
  });
  return iconsPromise;
}

type Props = {
  iconKey: string;
};

export function ResolvedIcon({ iconKey }: Props) {
  return <Icon icon={`${PREFIX}:${iconKey}`} />;
}
