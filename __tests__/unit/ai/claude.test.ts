// __tests__/unit/ai/claude.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { AiError, callClaude, getAiConfig, getAiUsage, resetAiUsage, toAiError, DEFAULT_MODEL, type AiConfig } from "@/lib/ai/claude";

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({
  configured: true, provider: "claude", model: DEFAULT_MODEL, geminiModel: "gemini-3.5-flash-lite", narratives: "manual", scanReading: "fallback", transliteration: "auto", refusalFallbacks: true, timeoutMs: 90_000, ...over,
});

const schema = z.object({ answer: z.string() });
const call = { purpose: "test", system: "sys", content: "hello", schema };

const okResponse = (over: Record<string, unknown> = {}) => ({
  stop_reason: "end_turn",
  parsed_output: { answer: "hi" },
  model: DEFAULT_MODEL,
  usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 0 },
  ...over,
});

const fakeClient = (...responses: unknown[]) => {
  const parse = vi.fn();
  for (const r of responses) r instanceof Error ? parse.mockRejectedValueOnce(r) : parse.mockResolvedValueOnce(r);
  return { client: { beta: { messages: { parse } } }, parse };
};

describe("getAiConfig", () => {
  it("is unconfigured without a credential and defaults sensibly", () => {
    expect(getAiConfig({})).toMatchObject({
      configured: false, model: "claude-opus-5-5", narratives: "manual", scanReading: "fallback", transliteration: "auto", refusalFallbacks: true,
    });
  });
  it("detects an API key or auth token, ignoring blanks", () => {
    expect(getAiConfig({ ANTHROPIC_API_KEY: "sk-ant-x" }).configured).toBe(true);
    expect(getAiConfig({ ANTHROPIC_AUTH_TOKEN: "tok" }).configured).toBe(true);
    expect(getAiConfig({ ANTHROPIC_API_KEY: "   " }).configured).toBe(false);
  });
  it("reads modes and the model override, falling back on invalid values", () => {
    const c = getAiConfig({ AI_NARRATIVES: "AUTO", AI_SCAN_READING: "always", ANTHROPIC_MODEL: "claude-sonnet-5-5", AI_REFUSAL_FALLBACKS: "off" });
    expect(c).toMatchObject({ narratives: "auto", scanReading: "always", model: "claude-sonnet-5-5", refusalFallbacks: false });
    expect(getAiConfig({ AI_NARRATIVES: "banana", AI_SCAN_READING: "" })).toMatchObject({ narratives: "manual", scanReading: "fallback" });
    expect(getAiConfig({ AI_TRANSLITERATION: "off" }).transliteration).toBe("off");
    expect(getAiConfig({ AI_TRANSLITERATION: "banana" }).transliteration).toBe("auto");
  });

  describe("provider choice", () => {
    it("is Claude by default and when only a Claude key is set", () => {
      expect(getAiConfig({})).toMatchObject({ provider: "claude", configured: false });
      expect(getAiConfig({ ANTHROPIC_API_KEY: "sk-ant-x" })).toMatchObject({ provider: "claude", configured: true });
    });
    it("uses Gemini automatically when only a Gemini key is set", () => {
      expect(getAiConfig({ GEMINI_API_KEY: "AIza-x" })).toMatchObject({ provider: "gemini", configured: true, geminiModel: "gemini-3.5-flash-lite" });
      expect(getAiConfig({ GOOGLE_API_KEY: "AIza-y" })).toMatchObject({ provider: "gemini", configured: true });
    });
    it("prefers Claude when both keys are set, unless told otherwise", () => {
      const both = { ANTHROPIC_API_KEY: "sk-ant-x", GEMINI_API_KEY: "AIza-x" };
      expect(getAiConfig(both).provider).toBe("claude");
      expect(getAiConfig({ ...both, AI_PROVIDER: "gemini" })).toMatchObject({ provider: "gemini", configured: true });
    });
    it("reports not configured when the forced provider has no key", () => {
      expect(getAiConfig({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "sk-ant-x" })).toMatchObject({ provider: "gemini", configured: false });
      expect(getAiConfig({ AI_PROVIDER: "claude", GEMINI_API_KEY: "AIza-x" })).toMatchObject({ provider: "claude", configured: false });
    });
    it("ignores blank keys, reads the Gemini model override and falls back on a bad provider value", () => {
      expect(getAiConfig({ GEMINI_API_KEY: "   " }).configured).toBe(false);
      expect(getAiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.5-flash" }).geminiModel).toBe("gemini-3.5-flash");
      expect(getAiConfig({ GEMINI_API_KEY: "k", AI_PROVIDER: "banana" }).provider).toBe("gemini");
    });
  });
});

describe("callClaude", () => {
  beforeEach(() => resetAiUsage());

  it("returns the parsed output and records usage", async () => {
    const { client, parse } = fakeClient(okResponse());
    const r = await callClaude(call, { client, config: cfg() });

    expect(r.data).toEqual({ answer: "hi" });
    expect(r).toMatchObject({ model: DEFAULT_MODEL, inputTokens: 100, outputTokens: 40, usedFallback: false });
    expect(getAiUsage()).toMatchObject({ calls: 1, inputTokens: 100, outputTokens: 40 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("sends the model, system prompt, effort, a JSON-schema format and no sampling params", async () => {
    const { client, parse } = fakeClient(okResponse());
    await callClaude({ ...call, effort: "low", maxTokens: 5000 }, { client, config: cfg({ model: "claude-sonnet-5-5" }) });

    const sent = parse.mock.calls[0][0];
    expect(sent).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 5000, system: "sys", messages: [{ role: "user", content: "hello" }] });
    expect(sent.output_config.effort).toBe("low");
    expect(sent.output_config.format.type).toBe("json_schema");
    for (const banned of ["temperature", "top_p", "top_k", "thinking"]) expect(sent).not.toHaveProperty(banned);
  });

  it("opts into server-side refusal fallbacks by default, and can switch them off", async () => {
    const on = fakeClient(okResponse());
    await callClaude(call, { client: on.client, config: cfg() });
    expect(on.parse.mock.calls[0][0]).toMatchObject({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });

    const off = fakeClient(okResponse());
    await callClaude(call, { client: off.client, config: cfg({ refusalFallbacks: false }) });
    expect(off.parse.mock.calls[0][0]).not.toHaveProperty("fallbacks");
    expect(off.parse.mock.calls[0][0]).not.toHaveProperty("betas");
  });

  it("retries once without fallbacks if the beta isn't accepted", async () => {
    const rejected = new Anthropic.BadRequestError(400, { error: { message: "unknown beta: server-side-fallback" } }, "400 unknown beta: server-side-fallback", new Headers());
    const { client, parse } = fakeClient(rejected, okResponse());
    const r = await callClaude(call, { client, config: cfg() });

    expect(r.data.answer).toBe("hi");
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0][0]).toHaveProperty("fallbacks");
    expect(parse.mock.calls[1][0]).not.toHaveProperty("fallbacks");
  });

  it("does not retry other bad requests", async () => {
    const rejected = new Anthropic.BadRequestError(400, { error: { message: "image too large" } }, "400 image too large", new Headers());
    const { client, parse } = fakeClient(rejected, okResponse());
    await expect(callClaude(call, { client, config: cfg() })).rejects.toMatchObject({ kind: "bad_request" });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("reports when a fallback model served the answer", async () => {
    const { client } = fakeClient(okResponse({ usage: { input_tokens: 1, output_tokens: 1, iterations: [{ type: "message" }, { type: "fallback_message" }] } }));
    const r = await callClaude(call, { client, config: cfg() });
    expect(r.usedFallback).toBe(true);
    expect(getAiUsage().fallbacks).toBe(1);
  });

  it.each([
    [{ stop_reason: "refusal", stop_details: { category: "cyber" }, parsed_output: null }, "refused"],
    [{ stop_reason: "max_tokens", parsed_output: null }, "truncated"],
    [{ parsed_output: null }, "invalid_output"],
  ])("maps %j to %s", async (over, kind) => {
    const { client } = fakeClient(okResponse(over));
    await expect(callClaude(call, { client, config: cfg() })).rejects.toMatchObject({ name: "AiError", kind });
  });

  it("fails clearly, without a network call, when no credential is configured", async () => {
    await expect(callClaude(call, { config: cfg({ configured: false }) })).rejects.toMatchObject({ kind: "not_configured" });
  });
});

describe("toAiError", () => {
  const h = new Headers();
  it("maps SDK errors to stable kinds", () => {
    expect(toAiError(new Anthropic.AuthenticationError(401, { error: { message: "bad key" } }, "401 bad key", h)).kind).toBe("auth");
    expect(toAiError(new Anthropic.RateLimitError(429, { error: { message: "slow down" } }, "429", h)).kind).toBe("rate_limit");
    expect(toAiError(new Anthropic.InternalServerError(500, { error: { message: "oops" } }, "500", h)).kind).toBe("api");
    expect(toAiError(new Error("boom")).kind).toBe("api");
  });
  it("passes an AiError through unchanged", () => {
    const e = new AiError("refused", "no");
    expect(toAiError(e)).toBe(e);
  });
});
