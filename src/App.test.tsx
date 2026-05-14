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
  return render(<App router={router} />);
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

  it("triggers anonymous sign-in on app routes", async () => {
    const spy = vi.spyOn(supabase.auth, "signInAnonymously");
    appAt("/");
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });
});
