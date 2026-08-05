import {
  addCacheUsage,
  type CacheTtl,
  type CacheUsage,
  type DescribeIcon,
  type RequestFailure,
} from "./transport";

const MAX_CONSECUTIVE_FAILURES = 3;
const RETRY_DELAYS_MS = [5_000, 20_000];

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runRequests(opts: {
  icons: readonly string[];
  describeIcon: DescribeIcon;
  pngDir: string;
  model: string;
  cache: CacheTtl;
  onAccept: (accepted: Record<string, string>) => void;
  validateEntry: (name: string, description: string) => string | null;
  maxCost?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}): Promise<{
  described: number;
  succeededRequests: number;
  failedRequests: number;
  totalCost: number;
  cache: CacheUsage;
  aborted: boolean;
}> {
  const {
    icons,
    describeIcon,
    pngDir,
    model,
    cache,
    onAccept,
    validateEntry,
    maxCost,
    sleep = defaultSleep,
    log = console.log,
  } = opts;

  let described = 0;
  let succeededRequests = 0;
  let failedRequests = 0;
  let totalCost = 0;
  let consecutiveFailures = 0;
  let cacheTotal: CacheUsage = { created: 0, read: 0 };

  for (const [index, name] of icons.entries()) {
    const label = `request ${index + 1}/${icons.length} ${name}`;
    let accepted: string | null = null;
    // A description the validator refuses is an outcome, not a transport
    // failure: the request worked and was billed, so it neither earns a retry
    // nor counts toward the consecutive-failure abort.
    let rejected = false;
    let requestCost = 0;
    let thinkingTokens: number | undefined;
    let nextDelayMs: number | undefined;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(nextDelayMs ?? RETRY_DELAYS_MS[attempt - 1]);
      try {
        const result = await describeIcon(name, { pngDir, model, cache });
        totalCost += result.cost;
        requestCost += result.cost;
        cacheTotal = addCacheUsage(cacheTotal, result.cache);
        thinkingTokens = result.thinkingTokens;
        const problem = validateEntry(name, result.description);
        if (problem) {
          log(`  ${label}: dropped — ${problem}`);
          rejected = true;
        } else {
          accepted = result.description;
        }
        break;
      } catch (err) {
        const failure = err as RequestFailure;
        // A request that reached the model was billed whether or not anything
        // usable came back, so its cost and its cache usage are both charged
        // before the retry. Omitting the cache here would report a hit rate
        // over a different set of requests than the cost beside it.
        totalCost += failure.cost ?? 0;
        requestCost += failure.cost ?? 0;
        cacheTotal = addCacheUsage(cacheTotal, failure.cache);
        log(`  ${label} attempt ${attempt + 1} failed: ${failure.message}`);
        if (failure.fatal) {
          log(`Aborting: ${failure.message}`);
          return {
            described,
            succeededRequests,
            failedRequests: failedRequests + 1,
            totalCost,
            cache: cacheTotal,
            aborted: true,
          };
        }
        if (failure.retryable === false) break;
        nextDelayMs = failure.retryAfterMs;
      }
    }

    if (accepted === null) {
      failedRequests++;
      // A rejection proves the transport is working, so it clears the streak
      // rather than extending it.
      if (rejected) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Exhausting a usage window looks exactly like this, and is the
          // expected way a full run ends. Everything accepted so far is already
          // on disk, so re-running resumes from there.
          log(
            `Aborting after ${consecutiveFailures} consecutive request failures. ` +
              `If those read as usage or rate limits, re-run to resume once the window resets.`,
          );
          return {
            described,
            succeededRequests,
            failedRequests,
            totalCost,
            cache: cacheTotal,
            aborted: true,
          };
        }
      }
    } else {
      consecutiveFailures = 0;
      succeededRequests++;
      onAccept({ [name]: accepted });
      described++;
      const parts = [
        `+1`,
        `$${requestCost.toFixed(3)}`,
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
      return {
        described,
        succeededRequests,
        failedRequests,
        totalCost,
        cache: cacheTotal,
        aborted: true,
      };
    }
  }

  return {
    described,
    succeededRequests,
    failedRequests,
    totalCost,
    cache: cacheTotal,
    aborted: false,
  };
}
