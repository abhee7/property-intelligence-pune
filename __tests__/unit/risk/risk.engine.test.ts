// __tests__/unit/risk/risk.engine.test.ts

import { describe, it, expect } from "vitest";
import { computeRisk, levelForScore, type RiskInputs, type RiskDocument } from "@/modules/risk/risk.engine";

const MANDATORY = [
  { slug: "title-deed", name: "Title deed" },
  { slug: "7-12-extract", name: "7/12 extract" },
  { slug: "encumbrance-cert", name: "Encumbrance certificate" },
];

const cleanDoc = (slug: string, name = slug): RiskDocument => ({
  name: `${name}.pdf`,
  typeSlug: slug,
  typeName: name,
  requiresOcr: true,
  ocrStatus: "COMPLETED",
  verification: {
    overall: "verified",
    checks: [
      { field: "surveyNumber", label: "Survey number", status: "match" },
      { field: "ownerName", label: "Owner name", status: "match" },
    ],
    kindMismatch: false,
    pointsToOtherProperty: false,
  },
});

/** A property with everything in order. */
const clean = (): RiskInputs => ({
  property: { status: "VERIFIED", surveyNumber: "118/2A", hasOwner: true },
  courtCases: [],
  news: [],
  mandatoryDocTypes: MANDATORY,
  documents: MANDATORY.map((m) => cleanDoc(m.slug, m.name)),
  matches: [],
});

const factor = (r: ReturnType<typeof computeRisk>, key: string) => r.factors.find((f) => f.key === key)!;

describe("levelForScore", () => {
  it.each([
    [0, "MINIMAL"], [15, "MINIMAL"], [16, "LOW"], [35, "LOW"], [36, "MODERATE"],
    [55, "MODERATE"], [56, "HIGH"], [75, "HIGH"], [76, "CRITICAL"], [100, "CRITICAL"],
  ])("%d → %s", (score, level) => {
    expect(levelForScore(score)).toBe(level);
  });
});

describe("computeRisk — baseline cases", () => {
  it("scores a fully verified, litigation-free property as minimal risk", () => {
    const r = computeRisk(clean());
    expect(r.riskLevel).toBe("MINIMAL");
    expect(r.overallScore).toBeLessThanOrEqual(15);
    expect(r.flags).toHaveLength(0);
    expect(r.unverifiedPenalty).toBe(0);
  });

  it("treats a property with no documents as unverified, not safe", () => {
    const r = computeRisk({ ...clean(), documents: [] });
    expect(r.riskLevel).toBe("MODERATE");
    expect(r.unverifiedPenalty).toBe(15);
    expect(factor(r, "documents").score).toBe(75);
    expect(r.narrative).toContain("Not yet verified");
  });

  it("returns all five factors with weights that sum to 1", () => {
    const r = computeRisk(clean());
    expect(r.factors.map((f) => f.name)).toEqual([
      "Title clarity", "Legal exposure", "Document authenticity", "Ownership stability", "News sentiment",
    ]);
    expect(r.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 5);
  });

  it("keeps every factor between 0 and 100", () => {
    const worst: RiskInputs = {
      ...clean(),
      property: { status: "FLAGGED", surveyNumber: null, hasOwner: false },
      documents: [],
      courtCases: Array.from({ length: 6 }, (_, n) => ({
        caseNumber: `CS/${n}`, caseStatus: "ACTIVE", linkType: "FRAUD", impactScore: 1,
        nextHearingDate: null, hasStayOrder: true, affectsTitle: true,
      })),
      matches: [{ matchType: "conflict", status: "confirmed" }, { matchType: "exact_duplicate", status: "confirmed" }],
      news: Array.from({ length: 8 }, () => ({ headline: "Fraud", sentiment: "NEGATIVE", sentimentScore: -1, relevanceScore: 1 })),
    };
    const r = computeRisk(worst);
    for (const f of r.factors) {
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(100);
    }
    expect(r.overallScore).toBeLessThanOrEqual(100);
    expect(r.riskLevel).toBe("CRITICAL");
  });
});

