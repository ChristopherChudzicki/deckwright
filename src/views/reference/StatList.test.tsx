import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StatList } from "./StatList";

describe("StatList", () => {
  test("renders a dt/dd pair per item, in order", () => {
    const { container } = render(
      <StatList
        items={[
          { label: "Casting Time", value: "1 action" },
          { label: "Range", value: "60 feet" },
        ]}
      />,
    );
    const terms = container.querySelectorAll("dt");
    const descs = container.querySelectorAll("dd");
    expect(terms).toHaveLength(2);
    expect(descs).toHaveLength(2);
    expect(terms[0]?.textContent).toBe("Casting Time");
    expect(descs[0]?.textContent).toBe("1 action");
    expect(terms[1]?.textContent).toBe("Range");
    expect(descs[1]?.textContent).toBe("60 feet");
  });

  test("renders inside a <dl>", () => {
    const { container } = render(<StatList items={[{ label: "L", value: "v" }]} />);
    expect(container.querySelector("dl")).not.toBeNull();
  });

  test("renders nothing when items is empty (no empty <dl>)", () => {
    const { container } = render(<StatList items={[]} />);
    expect(container.querySelector("dl")).toBeNull();
  });

  test("accepts a ReactNode value (not just a string)", () => {
    const { container } = render(
      <StatList
        items={[
          {
            label: "Properties",
            value: (
              <ul>
                <li>Finesse</li>
                <li>Light</li>
              </ul>
            ),
          },
        ]}
      />,
    );
    expect(container.querySelector("dd ul")).not.toBeNull();
  });
});
