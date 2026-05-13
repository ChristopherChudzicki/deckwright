import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { spellDetailFactory } from "../../api/factories";
import { dtWithin } from "./dtWithin";
import { SpellStatBlock } from "./SpellStatBlock";

describe("SpellStatBlock", () => {
  test("Fireball-shaped spell renders all fields", () => {
    const spell = spellDetailFactory.build({
      level: 3,
      school: { name: "evocation" },
      casting_time: "action",
      ritual: false,
      range_text: "150 feet",
      duration: "instantaneous",
      concentration: false,
      verbal: true,
      somatic: true,
      material: true,
      material_specified: "a tiny ball of bat guano and sulfur",
      classes: [{ name: "Wizard" }, { name: "Sorcerer" }],
    });
    render(<SpellStatBlock spell={spell} />);
    expect(dtWithin("Level").textContent).toBe("3rd-level evocation");
    expect(dtWithin("Casting Time").textContent).toBe("1 action");
    expect(dtWithin("Range").textContent).toBe("150 feet");
    expect(dtWithin("Components").textContent).toBe(
      "V, S, M (a tiny ball of bat guano and sulfur)",
    );
    expect(dtWithin("Duration").textContent).toBe("Instantaneous");
    expect(dtWithin("Classes").textContent).toBe("Sorcerer, Wizard");
  });

  test("cantrip with concentration", () => {
    const spell = spellDetailFactory.build({
      level: 0,
      school: { name: "divination" },
      casting_time: "action",
      ritual: false,
      range_text: "Touch",
      duration: "1 minute",
      concentration: true,
      verbal: true,
      somatic: true,
      material: false,
      material_specified: "",
      classes: [{ name: "Cleric" }],
    });
    render(<SpellStatBlock spell={spell} />);
    expect(dtWithin("Level").textContent).toBe("Divination cantrip");
    expect(dtWithin("Components").textContent).toBe("V, S");
    expect(dtWithin("Duration").textContent).toBe("Concentration, up to 1 minute");
  });

  test("ritual flag appears in Casting Time", () => {
    const spell = spellDetailFactory.build({
      casting_time: "10minutes",
      ritual: true,
    });
    render(<SpellStatBlock spell={spell} />);
    expect(dtWithin("Casting Time").textContent).toBe("10 minutes (ritual)");
  });

  test("empty classes omits the Classes line", () => {
    const spell = spellDetailFactory.build({ classes: [] });
    render(<SpellStatBlock spell={spell} />);
    expect(screen.queryByText("Classes", { selector: "dt" })).toBeNull();
  });

  test("empty duration without concentration omits the Duration line", () => {
    const spell = spellDetailFactory.build({ duration: "", concentration: false });
    render(<SpellStatBlock spell={spell} />);
    expect(screen.queryByText("Duration", { selector: "dt" })).toBeNull();
  });

  test("empty duration with concentration shows 'Concentration'", () => {
    const spell = spellDetailFactory.build({ duration: "", concentration: true });
    render(<SpellStatBlock spell={spell} />);
    expect(dtWithin("Duration").textContent).toBe("Concentration");
  });

  test("no V/S/M omits the Components line", () => {
    const spell = spellDetailFactory.build({
      verbal: false,
      somatic: false,
      material: false,
      material_specified: "",
    });
    render(<SpellStatBlock spell={spell} />);
    expect(screen.queryByText("Components", { selector: "dt" })).toBeNull();
  });
});
