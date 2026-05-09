import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../api/supabase";
import { AuthProvider } from "../auth/AuthProvider";
import * as useSessionMod from "../auth/useSession";
import { makeCardRow, makeDeckRow } from "../test/factories";
import { server } from "../test/msw";
import { signInTestUser } from "../test/signInTestUser";
import { HomeView } from "./HomeView";

const SB = "http://localhost:54321";
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
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

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("HomeView", () => {
  beforeEach(async () => {
    await supabase.auth.signOut();
    navigate.mockClear();
  });

  it("redirects to /login when unauthenticated", async () => {
    render(wrap(<HomeView />));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/login" }));
  });

  it("renders a LoadingState while the session is initializing", () => {
    vi.spyOn(useSessionMod, "useSession").mockReturnValue({
      status: "loading",
      user: null,
      session: null,
    });
    render(wrap(<HomeView />));
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    vi.restoreAllMocks();
  });

  it("shows the user's decks when authenticated", async () => {
    await signInTestUser();
    const decks = [makeDeckRow.build(), makeDeckRow.build()];
    server.use(http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json(decks)));
    render(wrap(<HomeView />));
    for (const d of decks) {
      await waitFor(() => expect(screen.getByText(d.name)).toBeInTheDocument());
    }
  });

  it("shows an empty-state CTA when authenticated with no decks", async () => {
    await signInTestUser();
    server.use(http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([])));
    render(wrap(<HomeView />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /create your first deck/i })).toBeInTheDocument(),
    );
  });

  it("creates a new deck when the CTA is clicked", async () => {
    await signInTestUser();
    const inserted = makeDeckRow.build({ name: "Untitled deck" });
    server.use(
      http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([])),
      http.post(`${SB}/rest/v1/decks`, () => HttpResponse.json([inserted], { status: 201 })),
    );
    render(wrap(<HomeView />));
    await userEvent.click(await screen.findByRole("button", { name: /create your first deck/i }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/deck/$deckId",
        params: { deckId: inserted.id },
      }),
    );
  });

  it("creates a new deck named after the file when JSON is imported", async () => {
    await signInTestUser();
    const created = makeDeckRow.build({ name: "my-deck" });
    const insertedRows: unknown[] = [];
    server.use(
      http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([])),
      http.post(`${SB}/rest/v1/decks`, () => HttpResponse.json([created], { status: 201 })),
      http.post(`${SB}/rest/v1/cards`, async ({ request }) => {
        insertedRows.push(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );

    render(wrap(<HomeView />));

    const file = new File(
      [
        JSON.stringify({
          version: 1,
          cards: [
            {
              id: "x",
              kind: "item",
              name: "Sword",
              headerTags: ["Weapon"],
              body: "",
              source: "custom",
              createdAt: "2026-04-26T00:00:00Z",
              updatedAt: "2026-04-26T00:00:00Z",
            },
          ],
        }),
      ],
      "my-deck.json",
      { type: "application/json" },
    );

    const input = await screen.findByLabelText(/import json/i);
    await userEvent.upload(input, file);

    await waitFor(() => expect(insertedRows).toHaveLength(1));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/deck/$deckId",
        params: { deckId: created.id },
      }),
    );
  });

  it("deletes a deck after confirmation", async () => {
    await signInTestUser();
    const deck = makeDeckRow.build();
    const onDelete = vi.fn();
    server.use(
      http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([deck])),
      http.delete(`${SB}/rest/v1/decks`, () => {
        onDelete();
        return HttpResponse.json([]);
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(wrap(<HomeView />));
    // Match the aria-label as a literal string to avoid regex escaping —
    // faker.lorem.words can produce names containing regex metacharacters.
    const del = await screen.findByRole("button", { name: `Delete ${deck.name}` });
    await userEvent.click(del);
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });
});

describe("HomeView with anon user", () => {
  beforeEach(() => {
    navigate.mockClear();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderAsAnon() {
    vi.spyOn(useSessionMod, "useSession").mockReturnValue({
      status: "authenticated",
      user: { id: "anon-1", email: null, is_anonymous: true } as never,
      session: {} as never,
    });
    return render(wrap(<HomeView />));
  }

  it("opens the FirstDeckDialog after an anonymous user creates their first deck", async () => {
    const inserted = makeDeckRow.build({ name: "Untitled deck", owner_id: "anon-1" });
    server.use(
      http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([])),
      http.post(`${SB}/rest/v1/decks`, () => HttpResponse.json([inserted], { status: 201 })),
    );
    renderAsAnon();
    await userEvent.click(await screen.findByRole("button", { name: /create your first deck/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /your decks live on this browser/i }),
      ).toBeInTheDocument(),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does NOT open the FirstDeckDialog if it has already been seen", async () => {
    window.localStorage.setItem("dndCards.firstDeckExplainerSeen", "1");
    const inserted = makeDeckRow.build({ name: "Untitled deck", owner_id: "anon-1" });
    server.use(
      http.post(`${SB}/rest/v1/rpc/list_my_decks`, () => HttpResponse.json([])),
      http.post(`${SB}/rest/v1/decks`, () => HttpResponse.json([inserted], { status: 201 })),
    );
    renderAsAnon();
    await userEvent.click(await screen.findByRole("button", { name: /create your first deck/i }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/deck/$deckId",
        params: { deckId: inserted.id },
      }),
    );
    expect(
      screen.queryByRole("heading", { name: /your decks live on this browser/i }),
    ).not.toBeInTheDocument();
  });
});