describe("computeRisk — legal exposure", () => {
  const activeCase = (over = {}) => ({
    caseNumber: "CS/100/2024", caseStatus: "ACTIVE", linkType: "TITLE_DISPUTE", impactScore: 0.8,
    nextHearingDate: null, hasStayOrder: false, affectsTitle: false, ...over,
  });

  it("raises legal exposure for an active case and cites it", () => {
    const r = computeRisk({ ...clean(), courtCases: [activeCase()] });
    expect(factor(r, "legal").score).toBeGreaterThan(30);
    expect(factor(r, "legal").evidence.join(" ")).toContain("CS/100/2024");
    expect(r.flags.map((f) => f.code)).toContain("TITLE_DISPUTE");
  });

  it("weighs a fraud case more than a boundary dispute", () => {
    const fraud = computeRisk({ ...clean(), courtCases: [activeCase({ linkType: "FRAUD" })] });
    const boundary = computeRisk({ ...clean(), courtCases: [activeCase({ linkType: "BOUNDARY_DISPUTE" })] });
    expect(factor(fraud, "legal").score).toBeGreaterThan(factor(boundary, "legal").score);
  });

  it("barely counts disposed cases", () => {
    const r = computeRisk({ ...clean(), courtCases: [activeCase({ caseStatus: "DISPOSED" })] });
    expect(factor(r, "legal").score).toBeLessThanOrEqual(12);
    expect(r.flags).toHaveLength(0);
  });

  it("ignores a stay order on a disposed case", () => {
    const r = computeRisk({ ...clean(), courtCases: [activeCase({ caseStatus: "DISPOSED", hasStayOrder: true })] });
    expect(r.flags.map((f) => f.code)).not.toContain("STAY_ORDER");
  });

  it("flags an upcoming hearing", () => {
    const now = new Date("2026-01-01");
    const soon = new Date("2026-01-15");
    const r = computeRisk({ ...clean(), now, courtCases: [activeCase({ nextHearingDate: soon })] });
    expect(factor(r, "legal").evidence.join(" ")).toContain("Hearing due within 30 days");
  });
});

describe("computeRisk — hard floors", () => {
  const stayCase = {
    caseNumber: "MA/1/2023", caseStatus: "ACTIVE", linkType: "BOUNDARY_DISPUTE", impactScore: 0.1,
    nextHearingDate: null, hasStayOrder: true, affectsTitle: false,
  };

  it("never rates a property with an active stay order below HIGH", () => {
    const r = computeRisk({ ...clean(), courtCases: [stayCase] });
    expect(r.overallScore).toBeGreaterThanOrEqual(60);
    expect(r.floor?.reason).toBe("active stay order");
    expect(r.flags[0]).toMatchObject({ code: "STAY_ORDER", severity: "critical" });
  });

  it("puts an active fraud case at 70 or above", () => {
    const r = computeRisk({ ...clean(), courtCases: [{ ...stayCase, hasStayOrder: false, linkType: "FRAUD" }] });
    expect(r.overallScore).toBeGreaterThanOrEqual(70);
  });

  it("puts a confirmed duplicate at 65 or above", () => {
    const r = computeRisk({ ...clean(), matches: [{ matchType: "exact_duplicate", status: "confirmed" }] });
    expect(r.overallScore).toBeGreaterThanOrEqual(65);
    expect(r.flags.map((f) => f.code)).toContain("CONFIRMED_DUPLICATE");
  });

  it("does not apply a floor to an unconfirmed possible match", () => {
    const r = computeRisk({ ...clean(), matches: [{ matchType: "possible_match", status: "pending" }] });
    expect(r.floor).toBeNull();
  });
});

