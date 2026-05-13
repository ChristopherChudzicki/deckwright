import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { magicItemDetailFactory } from "../../api/factories";
import { dtWithin } from "./dtWithin";
import { MagicItemStatBlock } from "./MagicItemStatBlock";

describe("MagicItemStatBlock", () => {
  test("renders Category and Rarity for a minimal item", () => {
    const item = magicItemDetailFactory.build({
      category: { name: "Ring" },
      rarity: { name: "Uncommon" },
      requires_attunement: false,
      attunement_detail: null,
      weapon: null,
      armor: null,
      weight: "0.000",
    });
    render(<MagicItemStatBlock item={item} />);
    expect(dtWithin("Category").textContent).toBe("Ring");
    expect(dtWithin("Rarity").textContent).toBe("Uncommon");
  });

  test("omits Attunement line when requires_attunement is false", () => {
    const item = magicItemDetailFactory.build({ requires_attunement: false });
    render(<MagicItemStatBlock item={item} />);
    expect(screen.queryByText("Attunement")).toBeNull();
  });

  test("Attunement shows full sentence with detail", () => {
    const item = magicItemDetailFactory.build({
      requires_attunement: true,
      attunement_detail: "by a spellcaster",
    });
    render(<MagicItemStatBlock item={item} />);
    expect(dtWithin("Attunement").textContent).toBe("Requires attunement by a spellcaster");
  });

  test("Attunement shows 'Requires attunement' when no detail", () => {
    const item = magicItemDetailFactory.build({
      requires_attunement: true,
      attunement_detail: null,
    });
    render(<MagicItemStatBlock item={item} />);
    expect(dtWithin("Attunement").textContent).toBe("Requires attunement");
  });

  test("Weapon line shows damage + lowercased type", () => {
    const item = magicItemDetailFactory.build({
      weapon: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
    });
    render(<MagicItemStatBlock item={item} />);
    expect(dtWithin("Weapon").textContent).toBe("1d8 slashing");
  });

  test("Armor line shows AC formula", () => {
    const item = magicItemDetailFactory.build({
      armor: { ac_base: 14, ac_add_dexmod: true, ac_cap_dexmod: 2 },
    });
    render(<MagicItemStatBlock item={item} />);
    expect(dtWithin("Armor").textContent).toBe("AC 14 + dex mod (max 2)");
  });

  test("Weight is shown when non-zero", () => {
    const item = magicItemDetailFactory.build({ weight: "1.500", weight_unit: "lb" });
    render(<MagicItemStatBlock item={item} />);
    expect(dtWithin("Weight").textContent).toBe("1.5 lb");
  });

  test("Weight is omitted when zero", () => {
    const item = magicItemDetailFactory.build({ weight: "0.000" });
    render(<MagicItemStatBlock item={item} />);
    expect(screen.queryByText("Weight")).toBeNull();
  });
});
