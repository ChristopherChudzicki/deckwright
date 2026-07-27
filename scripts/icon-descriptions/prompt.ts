// Prompt stability is load-bearing. Adopting a reworded prompt incrementally
// leaves the file a mix of two versions with no marker distinguishing them, so
// any change here means regenerating all 4,134 entries. See the design doc,
// "Risks and follow-ups".
const INSTRUCTIONS = `These are icons from the game-icons.net collection, used in a Dungeons & Dragons spell-and-item card app.

Read every PNG file listed below and describe what each one depicts.

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

Omit it when it only restates the subject. These are wrong:
- "A fishing rod and reel, symbolizing fishing."
- "A smoking pipe, symbolizing smoking."
- "A teardrop map pin, symbolizing a location marker."
- "A shirt of overlapping scales, symbolizing armor."
- "A bowling pin, symbolizing the sport of bowling."

Most icons carry no such association, and a bare literal description is the expected answer:
- "A rounded bush dotted with small berry shapes on short stems."
- "An eight-pointed star frame enclosing a rising sun with radiating triangular rays above a solid horizontal band."

Describe the subject, not the drawing style. Every icon is a flat black-and-white shape, so phrases like "depicted in bold silhouette" or "in simple line art" waste words that belong on what is shown.

Reply with ONLY a JSON object mapping each filename (without the .png extension) to its description string.`;

export function buildPrompt(filenames: readonly string[]): string {
  return `${INSTRUCTIONS}

Files:
${filenames.map((name) => `${name}.png`).join("\n")}`;
}
