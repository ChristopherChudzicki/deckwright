import { expect, test } from "@playwright/test";
import { longItem, seedDeck, TEST_DECK_ID } from "./fixtures";

test("editor preview shows counts label and paginator for an oversized body", async ({ page }) => {
  await seedDeck(page, [longItem]);
  await page.goto(`/deck/${TEST_DECK_ID}/edit/${longItem.id}`);

  const counts = page.getByTestId("preview-counts");
  await expect(counts).toContainText(/cards \(4 per page\) · /);

  const paginator = page.getByTestId("preview-paginator");
  await expect(paginator).toBeVisible();

  const indicator = page.getByTestId("card-pagination").first();
  await expect(indicator).toHaveText(/^Card 1 of \d+$/);

  const cardBody = page.locator('[data-role="card-body"]:visible');
  const page1Body = await cardBody.innerText();

  await paginator.getByRole("button", { name: /next preview page/i }).click();
  await expect(indicator).toHaveText(/^Card 2 of \d+$/);

  const page2Body = await cardBody.innerText();
  expect(page2Body).not.toBe(page1Body);
});
