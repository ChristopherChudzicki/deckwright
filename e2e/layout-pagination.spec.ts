import { expect, test } from "@playwright/test";
import { longItem, seedDeck, TEST_DECK_ID, tableItem } from "./fixtures";

test("a long paragraph splits between line boxes (no mid-word break)", async ({ page }) => {
  await seedDeck(page, [longItem]);
  await page.goto(`/deck/${TEST_DECK_ID}/print`);

  const indicators = page.locator('[data-testid="card-pagination"]');
  await expect(indicators.first()).toBeVisible();
  const total = await indicators.count();
  expect(total).toBeGreaterThan(1);

  // Concatenate card bodies in DOM order and assert they reconstruct the
  // original body (modulo whitespace normalization). This is strictly
  // stronger than per-marker counting: it catches dropped/duplicated content
  // AND inverted chunk ordering.
  const bodies = page.locator('[data-role="card-body"]');
  const parts = await bodies.allInnerTexts();
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  const original = longItem.body.replace(/\s+/g, " ").trim();
  expect(joined).toBe(original);
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

test("editor preview re-paginates after body edits, via the debounce", async ({ page }) => {
  await seedDeck(page, [longItem]);
  await page.goto(`/deck/${TEST_DECK_ID}/edit/${longItem.id}`);

  const counts = page.getByTestId("preview-counts");
  // Wait for the multi-card layout to settle before editing so the repaint
  // we assert below isn't actually the initial render finishing.
  await expect(counts).toContainText(/^\d+ cards \(4 per page\)/);
  await expect(counts).toHaveAttribute("data-pending", "false");

  const bodyField = page.getByRole("textbox", { name: /^Body/ });
  await bodyField.fill("Tiny body.");

  // Edit enters the debounce window before the repaint settles.
  await expect(counts).toHaveAttribute("data-pending", "true");
  // Debounced repaint eventually settles to the new pagination.
  await expect(counts).toHaveText("1 card");
  await expect(counts).toHaveAttribute("data-pending", "false");
});
