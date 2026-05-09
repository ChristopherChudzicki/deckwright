import { beforeEach, describe, expect, test } from "vitest";
import { itemCardFactory } from "./factories";
import { getMeasurer } from "./measurer";

// Unit-tests measurer slot population (title, headerTags, footer sentinel) and
// the dimension/mount surface used by the layout paginator. JSDOM does not
// implement real CSS layout, so clientWidth/clientHeight are stubbed at the
// prototype level. Real-layout invariants (4-up vs 2-up sizes match print
// dimensions, sentinel reserves the right footer space) live in Playwright.

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 200;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 300;
    },
  });
});

describe("measurer", () => {
  test("getBodyDimensions populates the title slot for accurate header measurement", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    measurer.getBodyDimensions(card);
    const titleEl = document.querySelector<HTMLElement>('[data-shape="first"] [data-slot="title"]');
    expect(titleEl?.textContent).toBe(card.name);
  });

  test("getBodyDimensions populates the headerTags slot on the first scaffold", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    measurer.getBodyDimensions(card);
    const headerTagsEl = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="headerTags"]',
    );
    for (const tag of card.headerTags) {
      expect(headerTagsEl?.textContent).toContain(tag);
    }
  });

  test("continuation scaffold has no headerTags slot", () => {
    getMeasurer(4);
    const headerTagsEl = document.querySelector(
      '[data-shape="continuation"] [data-slot="headerTags"]',
    );
    expect(headerTagsEl).toBeNull();
  });

  test("getBodyDimensions writes the pagination sentinel into both footers", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build({ footerTags: [] });
    measurer.getBodyDimensions(card);
    const firstFooter = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="footer"]',
    );
    const contFooter = document.querySelector<HTMLElement>(
      '[data-shape="continuation"] [data-slot="footer"]',
    );
    expect(firstFooter?.textContent).toContain("Card 9 of 9");
    expect(contFooter?.textContent).toContain("Card 9 of 9");
  });

  test("getBodyDimensions includes footer tags on the first scaffold when set", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    measurer.getBodyDimensions(card);
    const firstFooter = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="footer"]',
    );
    for (const tag of card.footerTags) {
      expect(firstFooter?.textContent).toContain(tag);
    }
  });

  test("getBodyDimensions returns positive width and heights", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    const dims = measurer.getBodyDimensions(card);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.firstHeight).toBeGreaterThan(0);
    expect(dims.continuationHeight).toBeGreaterThan(0);
  });

  test("mountForPagination returns an HTMLElement containing the given HTML", () => {
    const measurer = getMeasurer(4);
    const el = measurer.mountForPagination("<p>x</p>", 200);
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.querySelector("p")?.textContent).toBe("x");
    el.replaceChildren();
  });

  test("getMeasurer returns the same instance across calls (idempotent)", () => {
    const a = getMeasurer(4);
    const b = getMeasurer(4);
    expect(a).toBe(b);
  });
});
