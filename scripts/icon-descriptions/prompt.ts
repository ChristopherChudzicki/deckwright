// Prompt stability is load-bearing. Adopting a reworded prompt incrementally
// leaves the file a mix of two versions with no marker distinguishing them, so
// any change here means regenerating all 4,134 entries. See the design doc,
// "Risks and follow-ups".

// The CLI runs with `--allowedTools Read` and its cwd set to the PNG directory,
// so there the files are work to fetch. Over HTTP the bytes are already in the
// content block, each preceded by its own filename, and there is no Read tool —
// the CLI wording would name an affordance that does not exist.
type ImageSource = "on-disk" | "attached";

const SOURCE: Record<ImageSource, string> = {
  "on-disk": "Read every PNG file listed below and describe what each one depicts.",
  attached:
    "Each icon is attached below, immediately preceded by its filename. Describe what each one depicts.",
};

// The model reproduces an example's wording when it meets that example's icon.
// Harmless for the examples worth copying — but every counter-example used to
// name a real icon too, and all five came back carrying the exact clause the
// list forbade. Counter-examples are therefore written as patterns with the
// subject left blank: with no subject to match an icon against, there is nothing
// to copy. Their verbs vary for the same reason at one remove — with the subject
// blanked, the verb is the only concrete thing left to read as the rule's scope,
// and 21 of the 47 measured offenders used a verb other than "symbolizing".
//
// The style rule at the end gets no counter-examples at all, for a related
// reason. Its forbidden vocabulary is generic rather than icon-bound, so a
// pattern cannot hide it — the old wording illustrated the rule with "depicted
// in bold silhouette", and "silhouette" then appeared in 8 entries. Describe
// that rule; do not demonstrate it.
const INSTRUCTIONS = `Each filename is the icon's name in the collection. The name is a hint, but the image is authoritative — where they disagree, describe the image. Describe the shape actually drawn, not the object the name brings to mind. Do not say whether something is open or closed, count its parts, or place one element inside another unless the image shows it:
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

Reply with ONLY a JSON object with a "descriptions" array, holding one entry per icon: {"name": the filename without the .png extension, "description": your sentence}.`;

function preamble(images: ImageSource): string {
  return `These are icons from the game-icons.net collection, used in a Dungeons & Dragons spell-and-item card app.

${SOURCE[images]}

${INSTRUCTIONS}`;
}

// The attached path sends this ahead of the images instead of after them, which
// is what makes it a prefix: prompt caching keys on everything up to the marked
// block, so anything per-request appended here would change the key and never
// hit. Nothing about it may vary with the request — not the icon count, not the
// filenames.
export const ATTACHED_INSTRUCTIONS = preamble("attached");

// The CLI transport fetches the PNGs itself, so it still needs the list naming
// them, and still sends one prompt after the fact rather than a cached prefix.
export function buildPrompt(filenames: readonly string[]): string {
  return `${preamble("on-disk")}

Files:
${filenames.map((name) => `${name}.png`).join("\n")}`;
}
