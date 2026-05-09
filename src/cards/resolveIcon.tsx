import { addCollection, Icon, iconLoaded } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";
import { useEffect } from "react";

const PREFIX = "game-icons";

let iconsPromise: Promise<void> | null = null;
export function ensureIcons(): Promise<void> {
  iconsPromise ??= import("@iconify-json/game-icons/icons.json").then((m) => {
    addCollection(m.default as IconifyJSON);
  });
  return iconsPromise;
}

const warned = new Set<string>();

type Props = {
  iconKey: string;
};

export function ResolvedIcon({ iconKey }: Props) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void ensureIcons().then(() => {
      if (iconLoaded(`${PREFIX}:${iconKey}`) || warned.has(iconKey)) return;
      warned.add(iconKey);
      console.warn(`[ResolvedIcon] Unknown iconKey "${iconKey}" — rendering nothing.`);
    });
  }, [iconKey]);
  return <Icon icon={`${PREFIX}:${iconKey}`} />;
}
