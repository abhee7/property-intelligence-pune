// src/modules/risk/risk.narrative.ts
//
// Optional: asks Claude to turn a computed risk report into a short plain-English summary
// plus suggested next steps.
//
// Claude never decides anything here — the score, factors and evidence are already computed
// by risk.engine. It only *explains* them, and its answer is rejected (falling back to the
// rule-based text) if it introduces a number that isn't in the data it was given.
//
// What is sent to Claude: the property title, locality and status, and the score / factor /
// evidence / flag data. No owner names, phone numbers, documents or file contents.

import { createHash } from "crypto";
import { z } from "zod/v4";
import { AiError, callClaude, getAiConfig, type ClaudeClientLike, type NarrativeMode } from "@/lib/ai/claude";
import type { RiskComputation } from "./risk.engine";

// ─── Types ───

export const narrativeSchema = z.object({
  summary: z.string().describe("3 to 5 plain sentences explaining why the property has this risk score"),
  recommended_actions: z.array(z.string()).describe("2 to 4 concrete verification steps, each under 18 words"),
});
export type NarrativeOutput = z.infer<typeof narrativeSchema>;

export interface NarrativeProperty {
  title: string;
  locality: string | null;
  status: string;
}

export interface NarrativeInput {
  property: NarrativeProperty;
  overall: { score: number; level: string; minimumFloorApplied: string | null; unverifiedPenaltyPoints: number };
  factors: { name: string; score: number; weightPercent: number; evidence: string[] }[];
  flags: { severity: string; message: string }[];
  mandatoryDocumentsNotYetVerified: string[];
}

export function buildNarrativeInput(result: RiskComputation, property: NarrativeProperty): NarrativeInput {
  return {
    property,
    overall: {
      score: result.overallScore,
      level: result.riskLevel,
      minimumFloorApplied: result.floor ? result.floor.reason : null,
      unverifiedPenaltyPoints: result.unverifiedPenalty,
    },
    factors: result.factors.map((f) => ({ name: f.name, score: f.score, weightPercent: Math.round(f.weight * 100), evidence: f.evidence })),
    flags: result.flags.map((f) => ({ severity: f.severity, message: f.message })),
    mandatoryDocumentsNotYetVerified: result.unverifiedDocuments,
  };
}

/** Fingerprint of everything the narrative is *about* — unchanged data means no new Claude call. */
export function hashNarrativeInput(input: NarrativeInput): string {
  const stable = { overall: input.overall, factors: input.factors, flags: input.flags, missing: input.mandatoryDocumentsNotYetVerified };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 16);
}

// ─── Prompt ───

export const NARRATIVE_SYSTEM_PROMPT = `You write the summary section of an automated property due-diligence report for a prospective buyer in Pune, India. You are given the report as JSON: an overall risk score, five scored factors with the evidence behind each, any red flags, and the mandatory documents not yet verified.

Rules:
- Use ONLY the data provided. Never invent facts, names, dates, amounts, case details or document contents. Any number you write must appear in the data.
- Spell out small counts as words (one, two, three) rather than digits. Quote case numbers and scores exactly as given.
- Explain WHY the score is what it is. Lead with the most important drivers: critical flags first, then the factors contributing most (score multiplied by weight).
- State plainly what has not been verified yet.
- You are not a lawyer and this is not legal or investment advice. Describe what the records show ("a court order restricts transfer"), not legal conclusions ("the title is defective"), and never advise whether to buy.
- If the score is low, say what supports that and what is still unconfirmed, without overstating certainty.
- summary: three to five sentences of plain English. No markdown, no bullet characters, no headings.
- recommended_actions: two to four concrete verification steps a buyer or agent could take, each under eighteen words, each tied to something in the data.`;

// ─── Validation: the answer must be grounded in the data ───

const MARKDOWN = /[*#`_]{1,}|^\s*[-•]\s/m;

function digitRuns(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

export function validateNarrative(output: NarrativeOutput, input: NarrativeInput): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const summary = output.summary.trim();

  if (summary.length < 80) reasons.push("summary is too short");
  if (summary.length > 1400) reasons.push("summary is too long");
  if (MARKDOWN.test(summary)) reasons.push("summary contains markdown");

  const actions = output.recommended_actions.map((a) => a.trim()).filter(Boolean);
  if (actions.length < 1 || actions.length > 4) reasons.push("expected one to four recommended actions");
  if (actions.some((a) => a.length > 200 || MARKDOWN.test(a))) reasons.push("an action is too long or contains markdown");

  // every number in the text must come from the data (the "/100" in "82/100" is allowed)
  const allowed = new Set([...digitRuns(JSON.stringify(input)), "100"]);
  const invented = [...new Set(digitRuns([summary, ...actions].join(" ")).filter((n) => !allowed.has(n)))];
  if (invented.length) reasons.push(`mentions numbers not in the report: ${invented.join(", ")}`);

  return { ok: reasons.length === 0, reasons };
}

export function formatNarrative(output: NarrativeOutput): string {
  const actions = output.recommended_actions.map((a) => a.trim()).filter(Boolean);
  return actions.length ? `${output.summary.trim()}\n\nSuggested next steps:\n${actions.map((a) => `• ${a}`).join("\n")}` : output.summary.trim();
}

// ─── When to call Claude ───

export type NarrativeTrigger = "manual" | "event" | "bulk";

/**
 * - keep      the stored AI narrative is still about exactly this data
 * - generate  ask Claude
 * - rules     use the rule-based text
 *
 * manual = a person asked (button / script); event = a document, match or property changed
 * (only when AI_NARRATIVES=auto); bulk = recalculating everything (never calls Claude).
 */
export function decideNarrative(
  existing: { narrativeSource: string | null; inputsHash: string | null } | null,
  hash: string,
  opts: { trigger: NarrativeTrigger; mode: NarrativeMode; configured: boolean },
): "keep" | "generate" | "rules" {
  if (existing?.narrativeSource === "ai" && existing.inputsHash === hash) return "keep";
  if (!opts.configured || opts.mode === "off") return "rules";
  if (opts.trigger === "manual") return "generate";
  if (opts.trigger === "event" && opts.mode === "auto") return "generate";
  return "rules";
}

// ─── The call ───

export type NarrativeOutcome = { ok: true; text: string; model: string } | { ok: false; reason: string; kind: string };

export async function generateAiNarrative(
  result: RiskComputation,
  property: NarrativeProperty,
  deps: { client?: ClaudeClientLike } = {},
): Promise<NarrativeOutcome> {
  const cfg = getAiConfig();
  const input = buildNarrativeInput(result, property);

  try {
    const { data, model } = await callClaude(
      {
        purpose: "narrative",
        system: NARRATIVE_SYSTEM_PROMPT,
        content: `Property risk report:\n${JSON.stringify(input, null, 2)}`,
        schema: narrativeSchema,
        effort: "low",
        maxTokens: 8_000,
      },
      { client: deps.client, config: cfg },
    );

    const check = validateNarrative(data, input);
    if (!check.ok) {
      console.warn(`[ai] narrative rejected (${check.reasons.join("; ")})`);
      return { ok: false, kind: "ungrounded", reason: `Claude's summary was discarded: ${check.reasons.join("; ")}` };
    }
    return { ok: true, text: formatNarrative(data), model };
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("api", String(err));
    return { ok: false, kind: e.kind, reason: e.message };
  }
}
