import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import * as paginateModule from "../cards/paginate";
import { makeCardRow } from "../test/factories";
import { SB_URL as SB, server } from "../test/msw";
import { PrintView } from "./PrintView";

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("<PrintView>", () => {
  test("renders one page at 4-up for up to 4 cards", async () => {
    const cards = makeCardRow.buildList(3);
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
  });

  test("renders two pages when there are 5 cards at 4-up", async () => {
    const cards = makeCardRow.buildList(5);
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(2));
  });

  test("switches to 2-up and repaginates accordingly", async () => {
    const cards = makeCardRow.buildList(3);
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json(cards)));
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => expect(screen.getAllByTestId("page")).toHaveLength(1));
    await userEvent.selectOptions(screen.getByLabelText(/cards per page/i), "2");
    expect(screen.getAllByTestId("page")).toHaveLength(2);
  });

  test("renders multiple physical cards for an oversized item at 4-up", async () => {
    const card = makeCardRow.build();
    vi.spyOn(paginateModule, "paginateBody").mockImplementation(({ body }) =>
      body === "" ? [""] : ["chunk-a", "chunk-b", "chunk-c"],
    );
    server.use(http.get(`${SB}/rest/v1/cards`, () => HttpResponse.json([card])));
    render(wrap(<PrintView deckId="d1" />));
    await waitFor(() => {
      const indicators = screen.getAllByTestId("card-pagination");
      expect(indicators).toHaveLength(3);
      expect(indicators[0]).toHaveTextContent("Card 1 of 3");
      expect(indicators[2]).toHaveTextContent("Card 3 of 3");
    });
  });
});
