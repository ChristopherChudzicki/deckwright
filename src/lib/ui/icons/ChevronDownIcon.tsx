import { Icon } from "@iconify/react";
import chevronDownIcon from "@iconify-icons/lucide/chevron-down";

export function ChevronDownIcon({ size = 16 }: { size?: number }) {
  return <Icon icon={chevronDownIcon} width={size} height={size} aria-hidden="true" />;
}
