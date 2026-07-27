import type { BatchFailure, DescribeBatch } from "./transport";

const MAX_CONSECUTIVE_FAILURES = 3;
const RETRY_DELAYS_MS = [5_000, 20_000];

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runBatches(opts: {
  batches: readonly (readonly string[])[];
  describeBatch: DescribeBatch;
  pngDir: string;
  model: string;
  onAccept: (accepted: Record<string, string>) => void;
  validateEntry: (name: string, description: string) => string | null;
  maxCost?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}): Promise<{
  described: number;
  succeededBatches: number;
  failedBatches: number;
  totalCost: number;
  aborted: boolean;
}> {
  const {
    batches,
    describeBatch,
    pngDir,
    model,
    onAccept,
    validateEntry,
    maxCost,
    sleep = defaultSleep,
    log = console.log,
  } = opts;

  let described = 0;
  let succeededBatches = 0;
  let failedBatches = 0;
  let totalCost = 0;
  let consecutiveFailures = 0;

  for (const [index, names] of batches.entries()) {
    const label = `batch ${index + 1}/${batches.length} (${names.length})`;
    let accepted: Record<string, string> | null = null;
    let batchCost = 0;
    let thinkingTokens: number | undefined;
    let nextDelayMs: number | undefined;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(nextDelayMs ?? RETRY_DELAYS_MS[attempt - 1]);
      try {
        const result = await describeBatch(names, { pngDir, model });
        totalCost += result.cost;
        batchCost += result.cost;
        thinkingTokens = result.thinkingTokens;
        const good: Record<string, string> = {};
        for (const [name, description] of Object.entries(result.descriptions)) {
          const problem = validateEntry(name, description);
          if (problem) log(`  ${label}: dropped ${name} — ${problem}`);
          else good[name] = description;
        }
        if (Object.keys(good).length === 0) throw new Error("no valid entries in response");
        accepted = good;
        break;
      } catch (err) {
        const failure = err as BatchFailure;
        // A request that reached the model was billed whether or not anything
        // usable came back, so its cost is charged before the retry.
        totalCost += failure.cost ?? 0;
        batchCost += failure.cost ?? 0;
        log(`  ${label} attempt ${attempt + 1} failed: ${failure.message}`);
        if (failure.fatal) {
          log(`Aborting: ${failure.message}`);
          return {
            described,
            succeededBatches,
            failedBatches: failedBatches + 1,
            totalCost,
            aborted: true,
          };
        }
        if (failure.retryable === false) break;
        nextDelayMs = failure.retryAfterMs;
      }
    }

    if (!accepted) {
      failedBatches++;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // Exhausting a usage window looks exactly like this, and is the
        // expected way a full run ends. Everything accepted so far is already
        // on disk, so re-running resumes from there.
        log(
          `Aborting after ${consecutiveFailures} consecutive batch failures. ` +
            `If those read as usage or rate limits, re-run to resume once the window resets.`,
        );
        return { described, succeededBatches, failedBatches, totalCost, aborted: true };
      }
    } else {
      consecutiveFailures = 0;
      succeededBatches++;
      onAccept(accepted);
      const count = Object.keys(accepted).length;
      described += count;
      const missed = names.length - count;
      const parts = [
        `+${count}${missed ? `, ${missed} missing` : ""}`,
        `$${batchCost.toFixed(3)}`,
        ...(thinkingTokens === undefined ? [] : [`${thinkingTokens} thinking`]),
        `$${totalCost.toFixed(3)} total`,
      ];
      log(`  ${label}: ${parts.join(" · ")}`);
    }

    if (maxCost !== undefined && totalCost >= maxCost) {
      log(
        `Stopping: $${totalCost.toFixed(3)} spent reaches the --max-cost ceiling of ` +
          `$${maxCost.toFixed(2)}. Re-run with a higher ceiling to continue.`,
      );
      return { described, succeededBatches, failedBatches, totalCost, aborted: true };
    }
  }

  return { described, succeededBatches, failedBatches, totalCost, aborted: false };
}
