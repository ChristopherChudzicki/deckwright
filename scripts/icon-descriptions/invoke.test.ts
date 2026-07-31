import { describe, expect, test } from "vitest";
import { extractDescriptions } from "./invoke";
import { ATTACHED_INSTRUCTIONS, buildPrompt } from "./prompt";
import type { BatchFailure } from "./transport";

const envelope = (structured_output: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ is_error: false, subtype: "success", structured_output, ...extra });

describe("buildPrompt", () => {
  test("lists each requested icon as a .png filename", () => {
    expect(buildPrompt(["fireball", "broadsword"])).toContain("fireball.png\nbroadsword.png");
  });

  // The CLI transport is the one that still needs a file list, and its wording
  // differs in the one sentence about where the images are. Expressed as that
  // substitution rather than restated, so a clause that belongs to only one
  // transport cannot slip into the other.
  test("differs from the pinned text only in how the images arrive", () => {
    expect(buildPrompt(["fireball"])).toBe(
      `${ATTACHED_INSTRUCTIONS.replace(
        "Each icon is attached below, immediately preceded by its filename. " +
          "Describe what each one depicts.",
        "Read every PNG file listed below and describe what each one depicts.",
      )}\n\nFiles:\nfireball.png`,
    );
  });

  // Pinned in full, deliberately: `api` and `batch` send exactly this, so it is
  // the text the whole paid corpus is generated under. Any edit here — including
  // a reflow — changes what the descriptions mean, and the corpus carries no
  // marker separating entries written under one wording from another. Updating
  // this test is the moment to decide whether to regenerate all 4,134 entries.
  test("pins the instruction text exactly", () => {
    expect(
      ATTACHED_INSTRUCTIONS,
    ).toBe(`These are icons from the game-icons.net collection, used in a Dungeons & Dragons spell-and-item card app.

Each icon is attached below, immediately preceded by its filename. Describe what each one depicts.

Each filename is the icon's name in the collection. The name is a hint, but the image is authoritative — where they disagree, describe the image. Describe the shape actually drawn, not the object the name brings to mind. Do not say whether something is open or closed, count its parts, or place one element inside another unless the image shows it:
- a book drawn with its covers together is closed, however often books are drawn open
- a plug with two prongs has two prongs, even where that kind of plug usually has three
- a figure drawn over an eye is superimposed on it, not inside the pupil

For each icon write ONE sentence of at most 30 words:
1. Begin with what is literally depicted, naming the primary object as specifically as the image supports.
2. Then, ONLY IF a well-established real-world or fantasy-genre association exists, state what it conventionally symbolizes. Never invent flavor text and never describe anything the image does not show.

Add the association only when it carries meaning the image does not already give:
- "A single bat wing, an emblem of vampires and other nocturnal creatures."
- "Scattered four-pointed sparkles, the usual shorthand for magic or enchantment."
- "A downward arrow above a horizontal bar, the standard sign for saving or downloading."
- "A laurel-crowned head in profile, in the manner of a Roman emperor and a mark of victory."

Omit the association when it only restates the subject. These patterns are wrong however the blanks are filled and however the clause is introduced:
- "A <tool>, symbolizing <the activity that tool performs>."
- "A <piece of equipment>, representing <the game or sport it belongs to>."
- "A <object>, evoking <what that object is plainly used for>."
- "A <subject>, a symbol of <the same subject in other words>."

The test is whether a reader who already has the literal description learns anything from the clause. If not, end the sentence at the literal description.

Most icons carry no such association, and a bare literal description is the expected answer:
- "A rounded bush dotted with small berry shapes on short stems."
- "An eight-pointed star frame enclosing a rising sun with radiating triangular rays above a solid horizontal band."

Describe the subject, not the drawing style. Every icon is a flat black-and-white shape, so words about how a thing is drawn — its rendering, how abstract or simplified it is, its outline treatment, its line weight, its flatness — are true of all 4,134 icons and belong in none of them. Spend every word on what is shown.

Reply with ONLY a JSON object with a "descriptions" array, holding one entry per icon: {"name": the filename without the .png extension, "description": your sentence}.`);
  });
});

describe("extractDescriptions", () => {
  test("reads structured_output and the cost", () => {
    const { descriptions, cost } = extractDescriptions(
      envelope(
        { descriptions: [{ name: "fireball", description: "A ball of flame." }] },
        {
          total_cost_usd: 0.31,
        },
      ),
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
    expect(() => extractDescriptions(envelope([]), ["fireball"])).toThrow(/no structured_output/);
  });

  // Returning nothing instead would bank a paid invocation as an empty batch.
  test("throws when structured_output carries no descriptions array", () => {
    expect(() => extractDescriptions(envelope({ fireball: "A ball." }), ["fireball"])).toThrow(
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

  // The envelope only exists because the invocation ran, so these failures were
  // billed. A bare Error drops the cost and the run under-reports its spend.
  test.each([
    ["the envelope reports an error", { is_error: true, result: "Overloaded" }],
    ["the envelope carries no structured_output", {}],
  ])("carries the cost out when %s", (_label, extra) => {
    let thrown: BatchFailure | undefined;
    try {
      extractDescriptions(envelope(null, { total_cost_usd: 0.17, ...extra }), ["fireball"]);
    } catch (err) {
      thrown = err as BatchFailure;
    }
    expect(thrown?.cost).toBe(0.17);
  });

  // Without the ?? 0 the run's running total becomes NaN, with no other symptom.
  test("reports zero cost when the envelope omits total_cost_usd", () => {
    expect(
      extractDescriptions(
        envelope({ descriptions: [{ name: "fireball", description: "A ball of flame." }] }),
        ["fireball"],
      ).cost,
    ).toBe(0);
  });
});
