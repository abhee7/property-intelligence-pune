// src/modules/risk/risk.engine.ts
//
// Pure, deterministic risk scoring. Facts about a property go in, a 0–100 score
// (higher = riskier) with the evidence behind every point comes out.
// No database access here — see risk.service.ts for that.
//
// Five factors (names match RiskFactorDefinition rows):
//   Title clarity · Legal exposure · Document authenticity · Ownership stability · News sentiment
// Overall = weighted average of the factors
//           + a small "unverified" penalty when mandatory documents aren't verified
//           raised to a floor when a hard red flag exists (stay order, fraud case, confirmed duplicate).

// ─── Types ───

export type RiskLevel = "MINIMAL" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface RiskCourtCase {
  caseNumber: string;
  caseStatus: string;
  linkType: string | null;
  impactScore: number | null; // 0..1
  nextHearingDate: Date | null;
  hasStayOrder: boolean;
  affectsTitle: boolean;
}

export interface RiskNewsMention {
  headline: string;
  sentiment: string | null; // POSITIVE | NEUTRAL | NEGATIVE
  sentimentScore: number | null; // -1..1
  relevanceScore: number; // 0..1
}

export interface RiskDocument {
  name: string;
  typeSlug: string;
  typeName: string;
  requiresOcr: boolean;
  ocrStatus: string;
  verification: null | {
    overall: string;
    checks: { field: string; label: string; status: string }[];
    kindMismatch: boolean;
    pointsToOtherProperty: boolean;
  };
}

export interface RiskMatch {
  matchType: string; // exact_duplicate | likely_duplicate | possible_match | conflict
  status: string; // pending | confirmed (dismissed matches are excluded before this point)
}

export interface RiskInputs {
  property: { status: string; surveyNumber: string | null; hasOwner: boolean };
  courtCases: RiskCourtCase[];
  news: RiskNewsMention[];
  mandatoryDocTypes: { slug: string; name: string }[];
  documents: RiskDocument[];
  matches: RiskMatch[];
  now?: Date;
}

export interface FactorResult {
  key: FactorKey;
  name: string;
  score: number; // 0..100
  weight: number;
  evidence: string[];
  explanation: string;
}

export interface RiskFlag {
  code: string;
  severity: "critical" | "high" | "medium";
  message: string;
}

export interface RiskComputation {
  overallScore: number;
  riskLevel: RiskLevel;
  weightedScore: number; // before penalty / floor
  unverifiedPenalty: number;
  unverifiedDocuments: string[]; // mandatory documents with no verified copy on file
  floor: { score: number; reason: string } | null;
  factors: FactorResult[];
  flags: RiskFlag[];
  narrative: string;
}

export type FactorKey = "title" | "legal" | "documents" | "ownership" | "news";

export const FACTOR_NAMES: Record<FactorKey, string> = {
  title: "Title clarity",
  legal: "Legal exposure",
  documents: "Document authenticity",
  ownership: "Ownership stability",
  news: "News sentiment",
};

export const DEFAULT_FACTOR_WEIGHTS: Record<FactorKey, number> = {
  title: 0.3,
  legal: 0.25,
  documents: 0.2,
  ownership: 0.15,
  news: 0.1,
};

const MAX_UNVERIFIED_PENALTY = 15;

// ─── Helpers ───

