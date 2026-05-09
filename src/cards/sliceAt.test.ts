import { describe, expect, test } from "vitest";
import { sliceFirstChunk } from "./sliceAt";

function makeContainer(html: string): HTMLElement {
  const c = document.createElement("div");
  c.innerHTML = html;
  document.body.appendChild(c);
  return c;
}

describe("sliceFirstChunk", () => {
  test("cut between top-level siblings: returns prefix HTML, container keeps the rest", () => {
    const c = makeContainer("<p>one</p><p>two</p><p>three</p>");
    const html = sliceFirstChunk(c, {
      kind: "between-children",
      parent: c,
      childIndex: 2,
    });
    expect(html).toBe("<p>one</p><p>two</p>");
    expect(c.innerHTML).toBe("<p>three</p>");
    c.remove();
  });

  test("cut between list items: each half is a valid <ul>", () => {
    const c = makeContainer("<ul><li>a</li><li>b</li><li>c</li></ul>");
    const ul = c.firstElementChild as HTMLElement;
    const html = sliceFirstChunk(c, {
      kind: "between-children",
      parent: ul,
      childIndex: 2,
    });
    expect(html).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(c.innerHTML).toBe("<ul><li>c</li></ul>");
    c.remove();
  });

  test("cut between table rows: thead is preserved on both halves", () => {
    const c = makeContainer(
      "<table><thead><tr><th>k</th><th>v</th></tr></thead><tbody>" +
        "<tr><td>a</td><td>1</td></tr>" +
        "<tr><td>b</td><td>2</td></tr>" +
        "<tr><td>c</td><td>3</td></tr>" +
        "</tbody></table>",
    );
    const tbody = c.querySelector("tbody") as HTMLElement;
    const html = sliceFirstChunk(c, {
      kind: "between-children",
      parent: tbody,
      childIndex: 2,
    });
    // Prefix: thead + first two rows.
    expect(html).toBe(
      "<table><thead><tr><th>k</th><th>v</th></tr></thead><tbody>" +
        "<tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr>" +
        "</tbody></table>",
    );
    // Residual: thead cloned back, last row remains.
    expect(c.innerHTML).toBe(
      "<table><thead><tr><th>k</th><th>v</th></tr></thead><tbody>" +
        "<tr><td>c</td><td>3</td></tr>" +
        "</tbody></table>",
    );
    c.remove();
  });

  test("cut between line boxes inside <p>: paragraph is split into two <p> elements", () => {
    const c = makeContainer("<p>line one line two line three</p>");
    const p = c.firstElementChild as HTMLElement;
    const textNode = p.firstChild as Text;
    // Split after "line one " (chars 0-9).
    const html = sliceFirstChunk(c, {
      kind: "between-line-boxes",
      textNode,
      charOffset: 9,
    });
    expect(html).toBe("<p>line one </p>");
    expect(c.innerHTML).toBe("<p>line two line three</p>");
    c.remove();
  });

  test("cut at first child: returns empty prefix and full container retained", () => {
    const c = makeContainer("<p>only</p>");
    const html = sliceFirstChunk(c, {
      kind: "between-children",
      parent: c,
      childIndex: 0,
    });
    expect(html).toBe("");
    expect(c.innerHTML).toBe("<p>only</p>");
    c.remove();
  });

  test("cut at last child: returns full container and leaves empty residual", () => {
    const c = makeContainer("<p>a</p><p>b</p>");
    const html = sliceFirstChunk(c, {
      kind: "between-children",
      parent: c,
      childIndex: 2,
    });
    expect(html).toBe("<p>a</p><p>b</p>");
    expect(c.innerHTML).toBe("");
    c.remove();
  });
});
