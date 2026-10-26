// src/modules/analytics/analytics.service.ts
//
// Portfolio metrics, computed from the database. Nothing here is estimated or simulated:
// every number is a count, sum or average of stored rows.

import { prisma } from "@/lib/db/client";

// ─── Types ───

export interface Distribution {
  label: string;
  value: number;
}

export interface AnalyticsDashboard {
  kpis: {
    properties: { total: number; addedLast30Days: number };
    verified: { total: number; rate: number };
    highRisk: { total: number; rate: number };
    avgRiskScore: number;
    activeCases: number;
    stayOrders: number;
    openMatches: number;
    portfolioValue: number;
    documents: { total: number; completed: number; needsReview: number; failed: number; pending: number; avgConfidence: number; avgSeconds: number };
  };
  monthlyListings: { month: string; added: number; flagged: number }[];
  statusDistribution: Distribution[];
  riskDistribution: Distribution[];
  typeDistribution: Distribution[];
  talukaDistribution: Distribution[];
  priceRanges: Distribution[];
  topLocalities: { name: string; properties: number; highRisk: number; avgRisk: number }[];
  litigationByType: { type: string; active: number; disposed: number }[];
  matchesByType: Distribution[];
  newsBySentiment: Distribution[];
  topBrokers: { name: string; properties: number; verified: number; highRisk: number }[];
  generatedAt: string;
}

const parseMeta = (m: unknown): Record<string, any> => {
  if (m && typeof m === "object") return m as Record<string, any>;
  try {
    return JSON.parse((m as string) || "{}");
  } catch {
    return {};
  }
};

const count = <T,>(items: T[], key: (t: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] || 0) + 1;
  return out;
};

const toDistribution = (counts: Record<string, number>, order?: string[]): Distribution[] =>
  (order ?? Object.keys(counts).sort((a, b) => counts[b] - counts[a])).map((label) => ({ label, value: counts[label] || 0 }));

const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── Computation ───

