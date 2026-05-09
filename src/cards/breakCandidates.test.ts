import { describe, expect, test, vi } from "vitest";
import { collectBreakCandidates, type LineBoxProvider } from "./breakCandidates";

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

describe("collectBreakCandidates", () => {
  test("emits a candidate after each top-level block sibling", () => {
    const root = document.createElement("div");
    root.innerHTML = "<div>one</div><div>two</div>";
    document.body.appendChild(root);
    setRect(root, 0, 100);
    setRect(root.children[0], 0, 40);
    setRect(root.children[1], 50, 50);

    const cs = collectBreakCandidates(root);
    expect(cs.map((c) => c.y)).toEqual([40, 100]);
    expect(cs[0]?.splitAt).toEqual({
      kind: "between-children",
      parent: root,
      childIndex: 1,
    });
    expect(cs[1]?.splitAt).toEqual({
      kind: "between-children",
      parent: root,
      childIndex: 2,
    });
    root.remove();
  });

  test("treats <pre> as atomic (no candidates inside)", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>before</p><pre>code\nblock</pre><p>after</p>";
    document.body.appendChild(root);
    setRect(root, 0, 200);
    setRect(root.children[0], 0, 30);
    setRect(root.children[1], 40, 80);
    setRect(root.children[2], 130, 30);

    const cs = collectBreakCandidates(root);
    // Three top-level candidates only — none from inside <pre>.
    expect(cs.map((c) => c.y)).toEqual([30, 120, 160]);
    root.remove();
  });

  test("emits a candidate after each table row, plus after the whole table", () => {
    const root = document.createElement("div");
    root.innerHTML =
      "<table><thead><tr><th>k</th><th>v</th></tr></thead><tbody>" +
      "<tr><td>a</td><td>1</td></tr>" +
      "<tr><td>b</td><td>2</td></tr>" +
      "<tr><td>c</td><td>3</td></tr>" +
      "</tbody></table>";
    document.body.appendChild(root);

    const table = root.children[0] as HTMLElement;
    const tbody = table.querySelector("tbody") as HTMLElement;
    const rows = Array.from(tbody.querySelectorAll("tr")) as HTMLElement[];

    setRect(root, 0, 200);
    setRect(table, 0, 200);
    setRect(rows[0] as HTMLElement, 30, 40); // bottom = 70
    setRect(rows[1] as HTMLElement, 70, 40); // bottom = 110
    setRect(rows[2] as HTMLElement, 110, 40); // bottom = 150

    const cs = collectBreakCandidates(root);
    // Candidates: between r1/r2 (70), between r2/r3 (110), after table (200).
    // No candidate after r3 *inside* the table (that's the same as "after the
    // whole table" for slicing purposes).
    expect(cs.map((c) => c.y)).toEqual([70, 110, 200]);
    expect(cs[0]?.splitAt).toMatchObject({ parent: tbody, childIndex: 1 });
    expect(cs[1]?.splitAt).toMatchObject({ parent: tbody, childIndex: 2 });
    expect(cs[2]?.splitAt).toMatchObject({ parent: root, childIndex: 1 });
    root.remove();
  });

  test("emits a candidate after each <ul>/<ol> item", () => {
    const root = document.createElement("div");
    root.innerHTML = "<ul><li>a</li><li>b</li><li>c</li></ul>";
    document.body.appendChild(root);

    const ul = root.children[0] as HTMLElement;
    const items = Array.from(ul.children) as HTMLElement[];
    setRect(root, 0, 90);
    setRect(ul, 0, 90);
    setRect(items[0] as HTMLElement, 0, 30);
    setRect(items[1] as HTMLElement, 30, 30);
    setRect(items[2] as HTMLElement, 60, 30);

    const cs = collectBreakCandidates(root);
    // Between li1/li2, between li2/li3, after ul.
    expect(cs.map((c) => c.y)).toEqual([30, 60, 90]);
    expect(cs[0]?.splitAt).toMatchObject({ parent: ul, childIndex: 1 });
    expect(cs[1]?.splitAt).toMatchObject({ parent: ul, childIndex: 2 });
    root.remove();
  });

  test("a single-pair <dl> emits only the after-dl candidate (no internal split)", () => {
    const root = document.createElement("div");
    root.innerHTML = "<dl><dt>k</dt><dd>v</dd></dl>";
    document.body.appendChild(root);

    const dl = root.children[0] as HTMLElement;
    const kids = Array.from(dl.children) as HTMLElement[];
    setRect(root, 0, 40);
    setRect(dl, 0, 40);
    setRect(kids[0] as HTMLElement, 0, 20);
    setRect(kids[1] as HTMLElement, 20, 20);

    const cs = collectBreakCandidates(root);
    expect(cs.map((c) => c.y)).toEqual([40]);
    expect(cs[0]?.splitAt).toMatchObject({ parent: root, childIndex: 1 });
    root.remove();
  });

  test("nested splittable containers are not recursed into (sibling boundaries only)", () => {
    // The walker only inspects top-level children. A <ul> nested inside an
    // <li> contributes no candidates of its own — the outer <ul>'s between-li
    // boundaries are the only available split points.
    const root = document.createElement("div");
    root.innerHTML =
      "<ul><li>outer1<ul><li>inner-a</li><li>inner-b</li></ul></li><li>outer2</li></ul>";
    document.body.appendChild(root);

    const outerUl = root.children[0] as HTMLElement;
    const outerItems = Array.from(outerUl.children) as HTMLElement[];
    setRect(root, 0, 100);
    setRect(outerUl, 0, 100);
    setRect(outerItems[0] as HTMLElement, 0, 60);
    setRect(outerItems[1] as HTMLElement, 60, 40);

    const cs = collectBreakCandidates(root);
    // Two candidates: between outer1 and outer2 (y=60), after the outer ul
    // (y=100). No candidates referencing the inner ul.
    expect(cs.map((c) => c.y)).toEqual([60, 100]);
    expect(cs[0]?.splitAt).toMatchObject({ parent: outerUl, childIndex: 1 });
    expect(cs[1]?.splitAt).toMatchObject({ parent: root, childIndex: 1 });
    root.remove();
  });

  test("inline-flow blocks emit one line-box-provider call per text node descendant", () => {
    // <p>before <strong>middle</strong> after</p> contains three text nodes;
    // the line-box provider is called once per node. Each call's emitted
    // candidates use *that* node's textNode reference.
    const root = document.createElement("div");
    root.innerHTML = "<p>before <strong>middle</strong> after</p>";
    document.body.appendChild(root);

    const p = root.children[0] as HTMLElement;
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let n = walker.nextNode() as Text | null;
    while (n) {
      textNodes.push(n);
      n = walker.nextNode() as Text | null;
    }
    expect(textNodes).toHaveLength(3);

    setRect(root, 0, 40);
    setRect(p, 0, 40);

    const calls: Text[] = [];
    const lineBoxes: LineBoxProvider = (node) => {
      calls.push(node);
      // Each node emits exactly one in-block line-box candidate at y=20.
      return [{ bottom: 20, charOffset: Math.max(1, node.data.length - 1) }];
    };

    const cs = collectBreakCandidates(root, { lineBoxes });
    expect(calls).toEqual(textNodes);
    // Three line-box candidates (one per text node, all at y=20) plus the
    // after-block candidate at y=40.
    expect(cs.filter((c) => c.splitAt.kind === "between-line-boxes")).toHaveLength(3);
    expect(cs.filter((c) => c.splitAt.kind === "between-children")).toHaveLength(1);
    // Each line-box candidate references its own text node.
    const lineBoxCandidates = cs.filter((c) => c.splitAt.kind === "between-line-boxes");
    const referencedNodes = lineBoxCandidates.map(
      (c) => (c.splitAt as { textNode: Text }).textNode,
    );
    expect(new Set(referencedNodes).size).toBe(3);
    root.remove();
  });

  test("only splits a <dl> between dt/dd pairs (after each dd)", () => {
    const root = document.createElement("div");
    root.innerHTML = "<dl><dt>k1</dt><dd>v1</dd><dt>k2</dt><dd>v2</dd></dl>";
    document.body.appendChild(root);

    const dl = root.children[0] as HTMLElement;
    const kids = Array.from(dl.children) as HTMLElement[];
    setRect(root, 0, 80);
    setRect(dl, 0, 80);
    setRect(kids[0] as HTMLElement, 0, 20); // dt1
    setRect(kids[1] as HTMLElement, 20, 20); // dd1 — bottom 40 (split candidate before next dt)
    setRect(kids[2] as HTMLElement, 40, 20); // dt2
    setRect(kids[3] as HTMLElement, 60, 20); // dd2

    const cs = collectBreakCandidates(root);
    // Only a candidate after dd1 (between pair 1 and pair 2), and after the dl.
    // No candidate between dt1/dd1 — that would orphan the dt.
    expect(cs.map((c) => c.y)).toEqual([40, 80]);
    expect(cs[0]?.splitAt).toMatchObject({ parent: dl, childIndex: 2 });
    root.remove();
  });

  test("emits one candidate per line box for inline-flow blocks via the line-box provider", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>line one line two line three</p>";
    document.body.appendChild(root);

    const p = root.children[0] as HTMLElement;
    const textNode = p.firstChild as Text;

    setRect(root, 0, 60);
    setRect(p, 0, 60);

    const lineBoxes: LineBoxProvider = (node) => {
      if (node === textNode) {
        return [
          { bottom: 20, charOffset: 9 }, // "line one "
          { bottom: 40, charOffset: 18 }, // "line one line two "
          { bottom: 60, charOffset: 28 }, // full text
        ];
      }
      return [];
    };

    const cs = collectBreakCandidates(root, { lineBoxes });
    // Expect line-box candidates at 20 and 40 (the in-block lines), plus the
    // final after-block candidate at 60. The last line-box bottom typically
    // coincides with the block bottom, so we don't double-emit at 60.
    expect(cs.map((c) => c.y)).toEqual([20, 40, 60]);
    expect(cs[0]?.splitAt).toEqual({
      kind: "between-line-boxes",
      textNode,
      charOffset: 9,
    });
    expect(cs[1]?.splitAt).toEqual({
      kind: "between-line-boxes",
      textNode,
      charOffset: 18,
    });
    expect(cs[2]?.splitAt).toMatchObject({
      kind: "between-children",
      parent: root,
      childIndex: 1,
    });
    root.remove();
  });

  test("returns candidates sorted by y", () => {
    const root = document.createElement("div");
    root.innerHTML = "<div>a</div><div>b</div>";
    document.body.appendChild(root);
    setRect(root, 0, 80);
    setRect(root.children[0], 0, 40);
    setRect(root.children[1], 40, 40);

    const cs = collectBreakCandidates(root);
    const ys = cs.map((c) => c.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    root.remove();
  });
});
