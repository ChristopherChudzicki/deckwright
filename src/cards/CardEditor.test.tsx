import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { CardEditor } from "./CardEditor";
import { itemCardFactory } from "./factories";
import type { ItemCard, RenderableCard, SpellCard } from "./types";

type HarnessProps = {
  initial: ItemCard;
  onEach?: (next: ItemCard) => void;
};

function Harness({ initial, onEach }: HarnessProps) {
  const [card, setCard] = useState<ItemCard>(initial);
  return (
    <CardEditor
      card={card}
      onChange={(next) => {
        setCard(next as ItemCard);
        onEach?.(next as ItemCard);
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
    const seen: ItemCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    await userEvent.type(screen.getByLabelText(/body/i), "hi");

    expect(seen[seen.length - 1]?.body).toBe("hi");
  });

  test("updates updatedAt on every change", async () => {
    const card = itemCardFactory.build({ updatedAt: "2000-01-01T00:00:00.000Z" });
    const onEach = vi.fn<(c: ItemCard) => void>();
    render(<Harness initial={card} onEach={onEach} />);

    await userEvent.type(screen.getByLabelText(/name/i), "x");

    const lastCall = onEach.mock.lastCall?.[0];
    expect(lastCall?.updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  // Picker tile selector — react-aria GridListItem uses role="row".
  const tile = (name: RegExp | string) => screen.getByRole("row", { name });

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
    const seen: ItemCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.click(tile("trident"));

    expect(seen[seen.length - 1]?.iconKey).toBe("trident");
  });

  test("Selecting Auto clears the iconKey", async () => {
    const card = itemCardFactory.build({ iconKey: "trident" });
    const seen: ItemCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    await userEvent.click(screen.getByRole("button", { name: /pick icon/i }));
    await userEvent.click(tile(/auto/i));

    expect(seen[seen.length - 1]?.iconKey).toBeUndefined();
  });

  test("Auto-pick hint shows the heuristic key when iconKey is unset and rule matches", () => {
    const card = itemCardFactory.build({
      name: "Trident of Fish Command",
      headerTags: ["Weapon", "rare"],
      iconKey: undefined,
    });
    render(<Harness initial={card} />);
    expect(screen.getByText(/auto-picking.*trident/i)).toBeInTheDocument();
  });

  test("Auto-pick hint hides when iconKey is set", () => {
    const card = itemCardFactory.build({ iconKey: "broadsword" });
    render(<Harness initial={card} />);
    expect(screen.queryByText(/auto-picking/i)).not.toBeInTheDocument();
  });

  test("Auto-pick hint hides when the heuristic falls back (no meaningful match)", () => {
    const card = itemCardFactory.build({
      name: "Mystery Object",
      headerTags: ["Wondrous Items", "uncommon"],
      iconKey: undefined,
    });
    render(<Harness initial={card} />);
    expect(screen.queryByText(/auto-picking/i)).not.toBeInTheDocument();
  });

  test("typing a tag and pressing Enter adds it to headerTags; clicking remove drops it", async () => {
    const card = itemCardFactory.build({ headerTags: [] });
    const seen: ItemCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    const input = screen.getByRole("textbox", { name: /header tags/i });
    await userEvent.type(input, "Wondrous item{Enter}rare{Enter}");

    expect(seen[seen.length - 1]?.headerTags).toEqual(["Wondrous item", "rare"]);

    await userEvent.click(screen.getByRole("button", { name: /remove wondrous item/i }));
    expect(seen[seen.length - 1]?.headerTags).toEqual(["rare"]);
  });

  test("typing a tag and pressing Enter adds it to footerTags; clicking remove drops it", async () => {
    const card = itemCardFactory.build({ footerTags: [] });
    const seen: ItemCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "500 gp{Enter}10 lb{Enter}");

    expect(seen[seen.length - 1]?.footerTags).toEqual(["500 gp", "10 lb"]);

    await userEvent.click(screen.getByRole("button", { name: /remove 500 gp/i }));
    expect(seen[seen.length - 1]?.footerTags).toEqual(["10 lb"]);
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

  test("Name and Icon controls share a row container", () => {
    const card = itemCardFactory.build();
    render(<Harness initial={card} />);

    const nameField = screen.getByLabelText(/name/i).closest("label");
    const iconField = screen.getByRole("button", { name: /pick icon/i }).closest("label");

    expect(nameField).not.toBeNull();
    expect(iconField).not.toBeNull();
    expect(nameField?.parentElement).toBe(iconField?.parentElement);
    expect(nameField?.parentElement?.tagName).toBe("DIV");
  });
});

describe("<CardEditor> with a spell card", () => {
  const buildSpell = (): SpellCard => ({
    id: "spell-1",
    kind: "spell",
    name: "Fireball",
    headerTags: ["3rd-level evocation", "1 action", "150 feet", "Instantaneous"],
    body: "A bright streak flashes…",
    footerTags: ["V, S, M (a tiny ball of bat guano and sulfur)", "Sorcerer, Wizard"],
    source: "api",
    createdAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
  });

  test("renders name, body, headerTags, and footerTags from a spell", () => {
    const spell = buildSpell();
    render(<CardEditor card={spell} onChange={() => {}} />);
    expect(screen.getByLabelText(/name/i)).toHaveValue("Fireball");
    expect(screen.getByLabelText(/body/i)).toHaveValue("A bright streak flashes…");
    expect(screen.getByRole("button", { name: /remove 3rd-level evocation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove sorcerer, wizard/i })).toBeInTheDocument();
  });

  test("editing the body of a spell propagates the spell kind", async () => {
    const spell = buildSpell();
    const seen: RenderableCard[] = [];
    const Wrapper = () => {
      const [c, setC] = useState<RenderableCard>(spell);
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
