import { describe, expect, test, vi } from "vitest";
import { invariant } from "../lib/invariant";
import { layoutPaginate } from "./layoutPaginator";
import * as sliceAtModule from "./sliceAt";

function setRect(el: Element | undefined, top: number, height: number) {
  if (!el) throw new Error("setRect: missing element (test setup bug)");
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

  test("whitespace-only body returns one chunk equal to input (does not drop the card)", () => {
    const result = layoutPaginate({
      bodyHtml: "   \n  ",
      width: 100,
      firstHeight: 50,
      continuationHeight: 50,
      // Whitespace HTML produces only text nodes — no element children. The
      // mount factory still gets called; mocked rects won't even be consulted.
      mount: makeMount((c) => {
        setRect(c, 0, 0);
      }),
    });
    expect(result).toEqual(["   \n  "]);
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
    // 4 single-line divs at heights 0..30, 30..60, 60..90, 90..120.
    // firstHeight=35 (only div1 at y=30 fits in first card).
    // continuationHeight=200 (residual divs 2..4 fit on the second card).
    // If the paginator wrongly used firstHeight for chunks 2+, we'd see
    // 4 chunks instead of 2.
    const result = layoutPaginate({
      bodyHtml: "<div>1</div><div>2</div><div>3</div><div>4</div>",
      width: 100,
      firstHeight: 35,
      continuationHeight: 200,
      mount: makeMount((c) => {
        setRect(c, 0, 120);
        setRect(c.children[0], 0, 30);
        setRect(c.children[1], 30, 30);
        setRect(c.children[2], 60, 30);
        setRect(c.children[3], 90, 30);
      }),
    });
    expect(result).toEqual(["<div>1</div>", "<div>2</div><div>3</div><div>4</div>"]);
  });

  test("picks a candidate exactly at the budget (inclusive boundary)", () => {
    // Two divs with bottoms 30 and 60. With firstHeight=60 the second
    // candidate matches the budget exactly. A wrong < (strict) comparison
    // would split unnecessarily and produce two chunks instead of one.
    const result = layoutPaginate({
      bodyHtml: "<div>a</div><div>b</div>",
      width: 100,
      firstHeight: 60,
      continuationHeight: 60,
      mount: makeMount((c) => {
        setRect(c, 0, 60);
        setRect(c.children[0], 0, 30);
        setRect(c.children[1], 30, 30);
      }),
    });
    expect(result).toEqual(["<div>a</div><div>b</div>"]);
  });

  test("breaks out and logs on MAX_CHUNKS instead of throwing through render", () => {
    // Simulate a non-progressing slice: pretend to extract a chunk while
    // leaving the container untouched. The loop should hit the safety valve
    // and bail with what it has, not throw.
    const sliceSpy = vi.spyOn(sliceAtModule, "sliceFirstChunk").mockImplementation(() => "x");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = layoutPaginate({
      bodyHtml: "<div>1</div><div>2</div>",
      width: 100,
      firstHeight: 40,
      continuationHeight: 40,
      mount: makeMount((c) => {
        setRect(c, 0, 60);
        setRect(c.children[0], 0, 30);
        setRect(c.children[1], 30, 30);
      }),
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(1024);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("exceeded MAX_CHUNKS"));

    sliceSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("clears the mounted container after pagination so the measurer can reuse it", () => {
    let mounted: HTMLElement | null = null;
    layoutPaginate({
      bodyHtml: "<div>x</div>",
      width: 100,
      firstHeight: 100,
      continuationHeight: 100,
      mount: (html) => {
        const c = document.createElement("div");
        c.innerHTML = html;
        document.body.appendChild(c);
        setRect(c, 0, 30);
        setRect(c.children[0], 0, 30);
        mounted = c;
        return c;
      },
    });
    invariant(mounted, "mount callback should have populated `mounted`");
    expect(mounted.children.length).toBe(0);
    mounted.remove();
  });
});
