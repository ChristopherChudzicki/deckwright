import { Icon } from "@iconify/react";
import boldIcon from "@iconify-icons/lucide/bold";

export function BoldIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={boldIcon} width={size} height={size} aria-hidden="true" />;
}
