import { describe, expect, test, vi } from "vitest";
import { layoutPaginate } from "./layoutPaginator";

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

// A `mount` factory that builds the container, runs `setupRects` on it, and
// returns it. The test owns rect-mocking so each scenario can wire up its own
// layout.
function makeMount(setupRects: (container: HTMLElement) => void) {
  return (html: string) => {
    const c = document.createElement("div");
    c.innerHTML = html;
    document.body.appendChild(c);
    setupRects(c);
    return c;
  };
}

describe("layoutPaginate", () => {
  test("empty body returns a single empty chunk", () => {
    const result = layoutPaginate({
      bodyHtml: "",
      width: 100,
      firstHeight: 50,
      continuationHeight: 50,
      mount: makeMount(() => {}),
    });
    expect(result).toEqual([""]);
  });

  test("returns one chunk equal to input when everything fits", () => {
    const html = "<div>a</div><div>b</div>";
    const result = layoutPaginate({
      bodyHtml: html,
      width: 100,
      firstHeight: 100,
      continuationHeight: 100,
      mount: makeMount((c) => {
        setRect(c, 0, 60);
        setRect(c.children[0], 0, 30);
        setRect(c.children[1], 30, 30);
      }),
    });
    expect(result).toEqual([html]);
  });

  test("splits between top-level siblings when budget cuts off after first", () => {
    const result = layoutPaginate({
      bodyHtml: "<div>1</div><div>2</div>",
      width: 100,
      firstHeight: 40,
      continuationHeight: 80,
      mount: makeMount((c) => {
        setRect(c, 0, 60);
        setRect(c.children[0], 0, 30); // bottom 30 — fits in 40
        setRect(c.children[1], 30, 30); // bottom 60 — overflows 40
      }),
    });
    expect(result).toEqual(["<div>1</div>", "<div>2</div>"]);
  });

  test("accepts overflow when no candidate fits the first card", () => {
    const result = layoutPaginate({
      bodyHtml: "<pre>oversize</pre>",
      width: 100,
      firstHeight: 50,
      continuationHeight: 50,
      mount: makeMount((c) => {
        setRect(c, 0, 200);
        setRect(c.children[0], 0, 200); // way past budget
      }),
    });
    expect(result).toEqual(["<pre>oversize</pre>"]);
  });

  test("uses continuationHeight (not firstHeight) for chunks 2+", () => {
    // 3 single-line divs at heights 0..30, 30..60, 60..90.
    // firstHeight=40 (first chunk: just div 1 at y=30 fits, div 2 at y=60 doesn't).
    // continuationHeight=70 (second chunk: residual is div 2 + div 3, y values
    // unchanged since mocks don't shift on slice; div 2 y=60 still <= 70, div 3
    // y=90 > 70 → take div 2 only). Third chunk: div 3 alone (y=90, accept).
    const result = layoutPaginate({
      bodyHtml: "<div>1</div><div>2</div><div>3</div>",
      width: 100,
      firstHeight: 40,
      continuationHeight: 70,
      mount: makeMount((c) => {
        setRect(c, 0, 90);
        setRect(c.children[0], 0, 30);
        setRect(c.children[1], 30, 30);
        setRect(c.children[2], 60, 30);
      }),
    });
    expect(result).toEqual(["<div>1</div>", "<div>2</div>", "<div>3</div>"]);
  });

  test("removes the mounted container after pagination", () => {
    const before = document.body.children.length;
    layoutPaginate({
      bodyHtml: "<div>x</div>",
      width: 100,
      firstHeight: 100,
      continuationHeight: 100,
      mount: makeMount((c) => {
        setRect(c, 0, 30);
        setRect(c.children[0], 0, 30);
      }),
    });
    expect(document.body.children.length).toBe(before);
  });
});
