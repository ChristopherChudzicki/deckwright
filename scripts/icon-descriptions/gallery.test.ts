/// <reference lib="dom" />
// The page's own script runs under jsdom below, and `scripts/` is otherwise
// typechecked as Node with no DOM lib.
import type { IconifyJSON } from "@iconify/types";
import { describe, expect, test } from "vitest";
import { renderGallery } from "./gallery";
import type { Arms, Choices } from "./promote";

const SONNET = "claude-sonnet-5";
const OPUS = "claude-opus-5";

const collection: IconifyJSON = {
  prefix: "game-icons",
  width: 512,
  height: 512,
  icons: {
    fireball: { body: '<path d="M1 2" fill="currentColor"/>' },
    broadsword: { body: '<path d="M3 4" fill="currentColor"/>' },
  },
};

const arms: Arms = {
  [SONNET]: { fireball: "A ball of flame.", broadsword: "A long straight blade." },
  [OPUS]: { fireball: "A sphere of fire.", broadsword: "A two-handed sword." },
};

const render = (choices: Choices, names = ["fireball", "broadsword"]) =>
  renderGallery({ collection, names, arms, choices });

const defaulting = (choices: Record<string, string> = {}): Choices => ({ default: OPUS, choices });

// The filter is client-side JS embedded as a string, so asserting on the markup
// alone would pass on a page whose script throws. Mounting it and running the
// script is what actually exercises the behaviour.
const mount = (choices: Choices, shown?: string[]) => {
  const html = render(choices, shown);
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  // Not the first script — the choices the page was built from ride along in a
  // JSON block ahead of it.
  new Function(document.querySelector("script:not([type])")?.textContent ?? "")();
  const names = document.getElementById("names") as HTMLTextAreaElement;
  return {
    names,
    type: (value: string) => {
      names.value = value;
      names.dispatchEvent(new Event("input"));
    },
    visible: () =>
      [...document.querySelectorAll<HTMLElement>(".row")]
        .filter((row) => !row.hidden)
        .map((row) => row.dataset.name),
    missed: () => document.getElementById("missed")?.textContent ?? "",
    changed: () => document.getElementById("changed")?.textContent ?? "",
    pick: (name: string, model: string) => {
      const radio = document.querySelector<HTMLInputElement>(
        `input[name="pick:${name}"][value="${model}"]`,
      );
      if (!radio) throw new Error(`no radio for ${name}/${model}`);
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    },
    exported: (): Choices =>
      JSON.parse((document.getElementById("exported") as HTMLTextAreaElement).value),
  };
};

describe("the name-list filter", () => {
  test("shows only the pasted names, however they are separated", () => {
    const page = mount(defaulting());
    expect(page.visible()).toEqual(["fireball", "broadsword"]);

    page.type("broadsword");
    expect(page.visible()).toEqual(["broadsword"]);

    page.type("broadsword,\nfireball");
    expect(page.visible()).toEqual(["fireball", "broadsword"]);
  });

  test("shows everything again when the list is emptied", () => {
    const page = mount(defaulting());
    page.type("broadsword");
    page.type("");

    expect(page.visible()).toEqual(["fireball", "broadsword"]);
  });

  // A typo filters to nothing and looks identical to a name that is legitimately
  // absent from the arms.
  test("names the entries that matched no row", () => {
    const page = mount(defaulting());
    page.type("fireball, frieball");

    expect(page.visible()).toEqual(["fireball"]);
    expect(page.missed()).toContain("frieball");
  });
});

