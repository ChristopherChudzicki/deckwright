import { expect, test } from "@playwright/test";
import { seedDeck, TEST_DECK_ID } from "./fixtures";

// --color-focus-ring (#7a3530). No unit test can assert rendered outline —
// vitest mocks CSS Modules and jsdom doesn't resolve `outline` through the
// cascade — so these guard the centralized ring in a real browser.
const RING_COLOR = "rgb(122, 53, 48)";

const card = { name: "Card", body: "Body" };

// Establish keyboard interaction modality, then focus the target. RAC only
// stamps data-focus-visible (and the browser only matches :focus-visible)
// while the last interaction was the keyboard.
async function keyboardFocus(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
) {
  await expect(target).toBeVisible();
  await page.keyboard.press("Tab");
  await target.focus();
}

test.describe("focus ring", () => {
  test("the global rule themes a keyboard-focused control", async ({ page }) => {
    await seedDeck(page, [card]);
    await page.goto(`/deck/${TEST_DECK_ID}`);

    const trigger = page.getByRole("button", { name: /Account menu/ });
    await keyboardFocus(page, trigger);

    const ring = await trigger.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        color: s.outlineColor,
        style: s.outlineStyle,
        width: s.outlineWidth,
        offset: s.outlineOffset,
      };
    });
    expect(ring).toEqual({ color: RING_COLOR, style: "solid", width: "2px", offset: "2px" });
  });

  test("an inset collection ring survives the keyboard→pointer modality flip", async ({ page }) => {
    await seedDeck(page, [card]);
    await page.goto(`/deck/${TEST_DECK_ID}`);

    // Open the account menu with the keyboard so its first item gets the ring.
    await page.getByRole("button", { name: /Account menu/ }).focus();
    await page.keyboard.press("ArrowDown");
    const signOut = page.getByRole("menuitem", { name: "Sign out" });
    await expect(signOut).toBeVisible();

    expect(await signOut.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("-2px");

    // Hover the focused item. The pointer modality plus the item's own hover
    // re-render make RAC drop data-focus-visible, while the browser keeps the
    // sticky :focus-visible. The :is() override must keep the inset ring; keyed
    // on [data-focus-visible] alone it reverted to the global +2px outset ring
    // (poking into neighbours, clipped by the list overflow).
    await signOut.hover();

    expect(await signOut.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("-2px");
    expect(await signOut.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(RING_COLOR);
  });

  test("a within:true wrapper is not double-ringed when its trigger is focused", async ({
    page,
  }) => {
    await seedDeck(page, [card]);
    await page.goto(`/deck/${TEST_DECK_ID}`);

    // The RAC Select trigger is the only listbox-popup button here (the kind
    // filter is a ToggleButtonGroup, the account menu pops a menu).
    const sortTrigger = page.locator('button[aria-haspopup="listbox"]');
    await keyboardFocus(page, sortTrigger);

    // The trigger itself shows the ring...
    expect(await sortTrigger.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");

    // ...but the RAC Select root (within:true stamps data-focus-visible on it
    // when focus is inside) must be suppressed — otherwise a second ring wraps
    // the whole control.
    const wrapperOutline = await sortTrigger.evaluate((el) => {
      let p = el.parentElement;
      while (p && !p.hasAttribute("data-focus-visible")) p = p.parentElement;
      return p ? getComputedStyle(p).outlineStyle : "NO_WRAPPER_FOUND";
    });
    expect(wrapperOutline).toBe("none");
  });
});
