import { describe, expect, test } from "vitest";
import { extractDescriptions } from "./invoke";
import { buildPrompt } from "./prompt";

const envelope = (structured_output: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ is_error: false, subtype: "success", structured_output, ...extra });

describe("buildPrompt", () => {
  test("lists each requested icon as a .png filename", () => {
    expect(buildPrompt(["fireball", "broadsword"])).toContain("fireball.png\nbroadsword.png");
  });

  // Pinned in full, deliberately. Any edit here — including a reflow — changes
  // what the descriptions mean, and the corpus carries no marker separating
  // entries written under one wording from another. Updating this test is the
  // moment to decide whether to regenerate all 4,134 entries.
  test("pins the instruction text exactly", () => {
    expect(
      buildPrompt(["fireball"]),
    ).toBe(`These are icons from the game-icons.net collection, used in a Dungeons & Dragons spell-and-item card app.

Read every PNG file listed below and describe what each one depicts.

For each icon write ONE sentence of at most 30 words:
1. Begin with what is literally depicted, naming the primary object as specifically as the image supports.
2. Then, ONLY IF a well-established real-world or fantasy-genre association exists, state what it conventionally symbolizes. Never invent flavor text and never describe anything the image does not show.

Add the association only when it carries meaning the image does not already give:
- a bat wing — conventionally symbolizing vampires or nocturnal creatures
- scattered four-pointed sparkles — conventionally symbolizing magic or enchantment
- a downward arrow above a bar — conventionally symbolizing saving or downloading
- a laurel-crowned head in profile — conventionally symbolizing a Roman emperor or victory

Omit it when it only restates the subject. These are wrong:
- a fishing rod and reel — "symbolizing fishing"
- a smoking pipe — "symbolizing smoking"
- a teardrop map pin — "symbolizing a location marker"
- a shirt of overlapping scales — "symbolizing armor"
- a bowling pin — "symbolizing the sport of bowling"

Most icons carry no such association, and a bare literal description is the expected answer:
- "A rounded bush dotted with small berry shapes on short stems."
- "An eight-pointed star frame enclosing a rising sun with radiating triangular rays above a solid horizontal band."

Describe the subject, not the drawing style. Every icon is a flat black-and-white shape, so phrases like "depicted in bold silhouette" or "in simple line art" waste words that belong on what is shown.

Reply with ONLY a JSON object mapping each filename (without the .png extension) to its description string.

Each filename is the icon's name in the collection. The name is a hint, but the image is authoritative — where they disagree, describe the image.

Files:
fireball.png`);
  });
});

describe("extractDescriptions", () => {
  test("reads structured_output and the cost", () => {
    const { descriptions, cost } = extractDescriptions(
      envelope({ fireball: "A ball of flame." }, { total_cost_usd: 0.31 }),
      ["fireball"],
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
    expect(cost).toBe(0.31);
  });

  // The CLI can report success and still carry no structured output; treating
  // that as an empty batch would bank a paid-for invocation as a no-op.
  test("throws when the envelope reports success but carries no structured_output", () => {
    expect(() => extractDescriptions(JSON.stringify({ subtype: "success" }), ["fireball"])).toThrow(
      /no structured_output/,
    );
  });

  test("throws when structured_output is an array rather than an object", () => {
    expect(() => extractDescriptions(envelope([{ fireball: "A ball." }]), ["fireball"])).toThrow(
      /no structured_output/,
    );
  });

  test("throws when the envelope reports an error", () => {
    expect(() =>
      extractDescriptions(envelope(null, { is_error: true, result: "Credit balance too low" }), [
        "fireball",
      ]),
    ).toThrow(/Credit balance too low/);
  });

  test("throws when stdout is not the expected envelope", () => {
    expect(() => extractDescriptions("command not found", ["fireball"])).toThrow(/envelope/);
  });

  // Without the ?? 0 the run's running total becomes NaN, with no other symptom.
  test("reports zero cost when the envelope omits total_cost_usd", () => {
    expect(extractDescriptions(envelope({ fireball: "A ball of flame." }), ["fireball"]).cost).toBe(
      0,
    );
  });
});
