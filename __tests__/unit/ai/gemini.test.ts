// __tests__/unit/ai/gemini.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod/v4";
import { AiError, getAiConfig, getAiUsage, resetAiUsage, type AiConfig } from "@/lib/ai/claude";
import { callGemini, toGeminiError, toGeminiParts, toGeminiSchema } from "@/lib/ai/gemini";
import { callAi, describeProvider } from "@/lib/ai/provider";

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({ ...getAiConfig({ GEMINI_API_KEY: "AIza-test" }), ...over });

const schema = z.object({ answer: z.string(), score: z.number().int() });
const call = { purpose: "test", system: "be brief", content: "hello", schema };

const okResponse = (over: Record<string, unknown> = {}) => ({
  text: JSON.stringify({ answer: "hi", score: 3 }),
  candidates: [{ finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 10 },
  modelVersion: "gemini-3.5-flash-lite",
  ...over,
});

const fakeClient = (...responses: unknown[]) => {
  const generateContent = vi.fn();
  for (const r of responses as any[]) {
    // a { status, message } object stands for an API error the SDK would throw
    const isError = r instanceof Error || (r && typeof r === "object" && "status" in r && !("text" in r));
    isError ? generateContent.mockRejectedValueOnce(r instanceof Error ? r : Object.assign(new Error(r.message), r)) : generateContent.mockResolvedValueOnce(r);
  }
  return { client: { models: { generateContent } }, generateContent };
};
const noSleep = vi.fn(async () => {});

beforeEach(() => {
  resetAiUsage();
  noSleep.mockClear();
});

describe("request building", () => {
  it("sends the model, system instruction, JSON mode and a JSON schema made from the Zod schema", async () => {
    const { client, generateContent } = fakeClient(okResponse());
    await callGemini({ ...call, maxTokens: 4000 }, { client, config: cfg({ geminiModel: "gemini-3.5-flash" }), sleep: noSleep });

    const req = generateContent.mock.calls[0][0];
    expect(req.model).toBe("gemini-3.5-flash");
    expect(req.contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
    expect(req.config).toMatchObject({ systemInstruction: "be brief", responseMimeType: "application/json", maxOutputTokens: 4000 });
    expect(req.config.responseJsonSchema).toMatchObject({ type: "object", required: ["answer", "score"] });
    expect(req.config.responseJsonSchema.properties.score.type).toBe("integer");
    expect(req.config.responseJsonSchema.$schema).toBeUndefined();
  });

  it("converts Claude-style image and PDF blocks into Gemini inline data", () => {
    const parts = toGeminiParts([
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "AAAA" } },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "BBBB" } },
      { type: "text", text: "Transcribe this" },
    ]);
    expect(parts).toEqual([
      { inlineData: { mimeType: "application/pdf", data: "AAAA" } },
      { inlineData: { mimeType: "image/jpeg", data: "BBBB" } },
      { text: "Transcribe this" },
    ]);
  });

  it("rejects a block it can't represent", () => {
    expect(() => toGeminiParts([{ type: "video" }])).toThrow(AiError);
  });

  it("keeps descriptions and enums in the schema", () => {
    const json: any = toGeminiSchema(z.object({ level: z.enum(["good", "poor"]).describe("how readable") }));
    expect(json.properties.level.enum).toEqual(["good", "poor"]);
    expect(json.properties.level.description).toBe("how readable");
  });
});

