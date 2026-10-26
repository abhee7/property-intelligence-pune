import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

const RISK_ORDER = ["MINIMAL", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
const TREND_MONTHS = 6;

const parseMeta = (raw: string | null): Record<string, any> => {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
};

/** Month buckets for the trend chart, oldest first: [{ key: "2026-05", label: "May", end: Date }] */
function lastMonths(count: number) {
  const now = new Date();
  const out: { key: string; label: string; end: Date }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); // exclusive
    out.push({ key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`, label: start.toLocaleString("en-US", { month: "short" }), end });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  const tenantId = auth.tenantId;
  const live = { tenantId, deletedAt: null };

  try {
    const [
      totalProperties, verifiedProperties, underVerificationCount, highRiskScores,
      activeCases, pendingDocs, newsMentions, statusCounts, riskCounts,
      propertyMeta, propertyDates, processedDocs, topRisk,
      recentRisk, recentDocs, recentCases, recentArticles,
    ] = await Promise.all([
      prisma.property.count({ where: live }),
      prisma.property.count({ where: { ...live, status: "VERIFIED" } }),
      prisma.property.count({ where: { ...live, status: "UNDER_VERIFICATION" } }),
      prisma.riskScore.count({ where: { tenantId, riskLevel: { in: ["HIGH", "CRITICAL"] } } }),
      prisma.courtCase.count({ where: { tenantId, caseStatus: "ACTIVE" } }),
      prisma.document.count({ where: { property: { tenantId }, ocrStatus: { in: ["PENDING", "PROCESSING"] }, deletedAt: null } }),
      prisma.newspaperPropertyMention.count({ where: { tenantId } }),
      prisma.property.groupBy({ by: ["status"], where: live, _count: true }),
      prisma.riskScore.groupBy({ by: ["riskLevel"], where: { tenantId, property: { deletedAt: null } }, _count: true }),
      prisma.property.findMany({ where: live, select: { metadata: true } }),
      prisma.property.findMany({ where: live, select: { createdAt: true } }),
      prisma.document.findMany({ where: { property: { tenantId }, deletedAt: null, processedAt: { not: null } }, select: { processedAt: true } }),
      prisma.riskScore.findMany({
        where: { tenantId, property: { deletedAt: null } },
        orderBy: { overallScore: "desc" },
        take: 5,
        select: { overallScore: true, riskLevel: true, property: { select: { id: true, title: true, status: true, surveyNumber: true, price: true, metadata: true } } },
      }),
      prisma.riskScore.findMany({
        where: { tenantId, riskLevel: { in: ["HIGH", "CRITICAL"] }, property: { deletedAt: null } },
        orderBy: { computedAt: "desc" },
        take: 2,
        select: { overallScore: true, riskLevel: true, computedAt: true, property: { select: { title: true } } },
      }),
      prisma.document.findMany({
        where: { property: { tenantId }, deletedAt: null, processedAt: { not: null } },
        orderBy: { processedAt: "desc" },
        take: 2,
        select: { originalName: true, ocrStatus: true, processedAt: true, property: { select: { title: true } } },
      }),
      prisma.courtCase.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 1, select: { caseNumber: true, title: true, caseStatus: true, createdAt: true } }),
      prisma.newspaperArticle.findMany({ orderBy: { publishedAt: "desc" }, take: 1, select: { headline: true, publishedAt: true } }),
    ]);

    // ── risk distribution (always all five levels, in order) ──
    const byLevel = Object.fromEntries(riskCounts.map((r: any) => [r.riskLevel, r._count]));
    const riskDistribution = RISK_ORDER.map((level) => ({ key: level, name: level[0] + level.slice(1).toLowerCase(), value: byLevel[level] ?? 0 }));

    // ── taluka breakdown (stored in each property's metadata) ──
    const talukaCounts: Record<string, number> = {};
    for (const p of propertyMeta) {
      const taluka = parseMeta(p.metadata).taluka;
      if (taluka) talukaCounts[taluka] = (talukaCounts[taluka] ?? 0) + 1;
    }
    const talukaBreakdown = Object.entries(talukaCounts)
      .map(([taluka, count]) => ({ taluka, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // ── cumulative trend over the last months ──
    const months = lastMonths(TREND_MONTHS);
    const trend = months.map((m) => ({
      month: m.label,
      properties: propertyDates.filter((p: any) => p.createdAt < m.end).length,
      documentsRead: processedDocs.filter((d: any) => d.processedAt < m.end).length,
    }));

    // ── watchlist ──
    const highRiskProperties = topRisk.map((r: any) => ({
      id: r.property.id,
      title: r.property.title,
      location: parseMeta(r.property.metadata).village ?? null,
      surveyNumber: r.property.surveyNumber,
      riskScore: r.overallScore,
      riskLevel: r.riskLevel,
      status: r.property.status,
      price: r.property.price,
    }));

    // ── activity stream: the latest real events, newest first ──
    const activity = [
      ...recentRisk.map((r: any) => ({ type: "RISK", title: `${r.riskLevel[0]}${r.riskLevel.slice(1).toLowerCase()} risk score computed`, desc: `${r.property.title} — ${r.overallScore}/100`, at: r.computedAt })),
      ...recentDocs.map((d: any) => ({ type: "PROPERTY", title: d.ocrStatus === "REQUIRES_REVIEW" ? "Document needs manual review" : "Document read", desc: `${d.originalName} · ${d.property.title}`, at: d.processedAt })),
      ...recentCases.map((c: any) => ({ type: "COURT", title: `Court case ${c.caseStatus.toLowerCase()}`, desc: `${c.caseNumber} — ${c.title}`, at: c.createdAt })),
      ...recentArticles.map((a: any) => ({ type: "NEWS", title: "News article indexed", desc: a.headline, at: a.publishedAt })),
    ]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 5);

    return apiSuccess({
      kpis: {
        totalProperties, verifiedProperties, underVerificationCount,
        verificationRate: totalProperties > 0 ? Math.round((verifiedProperties / totalProperties) * 100) : 0,
        highRiskCount: highRiskScores, activeCases, pendingDocs, newsMentions,
      },
      statusBreakdown: statusCounts.map((s: any) => ({ status: s.status, count: s._count })),
      riskDistribution,
      talukaBreakdown,
      trend,
      highRiskProperties,
      recentActivity: activity,
    });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch dashboard data", 500);
  }
}
