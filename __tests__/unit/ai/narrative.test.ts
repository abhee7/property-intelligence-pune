// __tests__/unit/ai/narrative.test.ts

import { describe, it, expect, vi } from "vitest";
import { computeRisk, type RiskInputs } from "@/modules/risk/risk.engine";
import {
  buildNarrativeInput, hashNarrativeInput, validateNarrative, formatNarrative, decideNarrative,
  generateAiNarrative, NARRATIVE_SYSTEM_PROMPT, type NarrativeOutput,
} from "@/modules/risk/risk.narrative";

const MANDATORY = [
  { slug: "title-deed", name: "Title deed" },
  { slug: "7-12-extract", name: "7/12 extract" },
];

const stayOrderInputs = (): RiskInputs => ({
  property: { status: "FLAGGED", surveyNumber: "317/16", hasOwner: true },
  courtCases: [{ caseNumber: "RCA/1623/2023", caseStatus: "ACTIVE", linkType: "BOUNDARY_DISPUTE", impactScore: 0.38, nextHearingDate: null, hasStayOrder: true, affectsTitle: true }],
  news: [],
  mandatoryDocTypes: MANDATORY,
  documents: [],
  matches: [],
});

const result = computeRisk(stayOrderInputs());
const property = { title: "4 BHK Flat in Panchshil Eon Waterfront, Kharadi", locality: "Kharadi", status: "FLAGGED" };
const input = buildNarrativeInput(result, property);

const good: NarrativeOutput = {
  summary:
    `This property scores ${result.overallScore} out of 100 and is rated ${result.riskLevel}. The main driver is an active case, RCA/1623/2023, ` +
    "in which a stay order is in force, so the records show a court order restricting transfer. No title deed or 7/12 extract has been verified yet, " +
    "which leaves the ownership position unconfirmed.",
  recommended_actions: ["Ask a lawyer to check case RCA/1623/2023 at the court.", "Obtain and upload the 7/12 extract and title deed."],
};

describe("buildNarrativeInput", () => {
  it("carries the score, factors, evidence, flags and unverified documents", () => {
    expect(input.overall).toMatchObject({ score: result.overallScore, level: result.riskLevel, minimumFloorApplied: "active stay order" });
    expect(input.factors).toHaveLength(5);
    expect(input.factors.find((f) => f.name === "Legal exposure")?.evidence.join(" ")).toContain("RCA/1623/2023");
    expect(input.flags[0]).toMatchObject({ severity: "critical" });
    expect(input.mandatoryDocumentsNotYetVerified).toEqual(["Title deed", "7/12 extract"]);
  });

  it("sends no personal data — only title, locality and status describe the property", () => {
    expect(Object.keys(input.property).sort()).toEqual(["locality", "status", "title"]);
    const sent = JSON.stringify(input);
    expect(sent).not.toMatch(/@/); // no email addresses
    expect(sent).not.toMatch(/\+?\d{10}/); // no phone numbers
    expect(sent).not.toMatch(/"(ownerName|owner|phone|email|firstName|lastName)"/); // no personal-data fields
  });
});

describe("hashNarrativeInput", () => {
  it("is stable for identical data and ignores the property header", () => {
    expect(hashNarrativeInput(input)).toBe(hashNarrativeInput(buildNarrativeInput(computeRisk(stayOrderInputs()), { ...property, title: "Renamed" })));
    expect(hashNarrativeInput(input)).toMatch(/^[a-f0-9]{16}$/);
  });
  it("changes when the evidence changes", () => {
    const changed = stayOrderInputs();
    changed.courtCases[0].caseStatus = "DISPOSED";
    expect(hashNarrativeInput(buildNarrativeInput(computeRisk(changed), property))).not.toBe(hashNarrativeInput(input));
  });
});

describe("validateNarrative — the answer must be grounded in the data", () => {
  it("accepts a faithful narrative", () => {
    expect(validateNarrative(good, input)).toEqual({ ok: true, reasons: [] });
  });

  it("rejects a number that is not in the report", () => {
    const bad = { ...good, summary: good.summary + " Roughly 14 buyers have already pulled out of similar deals." };
    const v = validateNarrative(bad, input);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toContain("14");
  });

  it("rejects an invented number inside a recommended action", () => {
    const v = validateNarrative({ ...good, recommended_actions: ["Wait 90 days before paying any token amount."] }, input);
    expect(v.ok).toBe(false);
  });

  it("allows '/100' and numbers copied from the data", () => {
    const v = validateNarrative({ ...good, summary: good.summary + ` The score is ${result.overallScore}/100.` }, input);
    expect(v.ok).toBe(true);
  });

  it.each([
    ["markdown", { ...good, summary: "**" + good.summary + "**" }],
    ["too short", { ...good, summary: "Risky." }],
    ["no actions", { ...good, recommended_actions: [] }],
    ["too many actions", { ...good, recommended_actions: ["a1", "a2", "a3", "a4", "a5"] }],
  ])("rejects %s", (_name, bad) => {
    expect(validateNarrative(bad as NarrativeOutput, input).ok).toBe(false);
  });
});