describe("computeRisk — documents and ownership", () => {
  it("penalises a document whose owner and survey number disagree with the record", () => {
    const bad = cleanDoc("7-12-extract", "7/12");
    bad.verification = {
      overall: "discrepancies",
      checks: [
        { field: "surveyNumber", label: "Survey number", status: "mismatch" },
        { field: "ownerName", label: "Owner name", status: "mismatch" },
      ],
      kindMismatch: false,
      pointsToOtherProperty: false,
    };
    const r = computeRisk({ ...clean(), documents: [bad, cleanDoc("title-deed"), cleanDoc("encumbrance-cert")] });

    expect(factor(r, "documents").score).toBeGreaterThan(0);
    expect(factor(r, "title").evidence.join(" ")).toContain("Survey number");
    expect(factor(r, "ownership").score).toBeGreaterThanOrEqual(30);
    expect(r.flags.map((f) => f.code)).toContain("DOCUMENT_MISMATCH");
    expect(r.unverifiedPenalty).toBeGreaterThan(0); // the 7/12 no longer counts as verified
  });

  it("flags a document that appears to describe another property", () => {
    const stray = cleanDoc("7-12-extract");
    stray.verification!.pointsToOtherProperty = true;
    const r = computeRisk({ ...clean(), documents: [stray, cleanDoc("title-deed"), cleanDoc("encumbrance-cert")] });
    expect(r.flags.map((f) => f.code)).toContain("DOCUMENT_WRONG_PROPERTY");
  });

  it("counts failed and low-confidence scans against authenticity", () => {
    const failed = { ...cleanDoc("7-12-extract"), ocrStatus: "FAILED", verification: null };
    const review = { ...cleanDoc("title-deed"), ocrStatus: "REQUIRES_REVIEW" };
    const r = computeRisk({ ...clean(), documents: [failed, review, cleanDoc("encumbrance-cert")] });
    expect(factor(r, "documents").score).toBe(16);
  });

  it("flags a missing owner", () => {
    const r = computeRisk({ ...clean(), property: { status: "VERIFIED", surveyNumber: "118/2A", hasOwner: false } });
    expect(factor(r, "ownership").score).toBeGreaterThanOrEqual(40);
  });

  it("scores an unconfirmed ownership conflict lower than a confirmed one", () => {
    const pending = computeRisk({ ...clean(), matches: [{ matchType: "conflict", status: "pending" }] });
    const confirmed = computeRisk({ ...clean(), matches: [{ matchType: "conflict", status: "confirmed" }] });
    expect(factor(confirmed, "ownership").score).toBeGreaterThan(factor(pending, "ownership").score);
  });
});

describe("computeRisk — news", () => {
  const article = (sentiment: string, relevanceScore = 0.9, sentimentScore = 0.8) => ({ headline: `Story (${sentiment})`, sentiment, sentimentScore, relevanceScore });

  it("raises the news factor for relevant negative coverage and quotes the headline", () => {
    const r = computeRisk({ ...clean(), news: [article("NEGATIVE")] });
    expect(factor(r, "news").score).toBeGreaterThan(40);
    expect(factor(r, "news").evidence.join(" ")).toContain("Story (NEGATIVE)");
  });

  it("lowers it for positive coverage", () => {
    const none = computeRisk(clean());
    const good = computeRisk({ ...clean(), news: [article("POSITIVE")] });
    expect(factor(good, "news").score).toBeLessThan(factor(none, "news").score);
  });

  it("gives a barely-relevant negative article little weight", () => {
    const weak = computeRisk({ ...clean(), news: [article("NEGATIVE", 0.1)] });
    const strong = computeRisk({ ...clean(), news: [article("NEGATIVE", 0.9)] });
    expect(factor(weak, "news").score).toBeLessThan(factor(strong, "news").score);
  });
});

describe("computeRisk — weights and narrative", () => {
  it("lets a tenant re-weight the factors", () => {
    const inputs: RiskInputs = {
      ...clean(),
      news: [{ headline: "Scandal", sentiment: "NEGATIVE", sentimentScore: -1, relevanceScore: 1 }],
    };
    const normal = computeRisk(inputs);
    const newsHeavy = computeRisk(inputs, { news: 0.9 });
    expect(newsHeavy.weightedScore).toBeGreaterThan(normal.weightedScore);
  });

  it("starts the narrative with the level and score, and names the main concern", () => {
    const r = computeRisk({
      ...clean(),
      courtCases: [{ caseNumber: "CS/9/2024", caseStatus: "ACTIVE", linkType: "TITLE_DISPUTE", impactScore: 0.9, nextHearingDate: null, hasStayOrder: false, affectsTitle: true }],
    });
    expect(r.narrative.startsWith(`${r.riskLevel} RISK (${r.overallScore}/100).`)).toBe(true);
    expect(r.narrative).toContain("CS/9/2024");
  });

  it("is deterministic", () => {
    const inputs = clean();
    expect(computeRisk(inputs)).toEqual(computeRisk(inputs));
  });
});
