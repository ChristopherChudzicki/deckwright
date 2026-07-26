// Verbatim from the runs that produced every measurement in the spec — the
// batch-30 cost curve, the 4x named-over-blind margin, the 2-3% miss rate.
// Rewording it invalidates all of them and costs a full regeneration.
const INSTRUCTIONS = `These are icons from the game-icons.net collection, used in a Dungeons & Dragons spell-and-item card app.

Read every PNG file listed below and describe what each one depicts.

For each icon write ONE sentence of at most 30 words:
1. Begin with what is literally depicted, naming the primary object as specifically as the image supports.
2. Then, ONLY IF a well-established real-world or fantasy-genre association exists, state what it conventionally symbolizes. If no such association exists, stop after the literal description. Never invent flavor text and never describe anything the image does not show.

Reply with ONLY a JSON object mapping each filename (without the .png extension) to its description string.

Each filename is the icon's name in the collection. The name is a hint, but the image is authoritative — where they disagree, describe the image.`;

export function buildPrompt(filenames: readonly string[]): string {
  return `${INSTRUCTIONS}

Files:
${filenames.map((name) => `${name}.png`).join("\n")}`;
}
