import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { mundaneItemDetailFactory } from "../../api/factories";
import { dtWithin } from "./dtWithin";
import { MundaneItemStatBlock } from "./MundaneItemStatBlock";

describe("MundaneItemStatBlock", () => {
  test("plain gear: Category and Cost", () => {
    const item = mundaneItemDetailFactory.build({
      category: { name: "Adventuring Gear" },
      weapon: null,
      armor: null,
      cost: "10.00",
      weight: "1.000",
      weight_unit: "lb",
    });
    render(<MundaneItemStatBlock item={item} />);
    expect(dtWithin("Category").textContent).toBe("Adventuring Gear");
    expect(dtWithin("Cost").textContent).toBe("10 gp");
    expect(dtWithin("Weight").textContent).toBe("1 lb");
  });

  test("weapon: shows Weapon type, Damage, and Properties (one <li> per property)", () => {
    const item = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d8",
        damage_type: { name: "Slashing" },
        properties: [
          { property: { name: "Versatile", type: null }, detail: "1d10" },
          { property: { name: "Topple", type: "Mastery" }, detail: null },
        ],
        is_simple: false,
        is_martial: true,
      },
    });
    render(<MundaneItemStatBlock item={item} />);
    expect(dtWithin("Weapon type").textContent).toBe("Martial");
    expect(dtWithin("Damage").textContent).toBe("1d8 slashing");
    const props = dtWithin("Properties");
    const lis = props.querySelectorAll("li");
    expect(lis).toHaveLength(2);
    expect(lis[0]?.textContent).toBe("Versatile (1d10)");
    expect(lis[1]?.textContent).toBe("Topple (Mastery)");
  });

  test("weapon with no properties: Properties line is omitted", () => {
    const item = mundaneItemDetailFactory.build({
      category: { name: "Weapon" },
      weapon: {
        damage_dice: "1d6",
        damage_type: { name: "Bludgeoning" },
        properties: [],
        is_simple: true,
        is_martial: false,
      },
    });
    render(<MundaneItemStatBlock item={item} />);
    expect(dtWithin("Weapon type").textContent).toBe("Simple");
    expect(screen.queryByText("Properties", { selector: "dt" })).toBeNull();
  });

  test("armor: Tier, AC, Stealth disadvantage, Strength requirement", () => {
    const item = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "heavy",
        ac_base: 16,
        ac_add_dexmod: false,
        ac_cap_dexmod: null,
        grants_stealth_disadvantage: true,
        strength_score_required: 13,
      },
    });
    render(<MundaneItemStatBlock item={item} />);
    expect(dtWithin("Armor tier").textContent).toBe("Heavy");
    expect(dtWithin("AC").textContent).toBe("AC 16");
    expect(dtWithin("Stealth").textContent).toBe("Disadvantage");
    expect(dtWithin("Strength").textContent).toBe("13");
  });

  test("shield (ac_base <= 5): no Tier, '+N AC' format", () => {
    const item = mundaneItemDetailFactory.build({
      category: { name: "Armor" },
      armor: {
        category: "heavy",
        ac_base: 2,
        ac_add_dexmod: false,
        ac_cap_dexmod: null,
        grants_stealth_disadvantage: false,
        strength_score_required: null,
      },
    });
    render(<MundaneItemStatBlock item={item} />);
    expect(screen.queryByText("Armor tier", { selector: "dt" })).toBeNull();
    expect(dtWithin("AC").textContent).toBe("+2 AC");
  });

  test("Cost omitted when 0.00, Weight omitted when 0.000", () => {
    const item = mundaneItemDetailFactory.build({
      cost: "0.00",
      weight: "0.000",
      weapon: null,
      armor: null,
    });
    render(<MundaneItemStatBlock item={item} />);
    expect(screen.queryByText("Cost", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("Weight", { selector: "dt" })).toBeNull();
  });
});
