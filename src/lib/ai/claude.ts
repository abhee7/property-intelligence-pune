// src/lib/ai/claude.ts
//
// The one place PropIntel talks to the Claude API. Everything AI-powered (risk narratives,
// reading messy scans) goes through callClaude(), so configuration, structured output,
// refusals, error mapping and usage logging live here and nowhere else.
//
// AI is strictly OPTIONAL: with no key configured, or on any failure, callers fall back to
// the rule-based narrative / Tesseract. Nothing in the app depends on a Claude call succeeding.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";

// ─── Configuration ───

export type NarrativeMode = "off" | "manual" | "auto";
export type ScanReadingMode = "off" | "fallback" | "always";
export type TransliterationMode = "off" | "auto";

export interface AiConfig {
  configured: boolean; // a Claude credential is present in the environment
  model: string;
  narratives: NarrativeMode;
  scanReading: ScanReadingMode;
  transliteration: TransliterationMode;
  refusalFallbacks: boolean;
  timeoutMs: number;
}

export const DEFAULT_MODEL = "claude-opus-5-5";

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes((value ?? "").trim().toLowerCase()) ? ((value as string).trim().toLowerCase() as T) : fallback;

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const configured = !!(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim());
  return {
    configured,
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    // narratives: "manual" (default) = only when someone asks; "auto" = also after document/match events
    narratives: oneOf(env.AI_NARRATIVES, ["off", "manual", "auto"] as const, "manual"),
    // scan reading: "fallback" (default) = only when Tesseract isn't confident; "always" = every document
    scanReading: oneOf(env.AI_SCAN_READING, ["off", "fallback", "always"] as const, "fallback"),
    // transliteration: "auto" (default) = ask Claude to spell Marathi names/places in English when a
    // document's script differs from the record; the rule-based transliterator always runs regardless
    transliteration: oneOf(env.AI_TRANSLITERATION, ["off", "auto"] as const, "auto"),
    refusalFallbacks: (env.AI_REFUSAL_FALLBACKS ?? "on").trim().toLowerCase() !== "off",
    timeoutMs: Number(env.AI_TIMEOUT_MS) > 0 ? Number(env.AI_TIMEOUT_MS) : 90_000,
  };
}

export const isAiConfigured = () => getAiConfig().configured;

// ─── Errors ───

export type AiErrorKind =
  | "not_configured"
  | "auth" // bad / expired key
  | "rate_limit"
  | "refused" // safety classifier declined the request
  | "truncated" // hit max_tokens before finishing
  | "invalid_output" // response didn't parse against the schema
  | "bad_request"
  | "network"
  | "api";

export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string, public status?: number) {
    super(message);
    this.name = "AiError";
  }
}

export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new AiError("auth", "The Claude API key was rejected", (err as any).status);
  if (err instanceof Anthropic.RateLimitError) return new AiError("rate_limit", "Claude API rate limit reached — try again shortly", 429);
  if (err instanceof Anthropic.BadRequestError) return new AiError("bad_request", `Claude API rejected the request: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new AiError("network", "Couldn't reach the Claude API");
  if (err instanceof Anthropic.APIError) return new AiError("api", `Claude API error ${err.status}: ${err.message}`, err.status);
  return new AiError("api", err instanceof Error ? err.message : String(err));
}

// ─── Client ───

/** The small slice of the SDK we use — lets tests pass a fake. */
export interface ClaudeClientLike {
  beta: { messages: { parse(params: any, options?: any): Promise<any> } };
}

let singleton: { client: Anthropic; timeoutMs: number } | null = null;

function defaultClient(cfg: AiConfig): ClaudeClientLike {
  if (!cfg.configured) throw new AiError("not_configured", "No Claude credential found — set ANTHROPIC_API_KEY in .env");
  if (!singleton || singleton.timeoutMs !== cfg.timeoutMs) {
    // credentials come from the environment (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN)
    singleton = { client: new Anthropic({ timeout: cfg.timeoutMs, maxRetries: 2 }), timeoutMs: cfg.timeoutMs };
  }
  return singleton.client as unknown as ClaudeClientLike;
}

// ─── Usage tracking (in-process; for logs and the ai:check script) ───

export interface AiUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  fallbacks: number;
}
const usage: AiUsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, fallbacks: 0 };
export const getAiUsage = (): AiUsageTotals => ({ ...usage });
export const resetAiUsage = () => Object.assign(usage, { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, fallbacks: 0 });

// ─── The call ───

export interface ClaudeCall<T> {
  purpose: string; // for logs: "narrative", "scan-read"…
  system: string;
  content: string | unknown[]; // user message: text, or content blocks (images / documents)
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface ClaudeResult<T> {
  data: T;
  model: string; // the model that actually answered (may differ if a refusal fell back)
  inputTokens: number;
  outputTokens: number;
  usedFallback: boolean;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export async function callClaude<T>(call: ClaudeCall<T>, deps: { client?: ClaudeClientLike; config?: AiConfig } = {}): Promise<ClaudeResult<T>> {
  const cfg = deps.config ?? getAiConfig();
  const client = deps.client ?? defaultClient(cfg);

  const build = (withFallbacks: boolean) => ({
    model: cfg.model,
    // thinking is on by default and counts toward max_tokens, so leave generous headroom
    max_tokens: call.maxTokens ?? 16_000,
    system: call.system,
    messages: [{ role: "user", content: call.content }],
    output_config: { effort: call.effort ?? "medium", format: zodOutputFormat(call.schema) },
    // On a safety-classifier decline the API re-runs the request on a fallback model server-side
    ...(withFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" } : {}),
  });

  const started = Date.now();
  let response: any;
  let withFallbacks = cfg.refusalFallbacks;

  for (let attempt = 0; ; attempt++) {
    try {
      response = await client.beta.messages.parse(build(withFallbacks));
      break;
    } catch (err) {
      const mapped = toAiError(err);
      // If the fallback beta isn't accepted for this account/model, retry once without it
      // rather than failing the whole feature.
      if (withFallbacks && attempt === 0 && mapped.kind === "bad_request" && /fallback|beta/i.test(mapped.message)) {
        withFallbacks = false;
        continue;
      }
      console.warn(`[ai] ${call.purpose} failed (${mapped.kind}): ${mapped.message}`);
      throw mapped;
    }
  }

  if (response.stop_reason === "refusal") {
    throw new AiError("refused", `Claude declined this request${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`);
  }
  if (response.stop_reason === "max_tokens") throw new AiError("truncated", "Claude's answer was cut off before it finished");
  if (response.parsed_output == null) throw new AiError("invalid_output", "Claude's answer didn't match the expected format");

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const usedFallback = (response.usage?.iterations ?? []).some((i: any) => i?.type === "fallback_message");

  usage.calls++;
  usage.inputTokens += inputTokens;
  usage.outputTokens += outputTokens;
  usage.cacheReadTokens += response.usage?.cache_read_input_tokens ?? 0;
  if (usedFallback) usage.fallbacks++;
  console.info(`[ai] ${call.purpose}: ${response.model ?? cfg.model} · ${inputTokens} in / ${outputTokens} out · ${Date.now() - started} ms${usedFallback ? " · served by fallback model" : ""}`);

  return { data: response.parsed_output as T, model: response.model ?? cfg.model, inputTokens, outputTokens, usedFallback };
}
