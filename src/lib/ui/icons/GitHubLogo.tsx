import { Icon } from "@iconify/react";
import githubIcon from "@iconify-icons/simple-icons/github";

export function GitHubLogo({ size = 18 }: { size?: number }) {
  return <Icon icon={githubIcon} width={size} height={size} aria-hidden="true" />;
}
