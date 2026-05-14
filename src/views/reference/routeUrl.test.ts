import { describe, expect, test } from "vitest";
import { referenceRoutePath } from "./routeUrl";

describe("referenceRoutePath", () => {
  test("magic item, 2014 prefix", () => {
    expect(referenceRoutePath("magic-items", "srd_wand-of-wonder")).toBe(
      "/reference/magic-items/srd_wand-of-wonder",
    );
  });

  test("magic item, 2024 prefix", () => {
    expect(referenceRoutePath("magic-items", "srd-2024_wand-of-wonder")).toBe(
      "/reference/magic-items/srd-2024_wand-of-wonder",
    );
  });

  test("spell", () => {
    expect(referenceRoutePath("spells", "srd_fireball")).toBe("/reference/spells/srd_fireball");
  });

  test("mundane item", () => {
    expect(referenceRoutePath("mundane-items", "srd-2024_longsword")).toBe(
      "/reference/mundane-items/srd-2024_longsword",
    );
  });

  test("URI-encodes reserved characters in the key (defensive)", () => {
    expect(referenceRoutePath("spells", "weird key/with reserved")).toBe(
      "/reference/spells/weird%20key%2Fwith%20reserved",
    );
  });
});