export async function computeAnalytics(tenantId: string): Promise<AnalyticsDashboard> {
  const [properties, types, caseLinks, docs, matches, mentions]: any[] = await Promise.all([
    prisma.property.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        status: true, price: true, metadata: true, createdAt: true, propertyTypeId: true,
        broker: { select: { firstName: true, lastName: true } },
        riskScore: { select: { overallScore: true, riskLevel: true } },
      },
    }),
    prisma.propertyType.findMany({ select: { id: true, name: true } }),
    prisma.courtCasePropertyLink.findMany({
      where: { courtCase: { tenantId }, property: { deletedAt: null } },
      select: { linkType: true, courtCase: { select: { caseStatus: true, orders: { select: { isStayOrder: true } } } } },
    }),
    prisma.document.findMany({
      where: { deletedAt: null, property: { tenantId } },
      select: { ocrStatus: true, ocrConfidence: true, extractedData: true },
    }),
    prisma.propertyMatch.findMany({
      where: { tenantId, propertyA: { deletedAt: null }, propertyB: { deletedAt: null } },
      select: { matchType: true, status: true },
    }),
    prisma.newspaperPropertyMention.findMany({ where: { tenantId, property: { deletedAt: null } }, select: { sentiment: true } }),
  ]);

  const total = properties.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const now = Date.now();

  // ── KPIs ──
  const verified = properties.filter((p: any) => p.status === "VERIFIED").length;
  const highRisk = properties.filter((p: any) => ["HIGH", "CRITICAL"].includes(p.riskScore?.riskLevel)).length;
  const scored = properties.filter((p: any) => p.riskScore);
  const avgRisk = scored.length ? scored.reduce((s: number, p: any) => s + p.riskScore.overallScore, 0) / scored.length : 0;

  const activeCaseLinks = caseLinks.filter((l: any) => !/disposed|closed|dismissed|withdrawn|decided|settled/i.test(l.courtCase.caseStatus));
  const stayOrders = activeCaseLinks.filter((l: any) => l.courtCase.orders.some((o: any) => o.isStayOrder)).length;

  const ocrDocs = docs.filter((d: any) => d.ocrStatus !== "SKIPPED");
  const timed: number[] = [];
  for (const d of ocrDocs) {
    try {
      const ms = JSON.parse(d.extractedData || "{}").ocr?.durationMs;
      if (typeof ms === "number") timed.push(ms);
    } catch {}
  }
  const confs = ocrDocs.map((d: any) => d.ocrConfidence).filter((c: any) => typeof c === "number");
  const docCount = (s: string) => docs.filter((d: any) => d.ocrStatus === s).length;

  const kpis: AnalyticsDashboard["kpis"] = {
    properties: { total, addedLast30Days: properties.filter((p: any) => now - new Date(p.createdAt).getTime() < 30 * 86400000).length },
    verified: { total: verified, rate: pct(verified) },
    highRisk: { total: highRisk, rate: pct(highRisk) },
    avgRiskScore: round1(avgRisk),
    activeCases: activeCaseLinks.length,
    stayOrders,
    openMatches: matches.filter((m: any) => m.status === "pending").length,
    portfolioValue: properties.reduce((s: number, p: any) => s + (Number(p.price) || 0), 0),
    documents: {
      total: docs.length,
      completed: docCount("COMPLETED"),
      needsReview: docCount("REQUIRES_REVIEW"),
      failed: docCount("FAILED"),
      pending: docCount("PENDING") + docCount("PROCESSING"),
      avgConfidence: confs.length ? Math.round(confs.reduce((a: number, b: number) => a + b, 0) / confs.length) : 0,
      avgSeconds: timed.length ? round1(timed.reduce((a, b) => a + b, 0) / timed.length / 1000) : 0,
    },
  };

  // ── Monthly listings (last 6 calendar months, by creation date) ──
  const monthlyListings: AnalyticsDashboard["monthlyListings"] = [];
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const inMonth = properties.filter((p: any) => new Date(p.createdAt) >= start && new Date(p.createdAt) < end);
    monthlyListings.push({
      month: start.toLocaleDateString("en-IN", { month: "short" }),
      added: inMonth.length,
      flagged: inMonth.filter((p: any) => p.status === "FLAGGED").length,
    });
  }

  // ── Distributions ──
  const statusDistribution = toDistribution(count(properties, (p: any) => p.status));
  const riskDistribution = toDistribution(count(properties.filter((p: any) => p.riskScore), (p: any) => p.riskScore.riskLevel), ["MINIMAL", "LOW", "MODERATE", "HIGH", "CRITICAL"]);

  const typeName = new Map<string, string>(types.map((t: any) => [t.id, t.name]));
  const typeDistribution = toDistribution(count(properties, (p: any) => typeName.get(p.propertyTypeId) ?? "Other"));
  const talukaDistribution = toDistribution(count(properties, (p: any) => parseMeta(p.metadata).taluka || "Unknown"));

  const ranges: [string, number, number][] = [
    ["Under ₹50L", 0, 5e6], ["₹50L–1Cr", 5e6, 1e7], ["₹1–2Cr", 1e7, 2e7], ["₹2–5Cr", 2e7, 5e7], ["Over ₹5Cr", 5e7, Infinity],
  ];
  const priceRanges = ranges.map(([label, lo, hi]) => ({
    label,
    value: properties.filter((p: any) => (Number(p.price) || 0) >= lo && (Number(p.price) || 0) < hi).length,
  }));

  // ── Localities ──
  const byLocality = new Map<string, { n: number; high: number; risk: number; scored: number }>();
  for (const p of properties as any[]) {
    const name = parseMeta(p.metadata).village || "Unknown";
    const e = byLocality.get(name) ?? { n: 0, high: 0, risk: 0, scored: 0 };
    e.n++;
    if (["HIGH", "CRITICAL"].includes(p.riskScore?.riskLevel)) e.high++;
    if (p.riskScore) { e.risk += p.riskScore.overallScore; e.scored++; }
    byLocality.set(name, e);
  }
  const topLocalities = [...byLocality.entries()]
    .map(([name, e]) => ({ name, properties: e.n, highRisk: e.high, avgRisk: e.scored ? Math.round(e.risk / e.scored) : 0 }))
    .sort((a, b) => b.properties - a.properties)
    .slice(0, 8);

  // ── Litigation by case type ──
  const lit = new Map<string, { active: number; disposed: number }>();
  for (const l of caseLinks as any[]) {
    const type = (l.linkType || "OTHER").replace(/_/g, " ").toLowerCase();
    const e = lit.get(type) ?? { active: 0, disposed: 0 };
    if (/disposed|closed|dismissed|withdrawn|decided|settled/i.test(l.courtCase.caseStatus)) e.disposed++;
    else e.active++;
    lit.set(type, e);
  }
  const litigationByType = [...lit.entries()]
    .map(([type, e]) => ({ type, ...e }))
    .sort((a, b) => b.active + b.disposed - (a.active + a.disposed));

  // ── Matches, news ──
  const matchesByType = toDistribution(count(matches, (m: any) => m.matchType.replace(/_/g, " ")));
  const newsBySentiment = toDistribution(count(mentions, (m: any) => m.sentiment || "UNKNOWN"));

  // ── Brokers ──
  const brokers = new Map<string, { n: number; verified: number; high: number }>();
  for (const p of properties as any[]) {
    if (!p.broker) continue;
    const name = `${p.broker.firstName} ${p.broker.lastName}`;
    const e = brokers.get(name) ?? { n: 0, verified: 0, high: 0 };
    e.n++;
    if (p.status === "VERIFIED") e.verified++;
    if (["HIGH", "CRITICAL"].includes(p.riskScore?.riskLevel)) e.high++;
    brokers.set(name, e);
  }
  const topBrokers = [...brokers.entries()]
    .map(([name, e]) => ({ name, properties: e.n, verified: e.verified, highRisk: e.high }))
    .sort((a, b) => b.properties - a.properties)
    .slice(0, 5);

  return {
    kpis, monthlyListings, statusDistribution, riskDistribution, typeDistribution, talukaDistribution,
    priceRanges, topLocalities, litigationByType, matchesByType, newsBySentiment, topBrokers,
    generatedAt: new Date().toISOString(),
  };
}

