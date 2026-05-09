import { describe, expect, test, vi } from "vitest";
import { expandCard } from "./expandCard";
import { itemCardFactory } from "./factories";
import type { CardMeasurer } from "./measurer";
import { renderBody } from "./renderBody";

function setRect(el: Element, top: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

function makeMeasurer(opts: {
  firstHeight: number;
  continuationHeight: number;
  setupRects: (container: HTMLElement) => void;
}): CardMeasurer {
  return {
    getBodyDimensions: () => ({
      width: 200,
      firstHeight: opts.firstHeight,
      continuationHeight: opts.continuationHeight,
    }),
    mountForPagination: (html) => {
      const c = document.createElement("div");
      c.innerHTML = html;
      document.body.appendChild(c);
      opts.setupRects(c);
      return c;
    },
  };
}

describe("expandCard", () => {
  test("single physical card with no pagination metadata when body fits", () => {
    const card = itemCardFactory.build({ body: "tiny" });
    const measurer = makeMeasurer({
      firstHeight: 1000,
      continuationHeight: 1000,
      setupRects: (c) => {
        setRect(c, 0, 30);
        const child = c.children[0];
        if (child) setRect(child, 0, 30);
      },
    });
    const result = expandCard(card, measurer);
    expect(result).toHaveLength(1);
    expect(result[0]?.card).toBe(card);
    // Trailing whitespace differs after the DOM round-trip; structural HTML matches.
    expect(result[0]?.bodyChunk.trim()).toBe(renderBody("tiny").trim());
    expect(result[0]?.pagination).toBeUndefined();
  });

  test("body chunks are HTML, not the original markdown", () => {
    const card = itemCardFactory.build({ body: "**bold**" });
    const measurer = makeMeasurer({
      firstHeight: 1000,
      continuationHeight: 1000,
      setupRects: (c) => {
        setRect(c, 0, 30);
        const child = c.children[0];
        if (child) setRect(child, 0, 30);
      },
    });
    const result = expandCard(card, measurer);
    expect(result[0]?.bodyChunk).toContain("<strong>bold</strong>");
    expect(result[0]?.bodyChunk).not.toContain("**bold**");
  });

  test("multiple physical cards with pagination metadata when body splits", () => {
    const card = itemCardFactory.build({
      body: "para one\n\npara two\n\npara three",
    });
    // firstHeight 35: only p1 (y=30) fits.
    // continuationHeight 80: in residual layouts (mocks unchanged), p2 (y=60)
    // fits but p3 (y=90) doesn't, so each iteration slices off one paragraph.
    const measurer = makeMeasurer({
      firstHeight: 35,
      continuationHeight: 80,
      setupRects: (c) => {
        setRect(c, 0, 90);
        const ps = Array.from(c.children);
        if (ps[0]) setRect(ps[0], 0, 30);
        if (ps[1]) setRect(ps[1], 30, 30);
        if (ps[2]) setRect(ps[2], 60, 30);
      },
    });
    const result = expandCard(card, measurer);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.pagination)).toEqual([
      { page: 1, total: 3 },
      { page: 2, total: 3 },
      { page: 3, total: 3 },
    ]);
    expect(result[0]?.bodyChunk).toContain("para one");
    expect(result[1]?.bodyChunk).toContain("para two");
    expect(result[2]?.bodyChunk).toContain("para three");
  });
});
