import { Icon } from "@iconify/react";
import googleIcon from "@iconify-icons/logos/google-icon";

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return <Icon icon={googleIcon} width={size} height={size} aria-hidden="true" />;
}
