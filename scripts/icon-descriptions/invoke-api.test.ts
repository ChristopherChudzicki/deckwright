import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { server } from "../../src/test/msw";
import {
  assertApiKey,
  batchPrice,
  describeBatchApi,
  estimateCost,
  extractApiDescriptions,
  pricingFor,
  resolveModel,
} from "./invoke-api";
import { ATTACHED_INSTRUCTIONS } from "./prompt";
import { type CacheTtl, RESPONSE_SCHEMA } from "./transport";

const SONNET = { input: 2, output: 10 };
const USAGE = { input_tokens: 12_000, output_tokens: 1_200 };

const reply = (text: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "message",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: USAGE,
    ...extra,
  });

const described = (entries: Record<string, string>): string =>
  JSON.stringify({
    descriptions: Object.entries(entries).map(([name, description]) => ({ name, description })),
  });

describe("resolveModel", () => {
  // The price table is the only thing standing between a run and reporting a
  // real charge as $0.00, so the rate itself is pinned, not just its shape.
  test("maps the alias and the concrete id to one priced model", () => {
    const expected = { id: "claude-sonnet-5", price: { input: 2, output: 10 } };
    expect(resolveModel("sonnet", new Date("2026-07-26"))).toEqual(expected);
    expect(resolveModel("claude-sonnet-5", new Date("2026-07-26"))).toEqual(expected);
  });

  test("prices opus at its standard rate, which has no introductory period", () => {
    const expected = { id: "claude-opus-5", price: { input: 5, output: 25 } };
    expect(resolveModel("opus", new Date("2026-07-26"))).toEqual(expected);
    expect(resolveModel("opus", new Date("2026-09-01"))).toEqual(expected);
  });

  // The introductory rate lapses on a date, and a run afterwards would otherwise
  // keep reporting a third less than it was billed.
  test("charges the standard rate once the introductory period ends", () => {
    expect(resolveModel("sonnet", new Date("2026-09-01")).price).toEqual({ input: 3, output: 15 });
  });

  // Falling back to a guessed rate would report a run's spend as fact while
  // being wrong about it, which is worse than refusing the model.
  test("refuses a model it has no confirmed pricing for", () => {
    expect(() => resolveModel("haiku")).toThrow(/no pricing for model "haiku"/);
  });
});

describe("pricingFor", () => {
  test("halves both axes for the Batch API", () => {
    expect(batchPrice({ input: 5, output: 25 })).toEqual({ input: 2.5, output: 12.5 });
  });

  // Halving under the wrong transport misreports every run's spend by 2×, in
  // one direction or the other, and nothing downstream can catch it.
  test("discounts the batch transport and only the batch transport", () => {
    const on = new Date("2026-07-26");
    expect(pricingFor("opus", "batch", on).price).toEqual({ input: 2.5, output: 12.5 });
    expect(pricingFor("opus", "api", on).price).toEqual({ input: 5, output: 25 });
  });
});

describe("assertApiKey", () => {
  test("throws when ANTHROPIC_API_KEY is unset", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => assertApiKey()).toThrow(/ANTHROPIC_API_KEY is not set/);
  });
});

describe("estimateCost", () => {
  // The prefix is sent once per request, so at one icon per request it is the
  // largest input the run has — the term a flat per-icon estimate misses, and
  // the reason --max-cost could not be trusted at N=1.
  test("charges the instruction prefix per request, not per icon", () => {
    const grouped = estimateCost(1_000, SONNET, { batchSize: 30, cacheTtl: "off" });
    const singles = estimateCost(1_000, SONNET, { batchSize: 1, cacheTtl: "off" });

    expect(grouped.ceiling).toBeCloseTo(1.225924, 6);
    expect(singles.ceiling).toBeCloseTo(2.758, 6);
    // With no prefix cached there is nothing left for the run to vary.
    expect(singles.floor).toBe(singles.ceiling);
  });

  // Nothing predicts the hit rate, so a single number would be wrong in one
  // direction or the other — and it is the ceiling that refuses a submission.
  test("brackets a cached run between every request re-reading the prefix and none", () => {
    const { floor, ceiling } = estimateCost(1_000, SONNET, { batchSize: 1, cacheTtl: "5m" });

    expect(floor).toBeCloseTo(1.332424, 6);
    expect(ceiling).toBeCloseTo(3.1545, 6);
  });
});