export function levelForScore(score: number): RiskLevel {
  if (score <= 15) return "MINIMAL";
  if (score <= 35) return "LOW";
  if (score <= 55) return "MODERATE";
  if (score <= 75) return "HIGH";
  return "CRITICAL";
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

class Points {
  total = 0;
  evidence: string[] = [];
  add(points: number, message: string) {
    this.total += points;
    this.evidence.push(message);
  }
  note(message: string) {
    this.evidence.push(message);
  }
  get score() {
    return Math.round(clamp(this.total));
  }
}

const CLOSED_STATUS = /disposed|closed|dismissed|withdrawn|decided|settled/i;
const isActive = (c: RiskCourtCase) => !CLOSED_STATUS.test(c.caseStatus);

const CASE_TYPE_POINTS: Record<string, number> = { FRAUD: 45, TITLE_DISPUTE: 35, BOUNDARY_DISPUTE: 25 };
const caseLabel = (c: RiskCourtCase) => `${(c.linkType || "property").replace(/_/g, " ").toLowerCase()} case ${c.caseNumber}`;

const isTitleDoc = (d: RiskDocument) => /7-12|712|title/.test(d.typeSlug);
const isEncumbranceDoc = (d: RiskDocument) => /encumbrance/.test(d.typeSlug);

const checkStatus = (d: RiskDocument, field: string) => d.verification?.checks.find((c) => c.field === field)?.status;

// ─── Factors ───

function legalExposure(i: RiskInputs): Omit<FactorResult, "weight"> {
  const p = new Points();
  const now = (i.now ?? new Date()).getTime();
  const active = i.courtCases.filter(isActive);
  const closed = i.courtCases.filter((c) => !isActive(c));

  for (const c of active) {
    const base = CASE_TYPE_POINTS[c.linkType || ""] ?? 20;
    const impact = c.impactScore ?? 0.5;
    p.add(Math.round(base * (0.6 + 0.4 * impact)), `Active ${caseLabel(c)}${c.impactScore != null ? ` (impact ${Math.round(impact * 100)}%)` : ""}`);
  }
  const stay = active.find((c) => c.hasStayOrder);
  if (stay) p.add(25, `Stay order in force (${stay.caseNumber})`);

  const soon = active.find((c) => c.nextHearingDate && c.nextHearingDate.getTime() - now > 0 && c.nextHearingDate.getTime() - now < 30 * 86400000);
  if (soon) p.add(5, `Hearing due within 30 days (${soon.caseNumber})`);

  if (closed.length) p.add(Math.min(12, closed.length * 4), `${closed.length} disposed case${closed.length > 1 ? "s" : ""} on record`);
  if (!i.courtCases.length) p.note("No court cases linked to this property");

  return {
    key: "legal",
    name: FACTOR_NAMES.legal,
    score: p.score,
    evidence: p.evidence,
    explanation: active.length
      ? `${active.length} active court case${active.length > 1 ? "s" : ""} linked${stay ? ", including a stay order" : ""}.`
      : closed.length
        ? "Only disposed cases on record."
        : "No litigation found.",
  };
}

function titleClarity(i: RiskInputs): Omit<FactorResult, "weight"> {
  const p = new Points();

  if (!i.documents.some(isTitleDoc)) p.add(35, "No 7/12 extract or title deed on file");
  if (!i.documents.some(isEncumbranceDoc)) p.add(10, "No encumbrance certificate on file");
  if (!i.property.surveyNumber) p.add(20, "Property has no survey number");

  const titleCase = i.courtCases.find((c) => isActive(c) && (c.linkType === "TITLE_DISPUTE" || c.affectsTitle));
  if (titleCase) p.add(30, `Title contested in ${caseLabel(titleCase)}`);
  if (i.courtCases.some((c) => isActive(c) && c.hasStayOrder && c.affectsTitle)) p.add(20, "Court order restricts transfer of title");

  for (const m of i.matches) {
    const confirmed = m.status === "confirmed";
    if (m.matchType === "conflict") p.add(confirmed ? 40 : 25, `${confirmed ? "Confirmed" : "Possible"} ownership conflict — same survey number, different owner`);
    else if (m.matchType === "exact_duplicate" || m.matchType === "likely_duplicate")
      p.add(confirmed ? 40 : 20, `${confirmed ? "Confirmed" : "Possible"} duplicate listing of this survey number`);
    else if (m.matchType === "possible_match" && !confirmed) p.add(5, "Resembles another property record");
  }

  let surveyMismatches = 0;
  for (const d of i.documents) {
    if (checkStatus(d, "surveyNumber") === "mismatch") {
      surveyMismatches++;
      p.add(surveyMismatches === 1 ? 25 : 10, `Survey number in "${d.name}" doesn't match the property record`);
    }
  }

  if (p.total === 0) p.note("Title documents on file and no conflicts found");
  return {
    key: "title",
    name: FACTOR_NAMES.title,
    score: p.score,
    evidence: p.evidence,
    explanation: p.score <= 15 ? "Title looks clear." : p.score <= 45 ? "Title not fully established." : "Title has significant open questions.",
  };
}

function documentAuthenticity(i: RiskInputs): Omit<FactorResult, "weight"> {
  const p = new Points();

  if (!i.documents.length) {
    p.add(75, "No documents uploaded — nothing to verify");
    return { key: "documents", name: FACTOR_NAMES.documents, score: p.score, evidence: p.evidence, explanation: "No documents have been verified." };
  }

  const have = new Set(i.documents.map((d) => d.typeSlug));
  const missing = i.mandatoryDocTypes.filter((t) => !have.has(t.slug));
  if (missing.length) p.add(Math.min(36, missing.length * 12), `Missing mandatory document${missing.length > 1 ? "s" : ""}: ${missing.map((m) => m.name).join(", ")}`);

  for (const d of i.documents) {
    if (!d.requiresOcr) continue;
    if (d.ocrStatus === "FAILED") p.add(10, `OCR failed for "${d.name}"`);
    else if (d.ocrStatus === "REQUIRES_REVIEW") p.add(6, `"${d.name}" scanned with low confidence — needs manual review`);
    else if (d.ocrStatus === "PENDING" || d.ocrStatus === "PROCESSING") p.add(3, `"${d.name}" is still being scanned`);

    const v = d.verification;
    if (!v) continue;
    let docPoints = 0;
    const issues: string[] = [];
    for (const c of v.checks) {
      if (c.status === "mismatch") { docPoints += 10; issues.push(`${c.label.toLowerCase()} differs`); }
      else if (c.status === "partial") { docPoints += 4; issues.push(`${c.label.toLowerCase()} partly differs`); }
    }
    if (docPoints) p.add(Math.min(25, docPoints), `"${d.name}": ${issues.join(", ")}`);
    if (v.kindMismatch) p.add(12, `"${d.name}" isn't the type of document it was uploaded as`);
    if (v.pointsToOtherProperty) p.add(15, `"${d.name}" appears to describe a different property`);
  }

  if (p.total === 0) p.note("All uploaded documents read cleanly and agree with the record");
  return {
    key: "documents",
    name: FACTOR_NAMES.documents,
    score: p.score,
    evidence: p.evidence,
    explanation: p.score === 0 ? "Documents verified." : p.score <= 25 ? "Minor document gaps." : "Document problems need attention.",
  };
}

function ownershipStability(i: RiskInputs): Omit<FactorResult, "weight"> {
  const p = new Points();
  p.total = 5; // nothing is ever completely certain

  if (!i.property.hasOwner) p.add(35, "No owner assigned to this property");

  let ownerIssues = 0;
  for (const d of i.documents) {
    const s = checkStatus(d, "ownerName");
    if (s === "mismatch") { ownerIssues++; p.add(ownerIssues === 1 ? 25 : 10, `Owner named in "${d.name}" differs from the record`); }
    else if (s === "partial") { ownerIssues++; p.add(ownerIssues === 1 ? 10 : 5, `Owner named in "${d.name}" only partly matches the record`); }
  }

  for (const m of i.matches) {
    if (m.matchType === "conflict") p.add(m.status === "confirmed" ? 45 : 25, `${m.status === "confirmed" ? "Confirmed" : "Possible"} conflicting owner on the same survey number`);
  }
  if (i.property.status === "FLAGGED") p.add(10, "Property is flagged for review");

  if (p.total === 5) {
    p.note(i.documents.some((d) => checkStatus(d, "ownerName") === "match") ? "Owner on record agrees with the documents" : "No document yet confirms the owner on record");
  }
  return {
    key: "ownership",
    name: FACTOR_NAMES.ownership,
    score: p.score,
    evidence: p.evidence,
    explanation: p.score <= 15 ? "Ownership looks stable." : p.score <= 45 ? "Some ownership questions." : "Ownership is in doubt.",
  };
}

function newsSentiment(i: RiskInputs): Omit<FactorResult, "weight"> {
  const p = new Points();
  p.total = 20; // neutral baseline

  let negatives = 0;
  for (const n of i.news) {
    const r = clamp(n.relevanceScore, 0, 1);
    const strength = Math.min(1, Math.abs(n.sentimentScore ?? 0.5));
    if (n.sentiment === "NEGATIVE") {
      negatives++;
      p.add(Math.round(50 * r * (0.6 + 0.4 * strength)), `Negative coverage: "${n.headline}"`);
    } else if (n.sentiment === "POSITIVE") {
      p.total -= 12 * r;
    } else {
      p.total += 3 * r;
    }
  }
  if (!i.news.length) p.note("No newspaper coverage found");
  else if (!negatives) p.note("Coverage is neutral or positive");

  return {
    key: "news",
    name: FACTOR_NAMES.news,
    score: p.score,
    evidence: p.evidence,
    explanation: negatives ? `${negatives} negative article${negatives > 1 ? "s" : ""} mention this property.` : "No adverse press.",
  };
}

// ─── Flags, penalty, narrative ───

function buildFlags(i: RiskInputs): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const active = i.courtCases.filter(isActive);

  const stay = active.find((c) => c.hasStayOrder);
  if (stay) flags.push({ code: "STAY_ORDER", severity: "critical", message: `Stay order in force (${stay.caseNumber})` });

  const fraud = active.find((c) => c.linkType === "FRAUD");
  if (fraud) flags.push({ code: "FRAUD_CASE", severity: "critical", message: `Active fraud case ${fraud.caseNumber}` });

  if (i.matches.some((m) => m.status === "confirmed" && m.matchType !== "possible_match"))
    flags.push({ code: "CONFIRMED_DUPLICATE", severity: "critical", message: "A reviewer confirmed this property duplicates or conflicts with another record" });
  else if (i.matches.some((m) => m.matchType === "conflict"))
    flags.push({ code: "OWNERSHIP_CONFLICT", severity: "high", message: "Same survey number appears with a different owner" });
  else if (i.matches.some((m) => m.matchType === "exact_duplicate" || m.matchType === "likely_duplicate"))
    flags.push({ code: "POSSIBLE_DUPLICATE", severity: "high", message: "Possible duplicate listing awaiting review" });

  if (active.some((c) => c.linkType === "TITLE_DISPUTE" || c.affectsTitle))
    flags.push({ code: "TITLE_DISPUTE", severity: "high", message: "Title is contested in an active case" });

  if (i.documents.some((d) => d.verification?.pointsToOtherProperty))
    flags.push({ code: "DOCUMENT_WRONG_PROPERTY", severity: "high", message: "An uploaded document appears to describe a different property" });

  if (i.documents.some((d) => ["ownerName", "surveyNumber"].some((f) => checkStatus(d, f) === "mismatch")))
    flags.push({ code: "DOCUMENT_MISMATCH", severity: "medium", message: "Owner or survey number in a document differs from the record" });

  return flags;
}

