// src/modules/matching/matching.service.ts
//
// Finds duplicate / conflicting property records and stores them in the
// PropertyMatch table so they survive restarts and feed the risk score.

import { prisma } from "@/lib/db/client";
import {
  computeMatchScore,
  matchSurveyNumber,
  matchVillage,
  matchCoordinates,
  type MatchResult,
  type MatchWeights,
  DEFAULT_WEIGHTS,
} from "./matching.algorithms";
import { scheduleRiskRecompute } from "@/modules/risk/risk.service";

// ─── Types ───

export interface PropertySummary {
  id: string;
  title: string;
  surveyNumber: string | null;
  status: string;
  price: number | null;
  areaSqft: number | null;
  village: string | null;
  ownerName: string | null;
  brokerName: string | null;
}

export interface MatchRecord {
  id: string;
  propertyAId: string;
  propertyBId: string;
  propertyA: PropertySummary;
  propertyB: PropertySummary;
  overallScore: number;
  matchType: string;
  confidence: string;
  factors: MatchResult["factors"];
  status: "pending" | "confirmed" | "dismissed" | "resolved";
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface MatchSummary {
  totalMatches: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  highConfidence: number;
  pendingReview: number;
}

// ─── Loading ───

const PROPERTY_SELECT = {
  id: true,
  title: true,
  surveyNumber: true,
  price: true,
  areaSqft: true,
  status: true,
  metadata: true,
  address: { select: { latitude: true, longitude: true } },
  owner: { select: { firstName: true, lastName: true } },
  broker: { select: { firstName: true, lastName: true } },
} as const;

function parseMeta(metadata: unknown): Record<string, any> {
  if (metadata && typeof metadata === "object") return metadata as Record<string, any>;
  try {
    return JSON.parse((metadata as string) || "{}");
  } catch {
    return {};
  }
}

function fullName(u: { firstName: string; lastName: string } | null | undefined): string | null {
  return u ? `${u.firstName} ${u.lastName}` : null;
}

function toSummary(p: any): PropertySummary {
  return {
    id: p.id,
    title: p.title,
    surveyNumber: p.surveyNumber,
    status: p.status,
    price: p.price ?? null,
    areaSqft: p.areaSqft ?? null,
    village: parseMeta(p.metadata).village ?? null,
    ownerName: fullName(p.owner),
    brokerName: fullName(p.broker),
  };
}

function toFacts(p: any) {
  return {
    surveyNumber: p.surveyNumber,
    ownerName: fullName(p.owner),
    village: parseMeta(p.metadata).village ?? null,
    area: p.areaSqft ?? null,
    price: p.price ?? null,
    latitude: p.address?.latitude ?? null,
    longitude: p.address?.longitude ?? null,
  };
}

function toRecord(row: any): MatchRecord {
  let factors: MatchResult["factors"] = [];
  try {
    factors = JSON.parse(row.factors || "[]");
  } catch {}
  return {
    id: row.id,
    propertyAId: row.propertyAId,
    propertyBId: row.propertyBId,
    propertyA: toSummary(row.propertyA),
    propertyB: toSummary(row.propertyB),
    overallScore: row.overallScore,
    matchType: row.matchType,
    confidence: row.confidence,
    factors,
    status: row.status,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

/** Matches involving an archived (soft-deleted) property are hidden everywhere. */
const LIVE_PROPERTIES = { propertyA: { deletedAt: null }, propertyB: { deletedAt: null } } as const;

const MATCH_INCLUDE = {
  propertyA: { select: PROPERTY_SELECT },
  propertyB: { select: PROPERTY_SELECT },
} as const;

// ─── Core matching ───

/**
 * Compares properties and stores likely duplicates / conflicts.
 * With a target property only pairs involving it are re-checked; otherwise every pair is.
 * Pairs whose (known) survey numbers differ are skipped up front, as are pairs that share nothing
 * at all — they can only score as weak coincidences.
 */
export async function runPropertyMatching(
  tenantId: string,
  targetPropertyId?: string,
  weights: MatchWeights = DEFAULT_WEIGHTS,
): Promise<{ matches: MatchRecord[]; scanned: number; duration: number; created: number; updated: number; removed: number }> {
  const start = Date.now();

  const properties = await prisma.property.findMany({
    where: { tenantId, deletedAt: null },
    select: PROPERTY_SELECT,
  });

  const facts = new Map<string, ReturnType<typeof toFacts>>(properties.map((p: any) => [p.id, toFacts(p)]));
  const ids: string[] = properties.map((p: any) => p.id);

  // Build the list of unordered pairs to check (lo < hi so each pair is unique)
  const pairs: [string, string][] = [];
  if (targetPropertyId) {
    if (!facts.has(targetPropertyId)) throw new Error("Property not found");
    for (const other of ids) {
      if (other === targetPropertyId) continue;
      pairs.push(targetPropertyId < other ? [targetPropertyId, other] : [other, targetPropertyId]);
    }
  } else {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      pairs.push(ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]);
    }
  }

  const existingRows = await prisma.propertyMatch.findMany({
    where: {
      tenantId,
      ...(targetPropertyId ? { OR: [{ propertyAId: targetPropertyId }, { propertyBId: targetPropertyId }] } : {}),
    },
  });
  const existing = new Map<string, any>(existingRows.map((r: any) => [`${r.propertyAId}|${r.propertyBId}`, r]));

  const touched = new Set<string>(); // pair keys that are still valid matches
  const changedProperties = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const [a, b] of pairs) {
    const fa = facts.get(a)!;
    const fb = facts.get(b)!;

    const survey = matchSurveyNumber(fa.surveyNumber, fb.surveyNumber);
    // both have a survey number and they differ → different parcels, nothing to compare
    if (fa.surveyNumber && fb.surveyNumber && survey === 0) continue;

    const related =
      survey > 0 ||
      matchVillage(fa.village, fb.village) >= 0.8 ||
      matchCoordinates(fa.latitude, fa.longitude, fb.latitude, fb.longitude) > 0;
    if (!related) continue;

    const result = computeMatchScore(fa, fb, weights);
    if (result.matchType === "no_match") continue;

    const key = `${a}|${b}`;
    touched.add(key);
    const prior = existing.get(key);
    const data = {
      overallScore: result.overallScore,
      matchType: result.matchType,
      confidence: result.confidence,
      factors: JSON.stringify(result.factors),
    };

    if (!prior) {
      await prisma.propertyMatch.create({ data: { tenantId, propertyAId: a, propertyBId: b, ...data } });
      created++;
      changedProperties.add(a).add(b);
    } else if (prior.status === "pending") {
      // keep reviewer decisions untouched; refresh scores on undecided matches
      if (prior.overallScore !== data.overallScore || prior.matchType !== data.matchType) changedProperties.add(a).add(b);
      await prisma.propertyMatch.update({ where: { id: prior.id }, data });
      updated++;
    }
  }

