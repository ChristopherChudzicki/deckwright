import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { supabase } from "./api/supabase";
import { routeTree } from "./app/router";
import { makeCardRow, makePublicDeck } from "./test/factories";
import { SB_URL, server } from "./test/msw";
import { render, screen, waitFor } from "./test/render";

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

describe("App router (DeckView filter navigation)", () => {
  // Pins that DeckView's updateSearch call doesn't emit router-core's
  // "Could not find match for from:" dev warning. Mock-based tests in
  // DeckView.test.tsx assert the call shape; this exercises the real router.
  it("clicking a kind filter updates search without router-core warnings", async () => {
    const deck = makePublicDeck.build({ is_owner: false });
    const card = makeCardRow.build({ deck_id: deck.id });
    server.use(
      http.post(`${SB_URL}/rest/v1/rpc/get_public_deck`, () => HttpResponse.json(deck)),
      http.post(`${SB_URL}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([card])),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { router } = appAt(`/deck/${deck.id}`);
      const itemsFilter = await screen.findByRole("radio", { name: /Items/ });
      await userEvent.click(itemsFilter);
      await waitFor(() => {
        expect(router.state.location.search).toMatchObject({ kind: "item" });
      });
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/Could not find match for from:/),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