describe("formatNarrative", () => {
  it("appends the suggested steps as a list", () => {
    const text = formatNarrative(good);
    expect(text.startsWith(good.summary)).toBe(true);
    expect(text).toContain("Suggested next steps:\n• Ask a lawyer");
  });
});

describe("decideNarrative", () => {
  const on = { mode: "manual" as const, configured: true };
  it("keeps a Claude narrative while the data is unchanged — no second call", () => {
    expect(decideNarrative({ narrativeSource: "ai", inputsHash: "abc" }, "abc", { trigger: "manual", ...on })).toBe("keep");
    expect(decideNarrative({ narrativeSource: "ai", inputsHash: "abc" }, "abc", { trigger: "bulk", ...on })).toBe("keep");
  });
  it("regenerates on request when the data changed", () => {
    expect(decideNarrative({ narrativeSource: "ai", inputsHash: "old" }, "new", { trigger: "manual", ...on })).toBe("generate");
    expect(decideNarrative(null, "x", { trigger: "manual", ...on })).toBe("generate");
  });
  it("never calls Claude for a rules-only row unless asked, and never in bulk", () => {
    expect(decideNarrative({ narrativeSource: "rules", inputsHash: "x" }, "x", { trigger: "event", ...on })).toBe("rules");
    expect(decideNarrative(null, "x", { trigger: "bulk", mode: "auto", configured: true })).toBe("rules");
  });
  it("calls on events only in auto mode", () => {
    expect(decideNarrative(null, "x", { trigger: "event", mode: "auto", configured: true })).toBe("generate");
    expect(decideNarrative(null, "x", { trigger: "event", mode: "manual", configured: true })).toBe("rules");
  });
  it("falls back to the rules when AI is off or not configured, even when asked", () => {
    expect(decideNarrative(null, "x", { trigger: "manual", mode: "off", configured: true })).toBe("rules");
    expect(decideNarrative(null, "x", { trigger: "manual", mode: "manual", configured: false })).toBe("rules");
  });
});

describe("generateAiNarrative", () => {
  const clientReturning = (parsed: unknown, extra: Record<string, unknown> = {}) => ({
    beta: { messages: { parse: vi.fn().mockResolvedValue({ stop_reason: "end_turn", parsed_output: parsed, model: "claude-opus-5-5", usage: { input_tokens: 900, output_tokens: 250 }, ...extra }) } },
  });

  it("returns the formatted narrative and sends only the report data", async () => {
    const client = clientReturning(good);
    const out = await generateAiNarrative(result, property, { client });

    expect(out).toMatchObject({ ok: true, model: "claude-opus-5-5" });
    expect(out.ok && out.text).toContain("RCA/1623/2023");

    const sent = client.beta.messages.parse.mock.calls[0][0];
    expect(sent.system).toBe(NARRATIVE_SYSTEM_PROMPT);
    expect(sent.messages[0].content).toContain("RCA/1623/2023");
    expect(sent.output_config.effort).toBe("low");
  });

  it("discards an ungrounded answer instead of storing it", async () => {
    const out = await generateAiNarrative(result, property, { client: clientReturning({ ...good, summary: good.summary + " Prices here rose 22% last year." }) });
    expect(out).toMatchObject({ ok: false, kind: "ungrounded" });
  });

  it("reports a refusal without throwing", async () => {
    const out = await generateAiNarrative(result, property, { client: clientReturning(null, { stop_reason: "refusal" }) });
    expect(out).toMatchObject({ ok: false, kind: "refused" });
  });

  it("reports API failures without throwing", async () => {
    const client = { beta: { messages: { parse: vi.fn().mockRejectedValue(new Error("network down")) } } };
    const out = await generateAiNarrative(result, property, { client });
    expect(out).toMatchObject({ ok: false, kind: "api" });
  });

  it("the system prompt forbids legal advice and invented facts", () => {
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/not a lawyer/i);
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/never advise whether to buy/i);
  });
});
