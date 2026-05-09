import type { CardsPerPage } from "./Card";
import cardStyles from "./Card.module.css";
import type { RenderableCard } from "./types";

export type BodyDimensions = {
  width: number;
  firstHeight: number;
  continuationHeight: number;
};

export type CardMeasurer = {
  getBodyDimensions(card: RenderableCard): BodyDimensions;
  // Writes `html` into the first scaffold's body slot and returns it for the
  // paginator to read geometry from. Caller must clear the contents
  // (replaceChildren) when done — the scaffold is reused across paginations.
  mountForPagination(html: string, width: number): HTMLElement;
};

const SENTINEL_PAGINATION = "Card 9 of 9";
const cache = new Map<CardsPerPage, CardMeasurer>();

export function getMeasurer(cardsPerPage: CardsPerPage): CardMeasurer {
  let m = cache.get(cardsPerPage);
  if (!m) {
    m = build(cardsPerPage);
    cache.set(cardsPerPage, m);
  }
  return m;
}

function build(cardsPerPage: CardsPerPage): CardMeasurer {
  const container = document.createElement("div");
  container.setAttribute("data-measurer", String(cardsPerPage));
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";

  const layoutClass = cardsPerPage === 4 ? cardStyles.perPage4 : cardStyles.perPage2;
  const cardClass = `${cardStyles.card} ${layoutClass}`;

  container.innerHTML = `
    <div class="${cardClass}" data-shape="first" data-role="card-root">
      <div class="${cardStyles.header}">
        <div class="${cardStyles.icon}"></div>
        <h3 class="${cardStyles.title}" data-slot="title"></h3>
        <span class="${cardStyles.headerTags}" data-slot="headerTags"></span>
      </div>
      <hr class="${cardStyles.divider}" />
      <div class="${cardStyles.body}" data-slot="body" data-role="card-body"></div>
      <div class="${cardStyles.footer}" data-slot="footer"></div>
    </div>
    <div class="${cardClass}" data-shape="continuation" data-role="card-root">
      <div class="${cardStyles.header}">
        <div class="${cardStyles.icon}"></div>
        <h3 class="${cardStyles.title}" data-slot="title"></h3>
      </div>
      <hr class="${cardStyles.divider}" />
      <div class="${cardStyles.body}" data-slot="body" data-role="card-body"></div>
      <div class="${cardStyles.footer}" data-slot="footer"></div>
    </div>
  `;

  document.body.appendChild(container);

  const find = (shape: "first" | "continuation", slot: string): HTMLElement => {
    const el = container.querySelector<HTMLElement>(
      `[data-shape="${shape}"] [data-slot="${slot}"]`,
    );
    if (!el) throw new Error(`measurer: missing ${shape}.${slot}`);
    return el;
  };

  const firstTitle = find("first", "title");
  const firstHeaderTags = find("first", "headerTags");
  const firstBody = find("first", "body");
  const firstFooter = find("first", "footer");
  const contTitle = find("continuation", "title");
  const contBody = find("continuation", "body");
  const contFooter = find("continuation", "footer");

  const setHeaderTags = (el: HTMLElement, headerTags: string[]) => {
    el.replaceChildren();
    for (const tag of headerTags) {
      const t = document.createElement("span");
      t.className = cardStyles.headerTag ?? "";
      t.textContent = tag;
      el.appendChild(t);
    }
  };

  const setFooter = (el: HTMLElement, footerTags: string[], pagination: string) => {
    el.replaceChildren();
    if (footerTags.length > 0) {
      const left = document.createElement("span");
      left.className = cardStyles.footerTags ?? "";
      for (const tag of footerTags) {
        const t = document.createElement("span");
        t.className = cardStyles.footerTag ?? "";
        t.textContent = tag;
        left.appendChild(t);
      }
      el.appendChild(left);
    }
    const right = document.createElement("span");
    right.textContent = pagination;
    right.className = cardStyles.footerRight ?? "";
    el.appendChild(right);
  };

  return {
    getBodyDimensions(card) {
      firstTitle.textContent = card.name;
      setHeaderTags(firstHeaderTags, card.headerTags);
      setFooter(firstFooter, card.footerTags, SENTINEL_PAGINATION);

      contTitle.textContent = card.name;
      setFooter(contFooter, [], SENTINEL_PAGINATION);

      return {
        width: firstBody.clientWidth,
        firstHeight: firstBody.clientHeight,
        continuationHeight: contBody.clientHeight,
      };
    },
    mountForPagination(html, _width) {
      // The first scaffold's body slot already has the right CSS context
      // (font, line-height, width). Reuse it as the offscreen layout host so
      // line wrapping and getClientRects line up with what the rendered Card
      // will produce.
      firstBody.innerHTML = html;
      return firstBody;
    },
  };
}
