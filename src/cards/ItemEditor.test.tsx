import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { itemCardFactory } from "./factories";
import { ItemEditor } from "./ItemEditor";
import type { ItemCard } from "./types";

type HarnessProps = {
  initial: ItemCard;
  onEach?: (next: ItemCard) => void;
};

function Harness({ initial, onEach }: HarnessProps) {
  const [card, setCard] = useState(initial);
  return (
    <ItemEditor
      card={card}
      onChange={(next) => {
        setCard(next);
        onEach?.(next);
      }}
    />
  );
}

describe("<ItemEditor>", () => {
  test("typing in the name field updates the rendered value", async () => {
    const card = itemCardFactory.build({ name: "" });
    render(<Harness initial={card} />);

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    await userEvent.type(nameInput, "Vorpal");

    expect(nameInput.value).toBe("Vorpal");
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
      typeLine: "Weapon, rare",
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
      typeLine: "Wondrous Items, uncommon",
      iconKey: undefined,
    });
    render(<Harness initial={card} />);
    expect(screen.queryByText(/auto-picking/i)).not.toBeInTheDocument();
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