describe("picking an arm per icon", () => {
  test("starts on what choices.json says, exceptions included", () => {
    const page = mount(defaulting({ fireball: SONNET }));

    expect(page.exported()).toEqual({ default: OPUS, choices: { fireball: SONNET } });
    expect(page.changed()).toBe("");
  });

  test("a pick away from the default becomes an exception", () => {
    const page = mount(defaulting());
    page.pick("broadsword", SONNET);

    expect(page.exported()).toEqual({ default: OPUS, choices: { broadsword: SONNET } });
    expect(page.changed()).toBe("1 changed");
  });

  // The file's invariant: `choices` lists only what goes against the default, so
  // an icon picked back to it has to leave rather than be restated.
  test("a pick back to the default drops its exception", () => {
    const page = mount(defaulting({ fireball: SONNET }));
    page.pick("fireball", OPUS);

    expect(page.exported()).toEqual({ default: OPUS, choices: {} });
  });

  // A page built with --only shows a handful of icons; exporting through it must
  // not silently discard every exception it did not render.
  test("keeps exceptions for icons the page never rendered", () => {
    const page = mount(defaulting({ fireball: SONNET, "not-rendered": SONNET }), ["fireball"]);
    page.pick("fireball", OPUS);

    expect(page.exported()).toEqual({ default: OPUS, choices: { "not-rendered": SONNET } });
  });

  // Promotion refuses a choice whose model never described the icon, so the pick
  // has to be unavailable rather than exportable.
  test("cannot pick an arm that has no description for the icon", () => {
    const sparse: Arms = { [SONNET]: { fireball: "A ball of flame." }, [OPUS]: {} };
    const html = renderGallery({
      collection,
      names: ["fireball"],
      arms: sparse,
      choices: defaulting(),
    });

    expect(html).toMatch(/<input type="radio"[^>]*value="claude-opus-5"[^>]*disabled>/);
  });
});

describe("renderGallery", () => {
  test("inlines each icon's artwork beside every arm's description of it", () => {
    const html = render(defaulting());

    expect(html).toContain('<path d="M1 2" fill="currentColor"/>');
    expect(html).toContain("A ball of flame.");
    expect(html).toContain("A sphere of fire.");
  });

  // The name-list filter matches against this attribute, so a row without one
  // is unreachable from a list pasted out of the comparison report.
  test("tags every row with its icon name for the name-list filter", () => {
    const html = render(defaulting());

    expect(html).toContain('data-name="fireball"');
    expect(html).toContain('data-name="broadsword"');
  });

  // The page is opened to decide which arm was right, so the one currently
  // winning has to be visible without cross-referencing choices.json by hand.
  test("marks the row where a choice overrides the default", () => {
    const html = render(defaulting({ fireball: SONNET }));

    expect(html).toMatch(/data-exception="1"[^>]*>(?:(?!data-exception)[\s\S])*?fireball/);
    expect(html).toMatch(/class="model shipped">claude-sonnet-5/);
  });

  // Descriptions are model output. An unescaped `<` truncates the document at
  // that row and silently hides every icon after it.
  test("escapes markup in a description rather than emitting it", () => {
    const html = renderGallery({
      collection,
      names: ["fireball"],
      arms: { [OPUS]: { fireball: 'A <script> "sphere" & flame.' } },
      choices: defaulting(),
    });

    expect(html).toContain("A &lt;script&gt; &quot;sphere&quot; &amp; flame.");
    expect(html).not.toContain("<script>A");
  });

  // A half-collected arm is the normal state mid-run, and dropping those rows
  // would hide exactly the icons worth looking at.
  test("keeps an icon one arm has not described yet", () => {
    const html = renderGallery({
      collection,
      names: ["fireball"],
      arms: { [SONNET]: {}, [OPUS]: { fireball: "A sphere of fire." } },
      choices: defaulting(),
    });

    expect(html).toContain("not described");
    expect(html).toContain("A sphere of fire.");
  });

  // An icon named in a corpus but absent from the collection has no artwork to
  // show, and interpolating `undefined.body` would throw mid-page.
  test("skips a name the collection has no icon for", () => {
    const html = render(defaulting(), ["fireball", "not-an-icon"]);

    expect(html).not.toContain("not-an-icon");
    expect(html).toContain("A ball of flame.");
  });
});
