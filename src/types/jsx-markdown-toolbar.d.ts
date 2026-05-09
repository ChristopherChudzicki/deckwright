import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MarkdownToolbarAttrs = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  for?: string;
};

type MdButtonAttrs = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "markdown-toolbar": MarkdownToolbarAttrs;
      "md-bold": MdButtonAttrs;
      "md-italic": MdButtonAttrs;
      "md-unordered-list": MdButtonAttrs;
      "md-ordered-list": MdButtonAttrs;
    }
  }
}
