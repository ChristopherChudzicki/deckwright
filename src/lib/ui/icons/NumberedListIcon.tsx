import { Icon } from "@iconify/react";
import listOrderedIcon from "@iconify-icons/lucide/list-ordered";

export function NumberedListIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={listOrderedIcon} width={size} height={size} aria-hidden="true" />;
}
