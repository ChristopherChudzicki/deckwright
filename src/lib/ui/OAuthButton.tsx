import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";
import { cx } from "../cx";
import { GitHubLogo } from "./icons/GitHubLogo";
import { GoogleLogo } from "./icons/GoogleLogo";
import styles from "./OAuthButton.module.css";

export type OAuthProvider = "google" | "github" | "dev";

const LABELS: Record<OAuthProvider, string> = {
  google: "Sign in with Google",
  github: "Sign in with GitHub",
  dev: "Sign in as Dev User",
};

export type OAuthButtonProps = Omit<RACButtonProps, "className" | "children"> & {
  provider: OAuthProvider;
  className?: string;
};

export function OAuthButton({ provider, className, ...rest }: OAuthButtonProps) {
  return (
    <RACButton {...rest} data-provider={provider} className={cx(styles.oauthBtn, className)}>
      <span className={styles.icon} aria-hidden="true">
        {provider === "google" && <GoogleLogo />}
        {provider === "github" && <GitHubLogo />}
      </span>
      <span>{LABELS[provider]}</span>
    </RACButton>
  );
}
