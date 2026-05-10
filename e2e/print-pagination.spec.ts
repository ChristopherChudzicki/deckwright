import { expect, test } from "@playwright/test";
import { invariant } from "../src/lib/invariant";
import { longItem, seedDeck, TEST_DECK_ID } from "./fixtures";

test("print view paginates an oversized item across multiple physical cards at 4-up", async ({
  page,
}) => {
  await seedDeck(page, [longItem]);
  await page.goto(`/deck/${TEST_DECK_ID}/print`);

  const sheet = page.locator('[data-testid="page"]');
  const paginationIndicators = sheet.locator('[data-testid="card-pagination"]');
  await expect(paginationIndicators.first()).toBeVisible();
  const total = await paginationIndicators.count();
  expect(total).toBeGreaterThan(1);

  await expect(paginationIndicators.first()).toHaveText(`Card 1 of ${total}`);
  await expect(paginationIndicators.last()).toHaveText(`Card ${total} of ${total}`);

  invariant(longItem.headerTags, "longItem fixture should define headerTags");
  invariant(longItem.footerTags, "longItem fixture should define footerTags");

  for (const tag of longItem.headerTags) {
    const occurrences = await sheet.getByText(tag, { exact: true }).count();
    expect(occurrences).toBe(1);
  }

  for (const tag of longItem.footerTags) {
    const occurrences = await sheet.getByText(tag, { exact: true }).count();
    expect(occurrences).toBe(1);
  }
});
