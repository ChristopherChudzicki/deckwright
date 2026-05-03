import { beforeEach, describe, expect, test } from "vitest";
import { itemCardFactory } from "./factories";
import { getMeasurer } from "./measurer";

// Unit-tests the slot-population paths in measurer.ts (title text, type-line
// presence, footer toggle, body innerHTML structure) by stubbing
// scrollHeight/clientHeight at the prototype level. It verifies the measurer
// writes the right content into the right DOM slots and reads scrollHeight/
// clientHeight on the body element to decide fit.
//
// What this can't verify (because JSDOM has no real layout): real CSS produces
// the expected body height, the sentinel suffix shrinks the body budget by the
// right amount, or per-page (4 vs 2) sizes match print dimensions.
// Those invariants live in the Playwright e2e specs.

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return 100;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 200;
    },
  });
});

describe("measurer", () => {
  test("measureFirst writes title (no suffix) and the type line", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    measurer.measureFirst(card, "body chunk");

    const titleEl = document.querySelector<HTMLElement>('[data-shape="first"] [data-slot="title"]');
    const typeLineEl = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="typeLine"]',
    );

    expect(titleEl?.textContent).toBe(card.name);
    expect(typeLineEl?.textContent).toBe(card.typeLine);
  });

  test("continuation scaffold has no type line slot", () => {
    getMeasurer(4);
    const typeLineEl = document.querySelector('[data-shape="continuation"] [data-slot="typeLine"]');
    expect(typeLineEl).toBeNull();
  });

  test("footer always renders pagination sentinel during measurement", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build({ footerTags: [] });
    measurer.measureFirst(card, "body chunk");

    const footerEl = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="footer"]',
    );
    expect(footerEl?.textContent).toContain("Card 9 of 9");
  });

  test("footer renders both footerTags and pagination sentinel when tags are set", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    measurer.measureFirst(card, "body chunk");

    const footerEl = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="footer"]',
    );
    for (const tag of card.footerTags) {
      expect(footerEl?.textContent).toContain(tag);
    }
    expect(footerEl?.textContent).toContain("Card 9 of 9");
  });

  test("body chunk splits into <p> elements on blank-line paragraph breaks", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    measurer.measureFirst(card, "para one\n\npara two");

    const paragraphs = document.querySelectorAll('[data-shape="first"] [data-slot="body"] p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe("para one");
    expect(paragraphs[1]?.textContent).toBe("para two");
  });

  test("returns true when scrollHeight <= clientHeight (fits)", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    expect(measurer.measureFirst(card, "any body")).toBe(true);
  });

  test("returns false when scrollHeight > clientHeight (overflows)", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 500;
      },
    });
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    expect(measurer.measureFirst(card, "any body")).toBe(false);
  });

  test("getMeasurer returns the same instance across calls (idempotent)", () => {
    const a = getMeasurer(4);
    const b = getMeasurer(4);
    expect(a).toBe(b);
  });
});
