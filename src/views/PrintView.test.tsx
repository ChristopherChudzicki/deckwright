import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import * as layoutPaginatorModule from "../cards/layoutPaginator";
import { makeCardRow, makeItemPayload } from "../test/factories";
import { SB_URL as SB, server } from "../test/msw";
import { PrintView } from "./PrintView";
import styles from "./PrintView.module.css";

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("<PrintView>", () => {
  test("renders one page at 4-up for up to 4 cards", async () => {
    const cards = makeCardRow.buildList(3);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  });

  test("renders two pages when there are 5 cards at 4-up", async () => {
    const cards = makeCardRow.buildList(5);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(2));
  });

  test("switches to 2-up and repaginates accordingly", async () => {
    const cards = makeCardRow.buildList(3);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /cards per page/i }), "2");
    expect(screen.getAllByTestId("page")).toHaveLength(2);
  });

  test("2-up pages carry the landscape layout class", async () => {
    const cards = makeCardRow.buildList(2);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /cards per page/i }), "2");
    for (const page of screen.getAllByTestId("page")) {
      expect(page).toHaveClass(styles.perPage2 as string);
      expect(page).not.toHaveClass(styles.perPage4 as string);
    }
  });

  test("renders multiple physical cards for an oversized item at 4-up", async () => {
    const card = makeCardRow.build();
    vi.spyOn(layoutPaginatorModule, "layoutPaginate").mockImplementation(({ bodyHtml }) =>
      bodyHtml === "" ? [""] : ["chunk-a", "chunk-b", "chunk-c"],
    );
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([card])),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => {
      const indicators = screen.getAllByTestId("card-pagination");
      expect(indicators).toHaveLength(3);
      expect(indicators[0]).toHaveTextContent("Card 1 of 3");
      expect(indicators[2]).toHaveTextContent("Card 3 of 3");
    });
  });

  test("does not emit back pages when the toggle is off", async () => {
    const cards = makeCardRow.buildList(4);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    expect(document.querySelectorAll('[data-page-side="back"]')).toHaveLength(0);
  });

  test("emits one back page per front page when the toggle is on", async () => {
    const cards = makeCardRow.buildList(5);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(2));
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    expect(screen.getAllByTestId("page")).toHaveLength(4);
    expect(document.querySelectorAll('[data-page-side="front"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-page-side="back"]')).toHaveLength(2);
  });

  test("places back tiles in the horizontally-mirrored slot order at 4-up", async () => {
    const cards = makeCardRow.buildList(4);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
    expect(backPage).not.toBeNull();
    // Read the rendered slot order from the back page's data-card-id attrs and
    // assert it matches the imposition rule: [A, B, C, D] front → [B, A, D, C] back.
    // The back page's direct children are the slot divs in DOM (= CSS grid) order.
    const slots = Array.from(backPage.children) as HTMLElement[];
    expect(slots).toHaveLength(4);
    const slotIds = slots.map(
      (s) => s.querySelector<HTMLElement>("[data-card-id]")?.dataset.cardId ?? null,
    );
    expect(slotIds).toEqual([cards[1]!.id, cards[0]!.id, cards[3]!.id, cards[2]!.id]);
  });

  test("partial last front page produces a back page with only the populated slots filled", async () => {
    const cards = makeCardRow.buildList(3);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
    expect(backPage).not.toBeNull();
    // 3 fronts → 3 back tiles; the 4th slot is an empty .slot div.
    expect(backPage.querySelectorAll('[data-role="card-back-root"]')).toHaveLength(3);
  });

  test("shows the long-edge duplex tip at 4-up when backs are on", async () => {
    const cards = makeCardRow.buildList(2);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    // Toggle off: tip absent
    expect(screen.queryByText(/long edge|short edge/i)).not.toBeInTheDocument();
    // Toggle on: tip appears mentioning "long edge"
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    expect(screen.getByText(/long edge/i)).toBeInTheDocument();
  });

  test("tip switches to short-edge when layout changes to 2-up", async () => {
    const cards = makeCardRow.buildList(2);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    expect(screen.getByText(/long edge/i)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /cards per page/i }), "2");
    expect(screen.queryByText(/long edge/i)).not.toBeInTheDocument();
    expect(screen.getByText(/short edge/i)).toBeInTheDocument();
  });

  test("renders a 'Continue content on back' switch", async () => {
    const cards = makeCardRow.buildList(2);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    expect(screen.getByRole("switch", { name: /continue content on back/i })).toBeInTheDocument();
  });

  test("'Continue content on back' is disabled when 'Print backs' is off", async () => {
    const cards = makeCardRow.buildList(2);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    const continueSwitch = screen.getByRole("switch", {
      name: /continue content on back/i,
    });
    expect(continueSwitch).toBeDisabled();
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    expect(continueSwitch).not.toBeDisabled();
  });

  test("sub-toggle helptext shows the disabled-state hint only when 'Print backs' is off", async () => {
    const cards = makeCardRow.buildList(2);
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json(cards)),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    expect(
      screen.getByText(/Print page 2 of a multi-page card on the back of page 1/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Enable Print backs to use this option/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    expect(screen.queryByText(/Enable Print backs to use this option/i)).not.toBeInTheDocument();
  });

  test("places page-2 on the back of page-1's slot when both toggles are on (mixed deck)", async () => {
    const twoPager = makeCardRow.build({ payload: makeItemPayload.build({ body: "TWO" }) });
    const onePager = makeCardRow.build({ payload: makeItemPayload.build({ body: "ONE" }) });
    vi.spyOn(layoutPaginatorModule, "layoutPaginate").mockImplementation(({ bodyHtml }) =>
      bodyHtml.includes("TWO") ? ["TWO-pg1", "TWO-pg2"] : [bodyHtml],
    );
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () =>
        HttpResponse.json([twoPager, onePager]),
      ),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    await userEvent.click(screen.getByRole("switch", { name: /continue content on back/i }));
    // Front: two populated slots — twoPager pg1 (slot 0), onePager (slot 1).
    // Back imposition (4-up, cols=2): back-slot 0 = back-of front-slot-1 (onePager → icon),
    //                                 back-slot 1 = back-of front-slot-0 (twoPager pg2).
    const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
    expect(backPage).not.toBeNull();
    const slots = Array.from(backPage.children) as HTMLElement[];
    expect(slots[0]!.querySelector('[data-role="card-back-root"]')).not.toBeNull();
    expect(slots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("TWO-pg2");
  });

  test("4-page card paired flow at 4-up", async () => {
    const card = makeCardRow.build({ payload: makeItemPayload.build({ body: "X" }) });
    vi.spyOn(layoutPaginatorModule, "layoutPaginate").mockImplementation(({ bodyHtml }) =>
      bodyHtml.includes("X") ? ["pg1", "pg2", "pg3", "pg4"] : [bodyHtml],
    );
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([card])),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    await userEvent.click(screen.getByRole("switch", { name: /continue content on back/i }));
    // Front: slot 0 = pg1, slot 1 = pg3.
    // Back imposition: back-slot 0 = back-of front-slot-1 (pg4),
    //                  back-slot 1 = back-of front-slot-0 (pg2).
    const frontPage = document.querySelector('[data-page-side="front"]') as HTMLElement;
    const frontSlots = Array.from(frontPage.children) as HTMLElement[];
    expect(frontSlots[0]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg1");
    expect(frontSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg3");

    const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
    const backSlots = Array.from(backPage.children) as HTMLElement[];
    expect(backSlots[0]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg4");
    expect(backSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg2");
  });

  test("3-page card paired flow at 4-up — last back slot falls back to icon", async () => {
    const card = makeCardRow.build({ payload: makeItemPayload.build({ body: "X" }) });
    vi.spyOn(layoutPaginatorModule, "layoutPaginate").mockImplementation(({ bodyHtml }) =>
      bodyHtml.includes("X") ? ["pg1", "pg2", "pg3"] : [bodyHtml],
    );
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([card])),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.click(screen.getByRole("switch", { name: /print backs/i }));
    await userEvent.click(screen.getByRole("switch", { name: /continue content on back/i }));
    // Front: slot 0 = pg1, slot 1 = pg3.
    // Back imposition: back-slot 0 = back-of front-slot-1 (pg3 → no back → icon),
    //                  back-slot 1 = back-of front-slot-0 (pg2).
    const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
    const backSlots = Array.from(backPage.children) as HTMLElement[];
    expect(backSlots[0]!.querySelector('[data-role="card-back-root"]')).not.toBeNull();
    expect(backSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg2");
  });

  test("'Continue content on back' selected state persists across disable/re-enable", async () => {
    const card = makeCardRow.build({ payload: makeItemPayload.build({ body: "X" }) });
    vi.spyOn(layoutPaginatorModule, "layoutPaginate").mockImplementation(({ bodyHtml }) =>
      bodyHtml.includes("X") ? ["pg1", "pg2"] : [bodyHtml],
    );
    server.use(
      http.post(`${SB}/rest/v1/rpc/get_public_deck_cards`, () => HttpResponse.json([card])),
    );
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    const printBacks = screen.getByRole("switch", { name: /print backs/i });
    const continueOnBack = screen.getByRole("switch", {
      name: /continue content on back/i,
    });
    await userEvent.click(printBacks);
    await userEvent.click(continueOnBack);
    expect(continueOnBack).toBeChecked();
    await userEvent.click(printBacks); // disable backs
    expect(continueOnBack).toBeDisabled();
    expect(continueOnBack).toBeChecked(); // selection persists
    await userEvent.click(printBacks); // re-enable backs
    expect(continueOnBack).not.toBeDisabled();
    expect(continueOnBack).toBeChecked();
    // Paired flow resumes: pg2 lands on the back.
    const backPage = document.querySelector('[data-page-side="back"]') as HTMLElement;
    const backSlots = Array.from(backPage.children) as HTMLElement[];
    expect(backSlots[1]!.querySelector('[data-role="card-body"]')).toHaveTextContent("pg2");
  });
});
