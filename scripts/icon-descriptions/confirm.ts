import { createInterface } from "node:readline/promises";

// Returns false when stdin is not a TTY. A prompt nobody can answer must fail
// closed: under `npm run … < /dev/null` or in CI, readline resolves immediately
// on EOF, and treating that empty answer as consent would approve a spend no one
// saw. The caller says what to do instead.
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  // Prompt on stderr so a run whose stdout is being captured still shows it.
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
