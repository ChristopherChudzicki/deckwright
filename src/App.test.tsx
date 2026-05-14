import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { supabase } from "./api/supabase";
import { routeTree } from "./app/router";
import { render, waitFor } from "./test/render";

function appAt(pathname: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  const result = render(<App router={router} />);
  return { ...result, router };
}

describe("App auth scope (anon enabled)", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
    vi.stubEnv("VITE_ANON_USERS_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not trigger anonymous sign-in on /reference/* routes", async () => {
    const spy = vi.spyOn(supabase.auth, "signInAnonymously");
    appAt("/reference/magic-items/srd_wand-of-wonder");
    await waitFor(() => {
      expect(document.title).toBe("Wand of Wonder · Deckwright");
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not trigger anonymous sign-in on /reference/* 404s", async () => {
    const spy = vi.spyOn(supabase.auth, "signInAnonymously");
    appAt("/reference/magic-items/srd_no-such-thing");
    await waitFor(() => {
      expect(document.title).toBe("Not found · Deckwright");
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("triggers anonymous sign-in once on app routes", async () => {
    const spy = vi.spyOn(supabase.auth, "signInAnonymously");
    appAt("/");
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("re-mounts AuthProvider when navigating from /reference/* to /", async () => {
    const spy = vi.spyOn(supabase.auth, "signInAnonymously");
    const { router } = appAt("/reference/magic-items/srd_wand-of-wonder");
    await waitFor(() => {
      expect(document.title).toBe("Wand of Wonder · Deckwright");
    });
    expect(spy).not.toHaveBeenCalled();
    await router.navigate({ to: "/" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });
});
