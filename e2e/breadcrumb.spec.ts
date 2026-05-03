import { expect, test } from "@playwright/test";
import { seedDeck, TEST_DECK_ID } from "./fixtures";

const card = {
  id: "00000000-0000-4000-8000-200000000001",
  name: "Sword of Testing",
  body: "A simple test weapon.",
};

test.describe("deck breadcrumb", () => {
  test("shows deck name on the deck route, with Decks linking home", async ({ page }) => {
    await seedDeck(page, [card]);
    await page.goto(`/deck/${TEST_DECK_ID}`);

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/");
    await expect(breadcrumb.getByText("E2E Test Deck")).toHaveAttribute("aria-current", "page");
  });

  test("shows deck name as a back-link on the editor route", async ({ page }) => {
    await seedDeck(page, [card]);
    await page.goto(`/deck/${TEST_DECK_ID}/edit/${card.id}`);

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    const deckLink = breadcrumb.getByRole("link", { name: "E2E Test Deck" });
    await expect(deckLink).toBeVisible();

    await deckLink.click();
    await expect(page).toHaveURL(`/deck/${TEST_DECK_ID}`);
  });

  test("shows deck name as a back-link on the print route", async ({ page }) => {
    await seedDeck(page, [card]);
    await page.goto(`/deck/${TEST_DECK_ID}/print`);

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "E2E Test Deck" })).toBeVisible();
  });
});
