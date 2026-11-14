// src/lib/ai/provider.ts
//
// The one entry point the features use. It looks at the configuration and sends the request to
// Claude or to Gemini; both return the same AiResult, so risk narratives, scan reading and name
// spelling work the same way whichever key you provide.
//
//   AI_PROVIDER=auto (default)  Claude if ANTHROPIC_API_KEY is set, otherwise Gemini if GEMINI_API_KEY is
//   AI_PROVIDER=claude|gemini   force one

import { callClaude, getAiConfig, type AiCall, type AiConfig, type AiResult, type ClaudeClientLike } from "./claude";
import { callGemini, type GeminiClientLike } from "./gemini";

export interface AiDeps {
  /** test seams: a fake client for the provider that will be used */
  client?: ClaudeClientLike;
  geminiClient?: GeminiClientLike;
  config?: AiConfig;
}

export async function callAi<T>(call: AiCall<T>, deps: AiDeps = {}): Promise<AiResult<T>> {
  const config = deps.config ?? getAiConfig();
  if (config.provider === "gemini") return callGemini(call, { client: deps.geminiClient, config });
  return callClaude(call, { client: deps.client, config });
}

/** "Claude (claude-opus-5-5)" / "Gemini (gemini-2.5-flash)" — for logs and scripts. */
export function describeProvider(config: AiConfig = getAiConfig()): string {
  return config.provider === "gemini" ? `Gemini (${config.geminiModel})` : `Claude (${config.model})`;
}

/** What to tell a person when AI is switched on in principle but no key is set. */
export const NO_KEY_HINT = "No AI key is configured — add GEMINI_API_KEY (or ANTHROPIC_API_KEY) to .env";
