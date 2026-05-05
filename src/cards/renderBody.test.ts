import { describe, expect, test } from "vitest";
import { renderBody } from "./renderBody";

describe("renderBody", () => {
  test("wraps a single paragraph in <p>", () => {
    expect(renderBody("hello world").trim()).toBe("<p>hello world</p>");
  });

  test("splits paragraphs on blank lines", () => {
    const html = renderBody("one\n\ntwo");
    expect(html).toContain("<p>one</p>");
    expect(html).toContain("<p>two</p>");
  });

  test("renders bold and italic", () => {
    const html = renderBody("**bold** and _italic_");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("renders inline code", () => {
    expect(renderBody("use `const`")).toContain("<code>const</code>");
  });

  test("renders bullet lists", () => {
    const html = renderBody("- alpha\n- beta");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>alpha</li>");
    expect(html).toContain("<li>beta</li>");
  });

  test("renders ordered lists with preserved numbering via start attribute", () => {
    const html = renderBody("4. four\n5. five");
    expect(html).toContain('<ol start="4">');
    expect(html).toContain("<li>four</li>");
  });

  test("renders GFM tables", () => {
    const html = renderBody("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  test("strips <script> tags", () => {
    expect(renderBody("hi <script>alert(1)</script> there")).not.toContain("<script>");
  });

  test("strips javascript: URLs (links not in allowlist anyway)", () => {
    const html = renderBody("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });

  test("strips raw HTML elements not on the allowlist", () => {
    const html = renderBody("<iframe src='x'></iframe>");
    expect(html).not.toContain("<iframe");
  });

  test("preserves allowlisted tags", () => {
    const html = renderBody("**a** _b_ `c`");
    expect(html).toMatch(/<strong>.*<\/strong>/);
    expect(html).toMatch(/<em>.*<\/em>/);
    expect(html).toMatch(/<code>.*<\/code>/);
  });

  test("returns empty string for empty input", () => {
    expect(renderBody("")).toBe("");
  });
});
