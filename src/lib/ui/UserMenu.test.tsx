import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { supabase } from "../../api/supabase";
import { SessionContext, type SessionState } from "../../auth/useSession";
import { render, screen } from "../../test/render";
import { UserMenu } from "./UserMenu";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...rest
    }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
      <a href={to as string} {...rest}>
        {children}
      </a>
    ),
  };
});

const wrap = (state: SessionState) =>
  render(
    <SessionContext.Provider value={state}>
      <UserMenu />
    </SessionContext.Provider>,
  );

describe("<UserMenu>", () => {
  it("renders a Sign in link when unauthenticated", () => {
    wrap({ status: "unauthenticated", user: null, session: null });
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders nothing while session is loading", () => {
    const { container } = wrap({ status: "loading", user: null, session: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an account-menu trigger when authenticated", () => {
    wrap({
      status: "authenticated",
      user: { id: "u1", email: "ada@example.com" } as never,
      session: {} as never,
    });
    expect(
      screen.getByRole("button", { name: /account menu for ada@example\.com/i }),
    ).toBeInTheDocument();
  });

  it("opens the menu and shows the email and a Sign out item", async () => {
    wrap({
      status: "authenticated",
      user: { id: "u1", email: "ada@example.com" } as never,
      session: {} as never,
    });
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("invokes supabase.auth.signOut when Sign out is activated", async () => {
    const spy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null } as never);
    wrap({
      status: "authenticated",
      user: { id: "u1", email: "ada@example.com" } as never,
      session: {} as never,
    });
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(spy).toHaveBeenCalled();
  });

  it("renders an accent pill linking to /login when the user is anonymous", () => {
    wrap({
      status: "authenticated",
      user: { id: "anon-1", email: null, is_anonymous: true } as never,
      session: {} as never,
    });
    const link = screen.getByRole("link", { name: /sign in to save your work/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("does NOT render the avatar/menu when the user is anonymous", () => {
    wrap({
      status: "authenticated",
      user: { id: "anon-1", email: null, is_anonymous: true } as never,
      session: {} as never,
    });
    expect(screen.queryByRole("button", { name: /account menu/i })).not.toBeInTheDocument();
  });
});
