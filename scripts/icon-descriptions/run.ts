import type { DescribeBatch } from "./invoke";

export const MAX_CONSECUTIVE_FAILURES = 3;
export const RETRY_DELAYS_MS = [5_000, 20_000];

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runBatches(opts: {
  batches: readonly (readonly string[])[];
  describeBatch: DescribeBatch;
  pngDir: string;
  model: string;
  onAccept: (accepted: Record<string, string>) => void;
  validateEntry: (name: string, description: string) => string | null;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}): Promise<{ described: number; failedBatches: number; totalCost: number; aborted: boolean }> {
  const {
    batches,
    describeBatch,
    pngDir,
    model,
    onAccept,
    validateEntry,
    sleep = defaultSleep,
    log = console.log,
  } = opts;

  let described = 0;
  let failedBatches = 0;
  let totalCost = 0;
  let consecutiveFailures = 0;

  for (const [index, names] of batches.entries()) {
    const label = `batch ${index + 1}/${batches.length} (${names.length})`;
    let accepted: Record<string, string> | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] as number);
      try {
        const { descriptions, cost } = await describeBatch(names, { pngDir, model });
        totalCost += cost;
        const good: Record<string, string> = {};
        for (const [name, description] of Object.entries(descriptions)) {
          const problem = validateEntry(name, description);
          if (problem) log(`  ${label}: dropped ${name} — ${problem}`);
          else good[name] = description;
        }
        if (Object.keys(good).length === 0) throw new Error("no valid entries in response");
        accepted = good;
        break;
      } catch (err) {
        log(`  ${label} attempt ${attempt + 1} failed: ${(err as Error).message}`);
      }
    }

    if (!accepted) {
      failedBatches++;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log(`Aborting after ${consecutiveFailures} consecutive batch failures.`);
        return { described, failedBatches, totalCost, aborted: true };
      }
      continue;
    }

    consecutiveFailures = 0;
    onAccept(accepted);
    const count = Object.keys(accepted).length;
    described += count;
    const missed = names.length - count;
    log(
      `  ${label}: +${count}${missed ? `, ${missed} missing` : ""} · $${totalCost.toFixed(3)} total`,
    );
  }

  return { described, failedBatches, totalCost, aborted: false };
}
