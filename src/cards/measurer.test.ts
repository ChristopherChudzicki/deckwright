import { beforeEach, describe, expect, test } from "vitest";
import { itemCardFactory } from "./factories";
import { getMeasurer } from "./measurer";

// Unit-tests measurer slot population (title, headerTags, footer sentinel) and
// the dimension/mount surface used by the layout paginator. JSDOM does not
// implement real CSS layout, so clientWidth/clientHeight are stubbed at the
// prototype level. Real-layout invariants (4-up vs 2-up sizes match print
// dimensions, sentinel reserves the right footer space) live in Playwright.

// Per-element stub: each element gets its own clientWidth/clientHeight via a
// WeakMap. A wrong-slot bug (e.g. measurer reads from header instead of body)
// fails the test instead of silently passing.
const widthByElement = new WeakMap<Element, number>();
const heightByElement = new WeakMap<Element, number>();

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return widthByElement.get(this as Element) ?? 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return heightByElement.get(this as Element) ?? 0;
    },
  });
});

function stubBodySlots(opts: {
  width: number;
  firstBodyHeight: number;
  continuationBodyHeight: number;
}) {
  const firstBody = document.querySelector<HTMLElement>('[data-shape="first"] [data-slot="body"]');
  const contBody = document.querySelector<HTMLElement>(
    '[data-shape="continuation"] [data-slot="body"]',
  );
  if (!firstBody || !contBody) throw new Error("scaffold not yet built");
  widthByElement.set(firstBody, opts.width);
  heightByElement.set(firstBody, opts.firstBodyHeight);
  heightByElement.set(contBody, opts.continuationBodyHeight);
}

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

  test("getBodyDimensions reads from the body slots, not other scaffold elements", () => {
    const measurer = getMeasurer(4);
    // Build the scaffold (idempotent), then stub the body slots with known
    // distinct values. If getBodyDimensions accidentally reads clientHeight
    // from the header or footer, those return 0 from the WeakMap default and
    // the assertion below fails.
    stubBodySlots({ width: 256, firstBodyHeight: 480, continuationBodyHeight: 540 });
    const card = itemCardFactory.build();
    const dims = measurer.getBodyDimensions(card);
    expect(dims).toEqual({ width: 256, firstHeight: 480, continuationHeight: 540 });
  });

  test("4-up and 2-up measurers are distinct instances", () => {
    // Each cardsPerPage builds its own scaffold; reusing one for both layouts
    // would silently produce wrong dimensions for the other.
    const a = getMeasurer(4);
    const b = getMeasurer(2);
    expect(a).not.toBe(b);
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
