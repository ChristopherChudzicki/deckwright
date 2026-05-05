import DOMPurify from "dompurify";
import { marked } from "marked";

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "code",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "br",
];

const ALLOWED_ATTR = ["start"];

export function renderBody(text: string): string {
  if (text === "") return "";
  const html = marked.parse(text, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
