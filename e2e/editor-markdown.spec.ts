import { expect, test } from "@playwright/test";
import { seedDeck, TEST_DECK_ID } from "./fixtures";

const cardId = "00000000-0000-4000-8000-200000000001";

test.beforeEach(async ({ page }) => {
  await seedDeck(page, [
    {
      id: cardId,
      name: "Markdown Test Item",
      body: "",
      headerTags: ["Wondrous item"],
      footerTags: [],
    },
  ]);
  await page.goto(`/deck/${TEST_DECK_ID}/edit/${cardId}`);
});

test("toolbar Bold wraps and unwraps the selection", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("hello world");

  // Select "hello".
  await body.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(0, "hello".length);
  });

  await page.getByRole("button", { name: /bold/i }).click();
  await expect(body).toHaveValue("**hello** world");

  // Re-select "hello" (now inside the **…** wrapper, offsets shifted by 2).
  await body.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(2, 2 + "hello".length);
  });
  await page.getByRole("button", { name: /bold/i }).click();
  await expect(body).toHaveValue("hello world");
});

test("Cmd/Meta+B wraps the selection in bold", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("abc");
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 3));

  await body.focus();
  await page.keyboard.press("Meta+b");

  await expect(body).toHaveValue("**abc**");
});

test("Cmd/Meta+I wraps the selection in italics", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("abc");
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 3));

  await body.focus();
  await page.keyboard.press("Meta+i");

  // The library uses `_` for italics by default.
  await expect(body).toHaveValue("_abc_");
});

test("Bullet list toggles a `- ` prefix on each selected line", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("one\ntwo\nthree");
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, el.value.length));

  await page.getByRole("button", { name: /bullet list/i }).click();
  await expect(body).toHaveValue("- one\n- two\n- three");

  // Re-select the whole value (its length grew by 6) and toggle off.
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, el.value.length));
  await page.getByRole("button", { name: /bullet list/i }).click();
  await expect(body).toHaveValue("one\ntwo\nthree");
});

test("Numbered list toggles `1. `/`2. `/`3. ` prefixes on selected lines", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("one\ntwo\nthree");
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, el.value.length));

  await page.getByRole("button", { name: /numbered list/i }).click();
  await expect(body).toHaveValue("1. one\n2. two\n3. three");
});

test("undo collapses a toolbar action into a single Cmd+Z", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("hello world");
  await body.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange("hello ".length, "hello ".length + "world".length),
  );

  await page.getByRole("button", { name: /bold/i }).click();
  await expect(body).toHaveValue("hello **world**");

  await body.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(body).toHaveValue("hello world");

  // One more undo begins peeling the typed text.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(body).not.toHaveValue("hello world");
});

test("clicking a toolbar button keeps focus on the textarea", async ({ page }) => {
  const body = page.getByLabel(/body/i);
  await body.fill("abc");
  await body.focus();

  await page.getByRole("button", { name: /bold/i }).click();

  await expect(body).toBeFocused();
});
