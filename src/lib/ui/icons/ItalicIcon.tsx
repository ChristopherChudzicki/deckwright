import { Icon } from "@iconify/react";
import italicIcon from "@iconify-icons/lucide/italic";

export function ItalicIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={italicIcon} width={size} height={size} aria-hidden="true" />;
}
