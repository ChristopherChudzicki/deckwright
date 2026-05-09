import { expect, test } from "@playwright/test";
import { longItem, seedDeck, TEST_DECK_ID, tableItem } from "./fixtures";

test("a long paragraph splits between line boxes (no mid-word break)", async ({ page }) => {
  await seedDeck(page, [longItem]);
  await page.goto(`/deck/${TEST_DECK_ID}/print`);

  const indicators = page.locator('[data-testid="card-pagination"]');
  await expect(indicators.first()).toBeVisible();
  const total = await indicators.count();
  expect(total).toBeGreaterThan(1);

  // Concatenate all visible card body text. Lines join with a space (since
  // each chunk is a partial paragraph and Playwright reads visual text).
  const bodies = page.locator('[data-role="card-body"]');
  const parts = await bodies.allInnerTexts();
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  const original = longItem.body.replace(/\s+/g, " ").trim();

  // Every (n) sentence marker should appear exactly once across chunks — no
  // marker is dropped or duplicated by mid-word splits.
  const markers = original.match(/\(\d+\)/g) ?? [];
  expect(markers.length).toBeGreaterThan(20);
  for (const marker of markers) {
    const occurrences = joined.split(marker).length - 1;
    expect(occurrences, `marker ${marker} should appear once in concatenated chunks`).toBe(1);
  }
});

test("a multi-row table splits at row boundaries with <thead> repeated on each card", async ({
  page,
}) => {
  await seedDeck(page, [tableItem]);
  await page.goto(`/deck/${TEST_DECK_ID}/print`);

  const cards = page.locator('[data-role="card-root"]');
  await expect(cards.first()).toBeVisible();
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(1);

  // Header columns must appear on every card that contains the table — i.e.,
  // every card whose body has a <table>. The header cell text "Alpha" is a
  // unique sentinel from the fixture.
  for (let i = 0; i < cardCount; i++) {
    const card = cards.nth(i);
    const hasTable = (await card.locator("table").count()) > 0;
    if (!hasTable) continue;
    await expect(card.locator("th", { hasText: "Alpha" })).toBeVisible();
    await expect(card.locator("th", { hasText: "Beta" })).toBeVisible();
    await expect(card.locator("th", { hasText: "Gamma" })).toBeVisible();
  }

  // Every data row label (R01..R24) must appear exactly once across cards.
  for (let r = 1; r <= 24; r++) {
    const label = `R${r.toString().padStart(2, "0")}`;
    const occurrences = await page.getByText(label, { exact: true }).count();
    expect(occurrences, `row ${label} appears once across all cards`).toBe(1);
  }
});

test("editor preview re-paginates after the debounce window on body edits", async ({ page }) => {
  await seedDeck(page, [longItem]);
  await page.goto(`/deck/${TEST_DECK_ID}/edit/${longItem.id}`);

  const counts = page.getByTestId("preview-counts");
  // Wait for the multi-card layout to settle before reading initial state.
  await expect(counts).toContainText(/^\d+ cards \(4 per page\)/);
  const initialCounts = await counts.innerText();

  // Replace the body with something tiny — counts should drop to a single
  // card, but not before the debounce window elapses. The body field is the
  // (single) <textarea> on the editor route.
  const bodyField = page.locator("textarea");
  await bodyField.fill("Tiny body.");

  // Within 100 ms of the edit, counts should not have repainted.
  await page.waitForTimeout(100);
  expect(await counts.innerText()).toBe(initialCounts);

  // After the debounce window (300 ms), counts updates to "1 card".
  await expect(counts).toHaveText("1 card", { timeout: 2000 });
});
