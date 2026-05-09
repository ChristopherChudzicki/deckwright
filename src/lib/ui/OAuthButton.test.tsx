import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import { OAuthButton } from "./OAuthButton";

describe("<OAuthButton>", () => {
  it("renders 'Sign in with Google' for the google provider", () => {
    render(<OAuthButton provider="google" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });

  it("renders 'Sign in with GitHub' for the github provider", () => {
    render(<OAuthButton provider="github" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeInTheDocument();
  });

  it("renders 'Sign in as Dev User' for the dev provider", () => {
    render(<OAuthButton provider="dev" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Sign in as Dev User" })).toBeInTheDocument();
  });

  it("calls onPress when clicked", async () => {
    const onPress = vi.fn();
    render(<OAuthButton provider="google" onPress={onPress} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