describe("extractApiDescriptions", () => {
  const extract = (
    body: string,
    requested: readonly string[] = ["fireball"],
    cacheTtl: CacheTtl = "5m",
  ) => extractApiDescriptions(body, requested, SONNET, cacheTtl);

  test("reads the JSON text block and prices the usage", () => {
    const { descriptions, cost } = extract(reply(described({ fireball: "A ball of flame." })));
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
    expect(cost).toBeCloseTo(0.036, 6);
  });

  // Cached tokens are reported outside `input_tokens`, so a run that ignored
  // them would bill itself for the uncached remainder and read as far cheaper
  // than it was, putting the --max-cost rail under the real spend.
  test("prices a written prefix at the window's premium", () => {
    const written = reply(described({ fireball: "A ball of flame." }), {
      usage: { ...USAGE, cache_creation_input_tokens: 800 },
    });

    expect(extract(written, ["fireball"], "5m").cost).toBeCloseTo(0.038, 6);
    expect(extract(written, ["fireball"], "1h").cost).toBeCloseTo(0.0392, 6);
  });

  // The point of leading with the instructions: a re-read costs a tenth of what
  // sending them again would. The split is reported because the ratio between
  // the two is the only evidence that caching paid for itself.
  test("prices a re-read prefix at a tenth, and reports the split", () => {
    const { cost, cache } = extract(
      reply(described({ fireball: "A ball of flame." }), {
        usage: { ...USAGE, cache_read_input_tokens: 800 },
      }),
    );

    expect(cost).toBeCloseTo(0.03616, 6);
    expect(cache).toEqual({ created: 0, read: 800 });
  });

  // At one image per request the harness already knows which icon it asked
  // about, so a reply naming another one is not a shortfall to re-describe: it
  // is a paid answer that `pickRequested` would drop without a word, leaving
  // `batch` recording a succeeded request that merged nothing.
  test("fails a single-icon request whose reply names a different icon", () => {
    expect(() => extract(reply(described({ broadsword: "A straight blade." })))).toThrow(
      /named no requested icon \(fireball\)/,
    );
  });

  // Reported so the subset measurement can see what adaptive thinking costs.
  test("reports the thinking tokens the response used", () => {
    const { thinkingTokens } = extract(
      reply(described({ fireball: "A ball of flame." }), {
        usage: { ...USAGE, output_tokens_details: { thinking_tokens: 640 } },
      }),
    );
    expect(thinkingTokens).toBe(640);
  });

  // Adaptive thinking puts a thinking block ahead of the answer, so reading
  // content[0] would work against every fixture and fail against every real call.
  test("joins the text blocks, ignoring a leading thinking block", () => {
    const { descriptions } = extract(
      JSON.stringify({
        stop_reason: "end_turn",
        usage: USAGE,
        content: [
          { type: "thinking", thinking: "The first icon looks like a flame." },
          { type: "text", text: '{"descriptions":[{"name":"fireball",' },
          { type: "text", text: '"description":"A ball of flame."}]}' },
        ],
      }),
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
  });

  // Silently pricing an unpriceable response at $0 spends real money and reports
  // none of it.
  test("throws when the response reports no usage", () => {
    expect(() =>
      extract(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] })),
    ).toThrow(/no token usage/);
  });

  // Everything below the pricing line runs after a billed 200, so the cost has
  // to survive the throw or the run's total omits it.
  test("carries the cost of a failed batch out on the error", () => {
    expect(() => extract(reply("I cannot help with that."))).toThrow(
      expect.objectContaining({ cost: 0.036 }),
    );
  });

  // Truncation leaves valid-looking prose that is invalid JSON; naming it
  // separately is what tells the operator to shrink the batch.
  test("throws when the response was cut off at max_tokens", () => {
    expect(() =>
      extract(
        reply('{"descriptions":[{"name":"fireball","description":"A ball of fla', {
          stop_reason: "max_tokens",
        }),
      ),
    ).toThrow(/max_tokens/);
  });

  // A refusal is deterministic for these images, so the ladder would reproduce
  // it twice at full price.
  test("does not retry a refusal", () => {
    expect(() =>
      extract(JSON.stringify({ stop_reason: "refusal", content: [], usage: USAGE })),
    ).toThrow(expect.objectContaining({ retryable: false }));
  });

  test("throws when the response carries no text block", () => {
    expect(() =>
      extract(JSON.stringify({ stop_reason: "end_turn", content: [], usage: USAGE })),
    ).toThrow(/no text block/);
  });

  test("throws when the text block is not JSON", () => {
    expect(() => extract(reply("I cannot help with that."))).toThrow(/not JSON/);
  });

  // Returning {} instead would leave `batch` recording a succeeded request that
  // merged nothing and reported no failure — the paid request lost in silence.
  test("throws when the object carries no descriptions array", () => {
    expect(() => extract(reply('{"fireball": "A ball of flame."}'))).toThrow(
      /no "descriptions" array/,
    );
  });

  test("throws when the text block is JSON but not an object", () => {
    expect(() => extract(reply('["A ball of flame."]'))).toThrow(/not a JSON object/);
  });
});