  // Undecided matches that no longer hold (data was corrected) are removed
  let removed = 0;
  for (const [key, row] of existing) {
    if (row.status === "pending" && !touched.has(key)) {
      await prisma.propertyMatch.delete({ where: { id: row.id } });
      removed++;
      changedProperties.add(row.propertyAId).add(row.propertyBId);
    }
  }

  for (const id of changedProperties) scheduleRiskRecompute(tenantId, id);

  const rows = await prisma.propertyMatch.findMany({
    where: { tenantId, ...(targetPropertyId ? { OR: [{ propertyAId: targetPropertyId }, { propertyBId: targetPropertyId }] } : {}) },
    include: MATCH_INCLUDE,
    orderBy: { overallScore: "desc" },
  });

  return {
    matches: rows.map(toRecord),
    scanned: pairs.length,
    duration: Date.now() - start,
    created,
    updated,
    removed,
  };
}

// ─── Query matches ───

export async function getMatches(
  tenantId: string,
  filters: {
    matchType?: string;
    status?: string;
    minScore?: number;
    propertyId?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ matches: MatchRecord[]; total: number }> {
  const where: Record<string, any> = { tenantId, ...LIVE_PROPERTIES };
  if (filters.matchType) where.matchType = filters.matchType;
  if (filters.status) where.status = filters.status;
  if (filters.minScore) where.overallScore = { gte: filters.minScore };
  if (filters.propertyId) where.OR = [{ propertyAId: filters.propertyId }, { propertyBId: filters.propertyId }];

  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 20, 100);

  const [rows, total] = await Promise.all([
    prisma.propertyMatch.findMany({
      where,
      include: MATCH_INCLUDE,
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.propertyMatch.count({ where }),
  ]);

  return { matches: rows.map(toRecord), total };
}

export async function getMatchById(tenantId: string, matchId: string): Promise<MatchRecord | null> {
  const row = await prisma.propertyMatch.findFirst({ where: { id: matchId, tenantId, ...LIVE_PROPERTIES }, include: MATCH_INCLUDE });
  return row ? toRecord(row) : null;
}

export async function resolveMatch(
  tenantId: string,
  matchId: string,
  userId: string,
  action: "confirmed" | "dismissed",
): Promise<MatchRecord | null> {
  const existing = await prisma.propertyMatch.findFirst({ where: { id: matchId, tenantId } });
  if (!existing) return null;

  const row = await prisma.propertyMatch.update({
    where: { id: matchId },
    data: { status: action, resolvedBy: userId, resolvedAt: new Date() },
    include: MATCH_INCLUDE,
  });

  // A confirmed duplicate/conflict raises both properties' risk; dismissing lowers it again
  scheduleRiskRecompute(tenantId, existing.propertyAId);
  scheduleRiskRecompute(tenantId, existing.propertyBId);

  return toRecord(row);
}

export async function getMatchSummary(tenantId: string): Promise<MatchSummary> {
  const rows = await prisma.propertyMatch.findMany({
    where: { tenantId, ...LIVE_PROPERTIES },
    select: { matchType: true, status: true, confidence: true },
  });

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let highConfidence = 0;
  let pendingReview = 0;

  for (const m of rows) {
    byType[m.matchType] = (byType[m.matchType] || 0) + 1;
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    if (m.confidence === "high") highConfidence++;
    if (m.status === "pending") pendingReview++;
  }

  return { totalMatches: rows.length, byType, byStatus, highConfidence, pendingReview };
}