// ─── CSV export ───

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function exportAnalyticsCSV(tenantId: string): Promise<string> {
  const properties = await prisma.property.findMany({
    where: { tenantId, deletedAt: null },
    include: {
      address: { select: { city: true, district: true } },
      propertyType: { select: { name: true } },
      owner: { select: { firstName: true, lastName: true } },
      broker: { select: { firstName: true, lastName: true } },
      riskScore: { select: { overallScore: true, riskLevel: true } },
    },
    orderBy: { id: "asc" },
  });

  const headers = ["ID", "Title", "Type", "Status", "Price", "Area (sqft)", "Survey No", "Village", "City", "District", "Owner", "Broker", "Risk Score", "Risk Level", "Created"];
  const rows = properties.map((p: any) => [
    p.id, p.title, p.propertyType.name, p.status,
    p.price ?? "", p.areaSqft ?? "", p.surveyNumber ?? "", parseMeta(p.metadata).village ?? "",
    p.address.city, p.address.district,
    p.owner ? `${p.owner.firstName} ${p.owner.lastName}` : "",
    p.broker ? `${p.broker.firstName} ${p.broker.lastName}` : "",
    p.riskScore?.overallScore ?? "", p.riskScore?.riskLevel ?? "",
    p.createdAt.toISOString().split("T")[0],
  ]);

  return [headers.map(csvCell).join(","), ...rows.map((r: unknown[]) => r.map(csvCell).join(","))].join("\n");
}
