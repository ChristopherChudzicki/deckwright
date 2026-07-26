import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { server } from "../../src/test/msw";
import { assertApiKey, describeBatchApi, extractApiDescriptions, resolveModel } from "./invoke-api";

const SONNET = { input: 2, output: 10 };

const reply = (text: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "message",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    ...extra,
  });

describe("resolveModel", () => {
  // Falling back to a guessed rate would report a run's spend as fact while
  // being wrong about it, which is worse than refusing the model.
  test("refuses a model it has no confirmed pricing for", () => {
    expect(() => resolveModel("opus")).toThrow(/no pricing for model "opus"/);
  });
});

describe("assertApiKey", () => {
  test("throws when ANTHROPIC_API_KEY is unset", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => assertApiKey()).toThrow(/ANTHROPIC_API_KEY is not set/);
  });
});

describe("extractApiDescriptions", () => {
  test("reads the JSON text block and prices the usage", () => {
    const { descriptions, cost } = extractApiDescriptions(
      reply(JSON.stringify({ fireball: "A ball of flame." }), {
        usage: { input_tokens: 12_000, output_tokens: 1_200 },
      }),
      ["fireball"],
      SONNET,
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
    expect(cost).toBeCloseTo(0.036, 6);
  });

  test("trims surrounding whitespace", () => {
    const { descriptions } = extractApiDescriptions(
      reply(JSON.stringify({ fireball: "  A ball of flame.\n" })),
      ["fireball"],
      SONNET,
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
  });

  test("throws when the payload is an API error", () => {
    expect(() =>
      extractApiDescriptions(
        JSON.stringify({ type: "error", error: { message: "credit balance is too low" } }),
        ["fireball"],
        SONNET,
      ),
    ).toThrow(/credit balance is too low/);
  });

  // Truncation leaves valid-looking prose that is invalid JSON; naming it
  // separately is what tells the operator to shrink the batch.
  test("throws when the response was cut off at max_tokens", () => {
    expect(() =>
      extractApiDescriptions(
        reply('{"fireball": "A ball of fla', { stop_reason: "max_tokens" }),
        ["fireball"],
        SONNET,
      ),
    ).toThrow(/max_tokens/);
  });

  test("throws when the response carries no text block", () => {
    expect(() =>
      extractApiDescriptions(
        JSON.stringify({ type: "message", stop_reason: "refusal", content: [] }),
        ["fireball"],
        SONNET,
      ),
    ).toThrow(/no text block/);
  });

  test("throws when the text block is not JSON", () => {
    expect(() =>
      extractApiDescriptions(reply("I cannot help with that."), ["fireball"], SONNET),
    ).toThrow(/not JSON/);
  });

  test("drops a key that names no requested icon and keeps the rest", () => {
    const { descriptions } = extractApiDescriptions(
      reply(JSON.stringify({ fireball: "A ball of flame.", "butter-toads": "Nonsense." })),
      ["fireball", "butter-toast"],
      SONNET,
    );
    expect(descriptions).toEqual({ fireball: "A ball of flame." });
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
          JSON.parse(reply(JSON.stringify({ fireball: "A ball.", broadsword: "A sword." }))),
        );
      }),
    );
    return { body: () => seen };
  };

  // Nothing in an inline image carries its filename, so the label immediately
  // before it is the only thing tying a description back to an icon.
  test("labels each image with its filename", async () => {
    const captured = capture();
    await describeBatchApi(["fireball", "broadsword"], { pngDir, model: "sonnet" });

    const content = (captured.body().messages as { content: Record<string, unknown>[] }[])[0]
      .content;
    expect(content.slice(0, 4)).toEqual([
      { type: "text", text: "fireball.png" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
      { type: "text", text: "broadsword.png" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "BAUG" } },
    ]);
  });

  test("constrains the response to the requested icons", async () => {
    const captured = capture();
    await describeBatchApi(["fireball", "broadsword"], { pngDir, model: "sonnet" });

    expect(captured.body().output_config).toEqual({
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { fireball: { type: "string" }, broadsword: { type: "string" } },
          required: ["fireball", "broadsword"],
          additionalProperties: false,
        },
      },
    });
  });

  test("throws with the status when the API returns a non-2xx", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.text("upstream overloaded", { status: 529 }),
      ),
    );
    await expect(describeBatchApi(["fireball"], { pngDir, model: "sonnet" })).rejects.toThrow(
      /HTTP 529/,
    );
  });
});
