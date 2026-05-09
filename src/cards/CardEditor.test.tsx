import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { makeSpellPayload } from "../test/factories";
import { render, screen } from "../test/render";
import { CardEditor } from "./CardEditor";
import { itemCardFactory } from "./factories";
import type { RenderableCard, SpellCard } from "./types";

type HarnessProps = {
  initial: RenderableCard;
  onEach?: (next: RenderableCard) => void;
};

function Harness({ initial, onEach }: HarnessProps) {
  const [card, setCard] = useState<RenderableCard>(initial);
  return (
    <CardEditor
      card={card}
      onChange={(next) => {
        setCard(next);
        onEach?.(next);
      }}
    />
  );
}

describe("<CardEditor>", () => {
  test("typing in the name field updates the rendered value", async () => {
    const card = itemCardFactory.build({ name: "" });
    render(<Harness initial={card} />);

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    await userEvent.type(nameInput, "Vorpal");

    expect(nameInput.value).toBe("Vorpal");
  });

  test("name field shows 'Untitled item' as placeholder", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    expect(screen.getByPlaceholderText("Untitled item")).toBe(screen.getByLabelText(/name/i));
  });

  test("onChange is called with the updated card on body edits", async () => {
    const card = itemCardFactory.build({ body: "" });
    const seen: RenderableCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    await userEvent.type(screen.getByLabelText(/body/i), "hi");

    expect(seen[seen.length - 1]?.body).toBe("hi");
  });

  test("updates updatedAt on every change", async () => {
    const card = itemCardFactory.build({ updatedAt: "2000-01-01T00:00:00.000Z" });
    const onEach = vi.fn<(c: RenderableCard) => void>();
    render(<Harness initial={card} onEach={onEach} />);

    await userEvent.type(screen.getByLabelText(/name/i), "x");

    const lastCall = onEach.mock.lastCall?.[0];
    expect(lastCall?.updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  // Picker tile selector — react-aria GridListItem uses role="row".
  const tile = (name: RegExp | string) => screen.getByRole("row", { name });
  const findTile = (name: RegExp | string) => screen.findByRole("row", { name });

  test("Icon row trigger shows 'Auto' when iconKey is unset", () => {
    const card = itemCardFactory.build({ iconKey: undefined });
    render(<Harness initial={card} />);
    expect(screen.getByRole("button", { name: /pick icon.*auto/i })).toBeInTheDocument();
  });

  test("Icon row trigger shows the explicit key when iconKey is set", () => {
    const card = itemCardFactory.build({ iconKey: "trident" });
    render(<Harness initial={card} />);
    expect(screen.getByRole("button", { name: /pick icon.*trident/i })).toBeInTheDocument();
  });

  test("Selecting an icon updates the card's iconKey", async () => {
    const card = itemCardFactory.build({ iconKey: undefined });
    const seen: RenderableCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.type(screen.getByRole("searchbox"), "trident");
    await userEvent.click(await findTile("trident"));

    expect(seen[seen.length - 1]?.iconKey).toBe("trident");
  });

  test("Selecting Auto clears the iconKey", async () => {
    const card = itemCardFactory.build({ iconKey: "trident" });
    const seen: RenderableCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.click(tile(/auto/i));

    expect(seen[seen.length - 1]?.iconKey).toBeUndefined();
  });

  test("typing a tag and pressing Enter adds it to headerTags; clicking remove drops it", async () => {
    const card = itemCardFactory.build({ headerTags: [] });
    const seen: RenderableCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    const input = screen.getByRole("textbox", { name: /header tags/i });
    await userEvent.type(input, "Wondrous item{Enter}rare{Enter}");

    expect(seen[seen.length - 1]?.headerTags).toEqual(["Wondrous item", "rare"]);

    await userEvent.click(screen.getByRole("button", { name: /remove wondrous item/i }));
    expect(seen[seen.length - 1]?.headerTags).toEqual(["rare"]);
  });

  test("typing a tag and pressing Enter adds it to footerTags; clicking remove drops it", async () => {
    const card = itemCardFactory.build({ footerTags: [] });
    const seen: RenderableCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "500 gp{Enter}10 lb{Enter}");

    expect(seen[seen.length - 1]?.footerTags).toEqual(["500 gp", "10 lb"]);

    await userEvent.click(screen.getByRole("button", { name: /remove 500 gp/i }));
    expect(seen[seen.length - 1]?.footerTags).toEqual(["10 lb"]);
  });

  test("renders body markdown help text with a reference link", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);
    expect(screen.getByRole("link", { name: "Markdown" })).toHaveAttribute(
      "href",
      "https://www.markdownguide.org/cheat-sheet/",
    );
  });

  test("renders header tag help text", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);
    expect(screen.getByText(/suggested order: type, damage\/AC, attunement/i)).toBeInTheDocument();
  });

  test("renders footer tag help text", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);
    expect(screen.getByText(/suggested order: rarity, cost, weight/i)).toBeInTheDocument();
  });

  test("switching Type from Item to Spell updates kind without losing other fields", async () => {
    const card = itemCardFactory.build();
    const seen: RenderableCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    const itemRadio = screen.getByRole("radio", { name: "Item" });
    const spellRadio = screen.getByRole("radio", { name: "Spell" });
    expect(itemRadio).toBeChecked();
    expect(spellRadio).not.toBeChecked();

    await userEvent.click(spellRadio);

    const last = seen[seen.length - 1];
    expect(last?.kind).toBe("spell");
    expect(last?.name).toBe(card.name);
    expect(last?.body).toBe(card.body);
    expect(last?.iconKey).toBe(card.iconKey);
    expect(last?.headerTags).toEqual(card.headerTags);
    expect(last?.footerTags).toEqual(card.footerTags);
    expect(spellRadio).toBeChecked();
  });

  test("Type, Name, and Icon controls share a row container", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const typeRadio = screen.getByRole("radio", { name: "Item" });
    const nameField = screen.getByLabelText(/name/i).closest("label");
    const iconField = screen.getByRole("button", { name: /pick icon/i }).closest("label");

    expect(nameField).not.toBeNull();
    expect(iconField).not.toBeNull();
    expect(nameField?.parentElement).toBe(iconField?.parentElement);
    expect(nameField?.parentElement?.tagName).toBe("DIV");
    expect(nameField?.parentElement?.contains(typeRadio)).toBe(true);
  });

  test("renders the markdown toolbar associated with the body field", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const toolbar = screen.getByRole("toolbar", { name: /formatting/i });
    const body = screen.getByLabelText(/body/i);

    // Toolbar's for= attribute targets the body textarea.
    expect(toolbar.getAttribute("for")).toBe(body.getAttribute("id"));
  });

  test("Cmd+B on the body textarea clicks the Bold toolbar button", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const bold = screen.getByRole("button", { name: /bold/i });
    const clickSpy = vi.spyOn(bold, "click");

    body.focus();
    await userEvent.keyboard("{Meta>}b{/Meta}");

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("Ctrl+B on the body textarea clicks the Bold toolbar button (non-mac)", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const bold = screen.getByRole("button", { name: /bold/i });
    const clickSpy = vi.spyOn(bold, "click");

    body.focus();
    await userEvent.keyboard("{Control>}b{/Control}");

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("Cmd+I on the body textarea clicks the Italic toolbar button", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const italic = screen.getByRole("button", { name: /italic/i });
    const clickSpy = vi.spyOn(italic, "click");

    body.focus();
    await userEvent.keyboard("{Meta>}i{/Meta}");

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("Cmd+Shift+B does not trigger Bold (modifier guard)", async () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    const bold = screen.getByRole("button", { name: /bold/i });
    const clickSpy = vi.spyOn(bold, "click");

    body.focus();
    await userEvent.keyboard("{Meta>}{Shift>}b{/Shift}{/Meta}");

    expect(clickSpy).not.toHaveBeenCalled();
  });

  test("Cmd+B on the body textarea calls preventDefault", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const body = screen.getByLabelText(/body/i);
    body.focus();

    // Use a raw KeyboardEvent so we can inspect defaultPrevented after dispatch.
    const event = new KeyboardEvent("keydown", {
      key: "b",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe("<CardEditor> with a spell card", () => {
  const buildSpell = (overrides: Partial<Omit<SpellCard, "id">> = {}): SpellCard => ({
    id: "spell-1",
    ...makeSpellPayload.build(overrides),
  });

  test("renders name, body, headerTags, and footerTags from a spell", () => {
    const spell = buildSpell({
      name: "Fireball",
      body: "A bright streak flashes…",
      headerTags: ["3rd-level evocation"],
      footerTags: ["Sorcerer, Wizard"],
    });
    render(<CardEditor card={spell} onChange={() => {}} />);
    expect(screen.getByLabelText(/name/i)).toHaveValue("Fireball");
    expect(screen.getByLabelText(/body/i)).toHaveValue("A bright streak flashes…");
    expect(screen.getByRole("button", { name: /remove 3rd-level evocation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove sorcerer, wizard/i })).toBeInTheDocument();
  });

  test("editing the body of a spell propagates the spell kind", async () => {
    const seen: RenderableCard[] = [];
    const Wrapper = () => {
      const [c, setC] = useState<RenderableCard>(buildSpell());
      return (
        <CardEditor
          card={c}
          onChange={(n) => {
            setC(n);
            seen.push(n);
          }}
        />
      );
    };
    render(<Wrapper />);
    await userEvent.type(screen.getByLabelText(/body/i), "X");
    expect(seen[seen.length - 1]?.kind).toBe("spell");
  });
});