describe("describeBatchApi", () => {
  let pngDir: string;
  beforeEach(() => {
    pngDir = mkdtempSync(join(tmpdir(), "icon-png-"));
    writeFileSync(join(pngDir, "fireball.png"), Buffer.from([1, 2, 3]));
    writeFileSync(join(pngDir, "broadsword.png"), Buffer.from([4, 5, 6]));
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  });
  afterEach(() => {
    rmSync(pngDir, { recursive: true, force: true });
  });

  const capture = (): { body: () => Record<string, unknown> } => {
    let seen: Record<string, unknown> = {};
    server.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        seen = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          JSON.parse(reply(described({ fireball: "A ball.", broadsword: "A sword." }))),
        );
      }),
    );
    return { body: () => seen };
  };

  test("returns the described icons and what they cost", async () => {
    capture();
    const result = await describeBatchApi(["fireball", "broadsword"], { pngDir, model: "sonnet" });

    expect(result.descriptions).toEqual({ fireball: "A ball.", broadsword: "A sword." });
    expect(result.cost).toBeCloseTo(0.036, 6);
  });

  const content = (captured: { body: () => Record<string, unknown> }) =>
    (captured.body().messages as { content: Record<string, unknown>[] }[])[0].content;

  // Nothing in an inline image carries its filename, so the label immediately
  // before it is the only thing tying a description back to an icon. The
  // instructions lead rather than trail so they can be cached: the key is
  // everything up to the marked block, so a per-request byte ahead of it would
  // change the key on every request and never hit.
  test("opens with the marked instructions, then labels each image", async () => {
    const captured = capture();
    await describeBatchApi(["fireball", "broadsword"], { pngDir, model: "sonnet" });

    expect(content(captured)).toEqual([
      {
        type: "text",
        text: ATTACHED_INSTRUCTIONS,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: "fireball.png" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
      { type: "text", text: "broadsword.png" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "BAUG" } },
    ]);
  });

  // A marked block is billed at the write premium whether or not anything ever
  // re-reads it, so `off` has to send no marker at all rather than a short one.
  test("marks the prefix with the requested window, or leaves it unmarked", async () => {
    const captured = capture();

    await describeBatchApi(["fireball"], { pngDir, model: "sonnet", cache: "1h" });
    expect(content(captured)[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });

    await describeBatchApi(["fireball"], { pngDir, model: "sonnet", cache: "off" });
    expect(content(captured)[0]).not.toHaveProperty("cache_control");
  });

  test("sends the alias's concrete model id", async () => {
    const captured = capture();
    await describeBatchApi(["fireball"], { pngDir, model: "sonnet" });

    expect(captured.body().model).toBe("claude-sonnet-5");
  });

  // Grammars are cached per schema structure against a limit of 20 compilations
  // a minute, so a request carrying a schema that named its own icons would put
  // the run back where it errored 102 of 138 requests.
  test("constrains the response with the shared schema", async () => {
    const captured = capture();
    await describeBatchApi(["fireball", "broadsword"], { pngDir, model: "sonnet" });

    expect(captured.body().output_config).toEqual({
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    });
  });

  test("throws with the status when the API returns a non-2xx", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.text("upstream overloaded", { status: 529, headers: { "retry-after": "12" } }),
      ),
    );
    await expect(describeBatchApi(["fireball"], { pngDir, model: "sonnet" })).rejects.toMatchObject(
      {
        message: expect.stringMatching(/HTTP 529/),
        fatal: false,
        retryAfterMs: 12_000,
      },
    );
  });

  // A rejected key fails every remaining batch the same way; retrying is 25s of
  // backoff per batch to learn nothing, until the consecutive-failure abort.
  test("marks an authentication failure fatal", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.text("invalid x-api-key", { status: 401 }),
      ),
    );
    await expect(describeBatchApi(["fireball"], { pngDir, model: "sonnet" })).rejects.toMatchObject(
      {
        fatal: true,
      },
    );
  });

  // Every PNG is read and base64-encoded before the request; discovering the
  // missing key there would mean doing that work 138 times to no purpose.
  test("throws without issuing a request when the key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(describeBatchApi(["fireball"], { pngDir, model: "sonnet" })).rejects.toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