function unverifiedPenalty(i: RiskInputs): { points: number; missing: string[] } {
  const total = i.mandatoryDocTypes.length;
  if (!total) return { points: 0, missing: [] };

  const missing: string[] = [];
  let verified = 0;
  for (const t of i.mandatoryDocTypes) {
    const ok = i.documents.some((d) => d.typeSlug === t.slug && d.ocrStatus === "COMPLETED" && d.verification?.overall !== "discrepancies");
    if (ok) verified++;
    else missing.push(t.name);
  }
  return { points: Math.round(MAX_UNVERIFIED_PENALTY * (1 - verified / total)), missing };
}

function floorFor(i: RiskInputs): { score: number; reason: string } | null {
  const active = i.courtCases.filter(isActive);
  const candidates: { score: number; reason: string }[] = [];
  if (active.some((c) => c.hasStayOrder)) candidates.push({ score: 60, reason: "active stay order" });
  if (active.some((c) => c.linkType === "FRAUD")) candidates.push({ score: 70, reason: "active fraud case" });
  if (i.matches.some((m) => m.status === "confirmed" && m.matchType !== "possible_match")) candidates.push({ score: 65, reason: "confirmed duplicate/conflict" });
  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}

function buildNarrative(level: RiskLevel, score: number, factors: FactorResult[], missing: string[], flags: RiskFlag[]): string {
  const drivers = [...factors]
    .map((f) => ({ f, contribution: f.score * f.weight }))
    .filter((x) => x.f.score >= 25)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2);

  const parts = [`${level} RISK (${score}/100).`];

  if (drivers.length) {
    parts.push("Main concerns: " + drivers.map(({ f }) => `${f.name.toLowerCase()} — ${f.evidence[0]}`).join("; ") + ".");
  } else {
    parts.push("No significant risk signals were found in the available records.");
  }
  const critical = flags.filter((f) => f.severity === "critical");
  if (critical.length) parts.push("Critical: " + critical.map((f) => f.message).join("; ") + ".");
  if (missing.length) parts.push(`Not yet verified: ${missing.join(", ")}.`);
  return parts.join(" ");
}

// ─── Entry point ───

export function computeRisk(inputs: RiskInputs, weights: Partial<Record<FactorKey, number>> = {}): RiskComputation {
  const w = { ...DEFAULT_FACTOR_WEIGHTS, ...weights };

  const raw = [titleClarity(inputs), legalExposure(inputs), documentAuthenticity(inputs), ownershipStability(inputs), newsSentiment(inputs)];
  const factors: FactorResult[] = raw.map((f) => ({ ...f, weight: w[f.key] }));

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const weightedScore = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;

  const penalty = unverifiedPenalty(inputs);
  const floor = floorFor(inputs);

  let overall = Math.round(clamp(weightedScore + penalty.points));
  if (floor && overall < floor.score) overall = floor.score;

  const riskLevel = levelForScore(overall);
  const flags = buildFlags(inputs);

  return {
    overallScore: overall,
    riskLevel,
    weightedScore: Math.round(weightedScore * 10) / 10,
    unverifiedPenalty: penalty.points,
    unverifiedDocuments: penalty.missing,
    floor,
    factors,
    flags,
    narrative: buildNarrative(riskLevel, overall, factors, penalty.missing, flags),
  };
}
