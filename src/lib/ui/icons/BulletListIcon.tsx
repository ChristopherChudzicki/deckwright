import { Icon } from "@iconify/react";
import listIcon from "@iconify-icons/lucide/list";

export function BulletListIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={listIcon} width={size} height={size} aria-hidden="true" />;
}
