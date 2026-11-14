// src/lib/ai/gemini.ts
//
// Google Gemini as an alternative provider for the same three features (risk narratives, reading
// messy scans, spelling Marathi names). It takes exactly the request callClaude() takes and returns
// the same result, so nothing above it knows which provider answered.
//
// Structured output: the Zod schema is turned into a JSON Schema and Gemini is asked for
// application/json; the reply is parsed and re-validated against the schema, so a malformed answer
// is an AiError("invalid_output"), never a half-trusted object.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod/v4";
import { AiError, getAiConfig, recordAiUsage, type AiCall, type AiConfig, type AiResult } from "./claude";

// ─── Client ───

/** The small slice of the SDK we use — lets tests pass a fake. */
export interface GeminiClientLike {
  models: { generateContent(params: any): Promise<any> };
}

let singleton: { client: GoogleGenAI; key: string; timeoutMs: number } | null = null;

function geminiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

function defaultClient(cfg: AiConfig): GeminiClientLike {
  const key = geminiKey();
  if (!cfg.configured || !key) throw new AiError("not_configured", "No Gemini credential found — set GEMINI_API_KEY in .env");
  if (!singleton || singleton.key !== key || singleton.timeoutMs !== cfg.timeoutMs) {
    const baseUrl = process.env.GEMINI_BASE_URL?.trim(); // only for tests against a local stand-in
    singleton = { client: new GoogleGenAI({ apiKey: key, httpOptions: { timeout: cfg.timeoutMs, ...(baseUrl ? { baseUrl } : {}) } }), key, timeoutMs: cfg.timeoutMs };
  }
  return singleton.client as unknown as GeminiClientLike;
}

// ─── Request building ───

/** Zod schema → the JSON Schema dialect Gemini accepts. */
export function toGeminiSchema(schema: z.ZodType<any>): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Claude-style content blocks (text / image / document) → Gemini parts. */
export function toGeminiParts(content: string | unknown[]): unknown[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((block: any) => {
    if (block?.type === "text") return { text: String(block.text ?? "") };
    if ((block?.type === "image" || block?.type === "document") && block.source?.type === "base64") {
      return { inlineData: { mimeType: block.source.media_type, data: block.source.data } };
    }
    throw new AiError("bad_request", `Unsupported content block for Gemini: ${block?.type ?? typeof block}`);
  });
}

// ─── Errors ───

/** The SDK often puts Google's whole JSON error body in .message; pull out the code and the sentence. */
function unwrapApiError(e: any): { status?: number; message: string } {
  let status: number | undefined = typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : undefined;
  let message = String(e?.message ?? e);
  try {
    const body = JSON.parse(message);
    if (body?.error?.message) {
      message = String(body.error.message);
      if (typeof body.error.code === "number") status = status ?? body.error.code;
    }
  } catch {
    /* not JSON — keep the text as it is */
  }
  return { status, message };
}

export function toGeminiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const { status, message } = unwrapApiError(err);
  // a model that doesn't exist (or is no longer offered) is a configuration problem the user can fix
  if (status === 404 || /is no longer available|not found for API version|models\/.* is not found/i.test(message)) {
    return new AiError("bad_request", `Gemini model unavailable — set GEMINI_MODEL in .env. Google said: ${message.slice(0, 220)}`, status ?? 404);
  }
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)) return new AiError("auth", "The Gemini API key was rejected", status);
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) return new AiError("rate_limit", "Gemini rate limit or quota reached — try again shortly", 429);
  if (status === 400) return new AiError("bad_request", `Gemini rejected the request: ${message.slice(0, 300)}`, 400);
  if (status && status >= 500) return new AiError("api", `Gemini API error ${status}: ${message.slice(0, 300)}`, status);
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|timed out|network/i.test(message)) return new AiError("network", "Couldn't reach the Gemini API");
  return new AiError("api", message.slice(0, 300), status);
}

const RETRYABLE: ReadonlySet<string> = new Set(["rate_limit", "api", "network"]);
const BACKOFF_MS = [1000, 3000];

const BLOCKED_REASONS = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION", "IMAGE_SAFETY"]);

// ─── The call ───

export async function callGemini<T>(
  call: AiCall<T>,
  deps: { client?: GeminiClientLike; config?: AiConfig; sleep?: (ms: number) => Promise<void> } = {},
): Promise<AiResult<T>> {
  const cfg = deps.config ?? getAiConfig();
  const client = deps.client ?? defaultClient(cfg);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const request = {
    model: cfg.geminiModel,
    contents: [{ role: "user", parts: toGeminiParts(call.content) }],
    config: {
      systemInstruction: call.system,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiSchema(call.schema),
      // thinking counts toward the output limit on Gemini 2.5+, so leave generous headroom
      maxOutputTokens: call.maxTokens ?? 16_000,
    },
  };

  const started = Date.now();
  let response: any;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await client.models.generateContent(request);
      break;
    } catch (err) {
      const mapped = toGeminiError(err);
      if (RETRYABLE.has(mapped.kind) && attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      console.warn(`[ai] ${call.purpose} failed (${mapped.kind}): ${mapped.message}`);
      throw mapped;
    }
  }

  const blockReason: string | undefined = response?.promptFeedback?.blockReason;
  const candidate = response?.candidates?.[0];
  const finish: string | undefined = candidate?.finishReason;
  if (blockReason || (finish && BLOCKED_REASONS.has(finish))) {
    throw new AiError("refused", `Gemini declined this request (${blockReason ?? finish})`);
  }
  if (finish === "MAX_TOKENS") throw new AiError("truncated", "Gemini's answer was cut off before it finished");

  const text: string | undefined = typeof response?.text === "string" ? response.text : candidate?.content?.parts?.map((p: any) => p?.text ?? "").join("");
  if (!text) throw new AiError("invalid_output", "Gemini returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("invalid_output", "Gemini's answer wasn't valid JSON");
  }
  const checked = call.schema.safeParse(parsed);
  if (!checked.success) throw new AiError("invalid_output", "Gemini's answer didn't match the expected format");

  const usage = response?.usageMetadata ?? {};
  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const model: string = response?.modelVersion ?? cfg.geminiModel;
  recordAiUsage({ purpose: call.purpose, model, inputTokens, outputTokens, cacheReadTokens: usage.cachedContentTokenCount ?? 0, durationMs: Date.now() - started });

  return { data: checked.data as T, model, inputTokens, outputTokens, usedFallback: false };
}
