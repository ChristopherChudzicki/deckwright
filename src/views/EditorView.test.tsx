import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as paginateModule from "../cards/paginate";
import { makeCardRow, makeItemPayload } from "../test/factories";
import { SB_URL as SB, server } from "../test/msw";
import { EditorView } from "./EditorView";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigate };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("EditorView", () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it("renders 'Card not found' when cardId is missing from server", async () => {
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([])));
    render(wrap(<EditorView deckId="d1" cardId="missing" />));
    await waitFor(() => expect(screen.getByText(/card not found/i)).toBeInTheDocument());
  });

  it("saves via POST when cardId='new'", async () => {
    const onPost = vi.fn();
    server.use(
      http.post(`${SB}/rest/v1/cards`, async ({ request }) => {
        onPost(await request.json());
        return HttpResponse.json([makeCardRow.build()], { status: 201 });
      }),
    );
    render(wrap(<EditorView deckId="d1" cardId="new" />));
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));
    await waitFor(() => expect(onPost).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith({ to: "/deck/$deckId", params: { deckId: "d1" } });
  });

  it("saves via PATCH when editing an existing card", async () => {
    const card = makeCardRow.build({ id: "c1", deck_id: "d1" });
    const onPatch = vi.fn();
    server.use(
      http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])),
      http.patch(`${SB}/rest/v1/cards`, async ({ request }) => {
        onPatch(await request.json());
        return HttpResponse.json([card]);
      }),
    );
    render(wrap(<EditorView deckId="d1" cardId="c1" />));
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));
    await waitFor(() => expect(onPatch).toHaveBeenCalled());
  });

  it("shows the template-item notice for API-sourced cards with a generic body", async () => {
    const templatePayload = {
      ...makeItemPayload.build(),
      source: "api" as const,
      body: "Weapon (Any Melee Weapon). +1 to attack rolls.",
    };
    const card = makeCardRow.build({ id: "c1", deck_id: "d1", payload: templatePayload });
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
    render(wrap(<EditorView deckId="d1" cardId="c1" />));
    expect(await screen.findByTestId("template-notice")).toBeInTheDocument();
  });

  it("does NOT show the template notice for custom items", async () => {
    const card = makeCardRow.build({ id: "c1", deck_id: "d1" });
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
    render(wrap(<EditorView deckId="d1" cardId="c1" />));
    await screen.findByRole("button", { name: /save/i }); // wait for render
    expect(screen.queryByTestId("template-notice")).not.toBeInTheDocument();
  });

  it("shows '1 card' counts label when body fits", async () => {
    const card = makeCardRow.build({ id: "c1", deck_id: "d1" });
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
    render(wrap(<EditorView deckId="d1" cardId="c1" />));
    expect(await screen.findByText("1 card")).toBeInTheDocument();
  });

  it("shows multi-card counts label and paginator when body overflows at 4 per page", async () => {
    const card = makeCardRow.build({ id: "c1", deck_id: "d1" });
    vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
      body === "" ? [""] : ["chunk-a", "chunk-b", "chunk-c"],
    );
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
    render(wrap(<EditorView deckId="d1" cardId="c1" />));
    expect(await screen.findByRole("button", { name: /next preview page/i })).toBeInTheDocument();
    expect(screen.getByText("3 cards")).toBeInTheDocument();
  });

  it("shows per-bucket label when 4-per-page and 2-per-page counts differ", async () => {
    const card = makeCardRow.build({ id: "c1", deck_id: "d1" });
    let callCount = 0;
    vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) => {
      if (body === "") return [""];
      callCount += 1;
      return callCount === 1 ? ["chunk-a", "chunk-b", "chunk-c"] : ["chunk-x", "chunk-y"];
    });
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
    render(wrap(<EditorView deckId="d1" cardId="c1" />));
    expect(
      await screen.findByText("3 cards (4 per page) · 2 cards (2 per page)"),
    ).toBeInTheDocument();
  });
});