describe("responses", () => {
  it("returns validated data, the answering model and token usage (thinking counts as output)", async () => {
    const { client } = fakeClient(okResponse());
    const r = await callGemini(call, { client, config: cfg(), sleep: noSleep });
    expect(r).toMatchObject({ data: { answer: "hi", score: 3 }, model: "gemini-3.5-flash-lite", inputTokens: 120, outputTokens: 40, usedFallback: false });
    expect(getAiUsage()).toMatchObject({ calls: 1, inputTokens: 120, outputTokens: 40 });
  });

  it("reads the text from the candidate when the SDK text accessor is absent", async () => {
    const { client } = fakeClient(okResponse({ text: undefined, candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"answer":"x","score":1}' }] } }] }));
    expect((await callGemini(call, { client, config: cfg(), sleep: noSleep })).data).toEqual({ answer: "x", score: 1 });
  });

  it.each([
    ["safety-blocked answer", okResponse({ candidates: [{ finishReason: "SAFETY" }] }), "refused"],
    ["blocked prompt", okResponse({ text: "", promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }), "refused"],
    ["answer cut off", okResponse({ candidates: [{ finishReason: "MAX_TOKENS" }] }), "truncated"],
    ["empty answer", okResponse({ text: "" }), "invalid_output"],
    ["not JSON", okResponse({ text: "Sure! Here you go" }), "invalid_output"],
    ["wrong shape", okResponse({ text: JSON.stringify({ answer: 5, score: "x" }) }), "invalid_output"],
  ])("%s → %s", async (_name, response, kind) => {
    const { client } = fakeClient(response);
    await expect(callGemini(call, { client, config: cfg(), sleep: noSleep })).rejects.toMatchObject({ name: "AiError", kind });
  });

  it("is not configured without a Gemini key", async () => {
    await expect(callGemini(call, { config: cfg({ configured: false }), sleep: noSleep })).rejects.toMatchObject({ kind: "not_configured" });
  });
});

describe("errors and retries", () => {
  it.each([
    [{ status: 401, message: "unauthorized" }, "auth"],
    [{ status: 403, message: "PERMISSION_DENIED" }, "auth"],
    [{ status: 400, message: "API key not valid. Please pass a valid API key." }, "auth"],
    [{ status: 429, message: "RESOURCE_EXHAUSTED" }, "rate_limit"],
    [{ status: 400, message: "bad schema" }, "bad_request"],
    [{ status: 503, message: "overloaded" }, "api"],
    [{ message: "fetch failed" }, "network"],
  ])("maps %j to %s", (err, kind) => {
    expect(toGeminiError(err).kind).toBe(kind);
  });

  it("explains a retired model in plain words, unwrapping Google's JSON error body", () => {
    const body = JSON.stringify({ error: { code: 404, message: "This model models/gemini-3.5-flash-lite is no longer available to new users." } });
    const mapped = toGeminiError(new Error(body));
    expect(mapped.kind).toBe("bad_request");
    expect(mapped.message).toContain("GEMINI_MODEL");
    expect(mapped.message).toContain("no longer available");
    expect(mapped.message).not.toContain('{"error"');
  });

  it("pulls the code out of a JSON error body when the SDK gives no status", () => {
    const body = JSON.stringify({ error: { code: 429, message: "Quota exceeded for this model" } });
    expect(toGeminiError(new Error(body)).kind).toBe("rate_limit");
  });

  it("retries a rate limit with backoff and then succeeds", async () => {
    const { client, generateContent } = fakeClient({ status: 429, message: "RESOURCE_EXHAUSTED" }, { status: 503, message: "busy" }, okResponse());
    const r = await callGemini(call, { client, config: cfg(), sleep: noSleep });
    expect(r.data.answer).toBe("hi");
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(noSleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retries", async () => {
    const err = { status: 429, message: "RESOURCE_EXHAUSTED" };
    const { client, generateContent } = fakeClient(err, err, err, err);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(callGemini(call, { client, config: cfg(), sleep: noSleep })).rejects.toMatchObject({ kind: "rate_limit" });
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not retry a bad key or a bad request", async () => {
    const { client, generateContent } = fakeClient({ status: 403, message: "PERMISSION_DENIED" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(callGemini(call, { client, config: cfg(), sleep: noSleep })).rejects.toMatchObject({ kind: "auth" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("provider switch (callAi)", () => {
  it("sends the request to Gemini when Gemini is the configured provider", async () => {
    const gem = fakeClient(okResponse());
    const claude = { beta: { messages: { parse: vi.fn() } } };
    const r = await callAi(call, { client: claude, geminiClient: gem.client, config: cfg() });
    expect(r.data.answer).toBe("hi");
    expect(gem.generateContent).toHaveBeenCalledTimes(1);
    expect(claude.beta.messages.parse).not.toHaveBeenCalled();
  });

  it("sends it to Claude when Claude is the provider", async () => {
    const gem = fakeClient(okResponse());
    const parse = vi.fn().mockResolvedValue({ stop_reason: "end_turn", parsed_output: { answer: "from claude", score: 1 }, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 } });
    const r = await callAi(call, { client: { beta: { messages: { parse } } }, geminiClient: gem.client, config: getAiConfig({ ANTHROPIC_API_KEY: "sk-ant-x" }) });
    expect(r.data.answer).toBe("from claude");
    expect(gem.generateContent).not.toHaveBeenCalled();
  });

  it("describes the provider in plain words", () => {
    expect(describeProvider(cfg())).toBe("Gemini (gemini-3.5-flash-lite)");
    expect(describeProvider(getAiConfig({ ANTHROPIC_API_KEY: "k" }))).toBe("Claude (claude-opus-5-5)");
  });
});
