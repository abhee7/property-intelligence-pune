// src/modules/properties/property.service.ts

import { prisma } from "@/lib/db/client";
import { scheduleRiskRecompute } from "@/modules/risk/risk.service";
import { runPropertyMatching } from "@/modules/matching/matching.service";
import type { CreatePropertyInput, UpdatePropertyInput, PropertySearchInput } from "@/lib/validation/property.schema";


// ─── Types ───

export interface PropertyListItem {
  id: string;
  title: string;
  status: string;
  price: number | null;
  areaSqft: number | null;
  surveyNumber: string | null;
  propertyType: { id: string; name: string };
  address: { city: string; district: string; latitude: number | null; longitude: number | null };
  owner: { id: string; firstName: string; lastName: string } | null;
  broker: { id: string; firstName: string; lastName: string } | null;
  riskScore: { overallScore: number; riskLevel: string } | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyDetail extends PropertyListItem {
  description: string | null;
  khasraNumber: string | null;
  yearBuilt: number | null;
  listedAt: Date | null;
  address: {
    id: string; line1: string; line2: string | null; city: string; district: string;
    state: string; postalCode: string; latitude: number | null; longitude: number | null;
  };
  media: Array<{ id: string; fileUrl: string; mediaType: string; caption: string | null; isPrimary: boolean }>;
  documents: Array<{ id: string; originalName: string; mimeType: string; ocrStatus: string; documentType: { name: string }; createdAt: Date }>;
  matches: Array<{ id: string; matchType: string; overallScore: number; status: string; other: { id: string; title: string; surveyNumber: string | null } }>;
  courtPropertyLinks: Array<{ id: string; linkType: string; impactScore: number | null; courtCase: { caseNumber: string; caseStatus: string; title: string } }>;
  newspaperMentions: Array<{ id: string; relevanceScore: number; sentiment: string; article: { headline: string; publishedAt: Date } }>;
}

export interface PropertyStats {
  total: number;
  byStatus: Record<string, number>;
  byRisk: Record<string, number>;
  byType: Record<string, number>;
  avgPrice: number;
  totalArea: number;
}

// ─── Include relations ───

const LIST_INCLUDE = {
  propertyType: { select: { id: true, name: true } },
  address: { select: { city: true, district: true, latitude: true, longitude: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  broker: { select: { id: true, firstName: true, lastName: true } },
  riskScore: { select: { overallScore: true, riskLevel: true } },
};

const DETAIL_INCLUDE = {
  propertyType: { select: { id: true, name: true } },
  address: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  broker: { select: { id: true, firstName: true, lastName: true } },
  riskScore: {
    include: {
      factors: { include: { factorDef: true }, orderBy: { factorDef: { sortOrder: "asc" as const } } },
    },
  },
  media: { orderBy: { sortOrder: "asc" as const } },
  documents: {
    where: { deletedAt: null },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      ocrStatus: true,
      ocrConfidence: true,
      extractedData: true,
      createdAt: true,
      documentType: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" as const },
  },
  courtLinks: {
    include: {
      courtCase: { select: { caseNumber: true, caseStatus: true, title: true, courtName: true, nextHearingDate: true } },
    },
  },
  newsMentions: {
    include: {
      article: { select: { headline: true, publishedAt: true, source: { select: { name: true } } } },
    },
    orderBy: { relevanceScore: "desc" as const },
    take: 5,
  },
};

// SQLite stores JSON as text — turn it back into objects for API responses
function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") return value as T;
  try {
    return JSON.parse((value as string) || "") as T;
  } catch {
    return fallback;
  }
}

function withParsedMetadata<T extends { metadata?: unknown }>(p: T): T {
  return { ...p, metadata: parseJson(p.metadata, {}) };
}

async function shapeDetail(tenantId: string, raw: any): Promise<PropertyDetail> {
  const { courtLinks, riskScore, documents, ...rest } = raw;

  const matchRows = await prisma.propertyMatch.findMany({
    where: {
      tenantId,
      status: { not: "dismissed" },
      OR: [{ propertyAId: raw.id }, { propertyBId: raw.id }],
      propertyA: { deletedAt: null },
      propertyB: { deletedAt: null },
    },
    include: {
      propertyA: { select: { id: true, title: true, surveyNumber: true } },
      propertyB: { select: { id: true, title: true, surveyNumber: true } },
    },
    orderBy: { overallScore: "desc" },
  });

  return {
    ...withParsedMetadata(rest),
    courtPropertyLinks: courtLinks,
    riskScore: riskScore
      ? {
          overallScore: riskScore.overallScore,
          riskLevel: riskScore.riskLevel,
          aiNarrative: riskScore.aiNarrative,
          narrativeSource: riskScore.narrativeSource,
          narrativeModel: riskScore.narrativeModel,
          computedAt: riskScore.computedAt,
          flags: parseJson(riskScore.flags, []),
          factors: riskScore.factors.map((f: any) => ({
            factorDef: { name: f.factorDef.name, category: f.factorDef.category },
            factorScore: f.factorScore,
            weight: f.weight,
            explanation: f.explanation,
            evidence: parseJson(f.evidence, []),
          })),
        }
      : null,
    documents: documents.map(({ extractedData, ...d }: any) => ({
      ...d,
      verification: parseJson<any>(extractedData, {}).verification?.overall ?? null,
    })),
    matches: matchRows.map((m: any) => ({
      id: m.id,
      matchType: m.matchType,
      overallScore: m.overallScore,
      status: m.status,
      other: m.propertyAId === raw.id ? m.propertyB : m.propertyA,
    })),
  } as unknown as PropertyDetail;
}

/** After a property changes: re-check for duplicates, then refresh its risk score. */
function refreshInBackground(tenantId: string, propertyId: string) {
  runPropertyMatching(tenantId, propertyId)
    .catch((err) => console.error(`[matching] background run failed for ${propertyId}:`, err))
    .finally(() => scheduleRiskRecompute(tenantId, propertyId));
}

// ─── Service methods ───

export async function searchProperties(
  tenantId: string,
  input: PropertySearchInput,
): Promise<{ properties: PropertyListItem[]; total: number; page: number; totalPages: number }> {
  const where: Record<string, any> = { tenantId, deletedAt: null };

  // Text search across title, survey number, and address
  if (input.q) {
    const q = input.q.trim();
    where.OR = [
      { title: { contains: q } },
      { surveyNumber: { contains: q } },
      { khasraNumber: { contains: q } },
      { address: { line1: { contains: q } } },
      { address: { city: { contains: q } } },
      { owner: { OR: [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
      ]}},
    ];
  }

  if (input.status) where.status = input.status as any;
  if (input.propertyType) where.propertyTypeId = input.propertyType;
  if (input.district) where.address = { district: { equals: input.district } };
  if (input.brokerId) where.brokerId = input.brokerId;
  if (input.ownerId) where.ownerId = input.ownerId;
  if (input.priceMin || input.priceMax) {
    where.price = {};
    if (input.priceMin) where.price.gte = input.priceMin;
    if (input.priceMax) where.price.lte = input.priceMax;
  }
  if (input.areaMin || input.areaMax) {
    where.areaSqft = {};
    if (input.areaMin) where.areaSqft.gte = input.areaMin;
    if (input.areaMax) where.areaSqft.lte = input.areaMax;
  }
  if (input.riskLevel) {
    where.riskScore = { riskLevel: input.riskLevel as any };
  }

  // metadata is stored as JSON text, so match the taluka inside it
  if (input.taluka) {
    where.metadata = { contains: `"taluka":"${input.taluka}"` };
  }

  const skip = (input.page - 1) * input.limit;
  const orderBy: Record<string, any> = {
    [input.sort === "area_sqft" ? "areaSqft" : input.sort === "created_at" ? "createdAt" : input.sort === "updated_at" ? "updatedAt" : input.sort]: input.order,
  };

  const [properties, total] = await Promise.all([
    prisma.property.findMany({ where, include: LIST_INCLUDE, skip, take: input.limit, orderBy }),
    prisma.property.count({ where }),
  ]);

  return {
    properties: properties.map(withParsedMetadata) as unknown as PropertyListItem[],
    total,
    page: input.page,
    totalPages: Math.ceil(total / input.limit),
  };
}

export async function getPropertyById(tenantId: string, id: string): Promise<PropertyDetail | null> {
  const property = await prisma.property.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: DETAIL_INCLUDE,
  });
  return property ? shapeDetail(tenantId, property) : null;
}

export async function createProperty(
  tenantId: string,
  brokerId: string,
  input: CreatePropertyInput,
): Promise<PropertyDetail> {
  // gut / CTS numbers have no column of their own — keep them with the other survey details
  const { address: addressInput, metadata, gutNumber, ctsNumber, ...propertyData } = input;
  const extraMeta = { ...(gutNumber ? { gutNumber } : {}), ...(ctsNumber ? { ctsNumber } : {}) };

  // Prisma won't mix foreign-key fields (propertyTypeId, ownerId…) with a nested address create,
  // so the address is created first and linked by id.
  const address = await prisma.address.create({ data: { ...addressInput, country: addressInput.country || "IN" } });

  const property = await prisma.property.create({
    data: {
      ...propertyData,
      tenantId,
      brokerId,
      addressId: address.id,
      status: "DRAFT",
      metadata: JSON.stringify({ ...(metadata || {}), ...extraMeta }),
    },
    include: DETAIL_INCLUDE,
  });

  refreshInBackground(tenantId, property.id);
  return shapeDetail(tenantId, property);
}

export async function updateProperty(
  tenantId: string,
  id: string,
  input: UpdatePropertyInput,
): Promise<PropertyDetail> {
  const { address: addressInput, metadata, gutNumber, ctsNumber, ...propertyData } = input;
  const extraMeta = { ...(gutNumber ? { gutNumber } : {}), ...(ctsNumber ? { ctsNumber } : {}) };

  const existing = await prisma.property.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!existing) throw new Error("Property not found");

  const updateData: Record<string, any> = { ...propertyData };

  if (addressInput) {
    await prisma.address.update({ where: { id: existing.addressId }, data: addressInput });
  }
  if (metadata || Object.keys(extraMeta).length) {
    updateData.metadata = JSON.stringify({ ...parseJson<object>(existing.metadata, {}), ...(metadata || {}), ...extraMeta });
  }
  if (input.status === "LISTED" && !existing.listedAt) {
    updateData.listedAt = new Date();
  }

  const property = await prisma.property.update({
    where: { id },
    data: updateData,
    include: DETAIL_INCLUDE,
  });

  refreshInBackground(tenantId, id);
  return shapeDetail(tenantId, property);
}

export async function deleteProperty(tenantId: string, id: string): Promise<void> {
  const existing = await prisma.property.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new Error("Property not found");

  // Duplicate/conflict candidates that involved this property are no longer relevant
  await prisma.propertyMatch.deleteMany({
    where: { tenantId, status: "pending", OR: [{ propertyAId: id }, { propertyBId: id }] },
  });
  await prisma.property.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });
}

export async function getPropertyStats(tenantId: string): Promise<PropertyStats> {
  const properties = await prisma.property.findMany({
    where: { tenantId, deletedAt: null },
    select: { status: true, price: true, areaSqft: true, propertyTypeId: true },
  });

  const riskScores = await prisma.riskScore.findMany({
    where: { tenantId },
    select: { riskLevel: true },
  });

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalPrice = 0;
  let priceCount = 0;
  let totalArea = 0;

  for (const p of properties) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    byType[p.propertyTypeId] = (byType[p.propertyTypeId] || 0) + 1;
    if (p.price) { totalPrice += Number(p.price); priceCount++; }
    if (p.areaSqft) totalArea += Number(p.areaSqft);
  }

  const byRisk: Record<string, number> = {};
  for (const r of riskScores) {
    byRisk[r.riskLevel] = (byRisk[r.riskLevel] || 0) + 1;
  }

  return {
    total: properties.length,
    byStatus,
    byRisk,
    byType,
    avgPrice: priceCount > 0 ? Math.round(totalPrice / priceCount) : 0,
    totalArea: Math.round(totalArea),
  };
}

export async function findDuplicates(tenantId: string, surveyNumber: string, excludeId?: string) {
  if (!surveyNumber) return [];
  const where: Record<string, any> = {
    tenantId,
    surveyNumber,
    deletedAt: null,
  };
  if (excludeId) where.id = { not: excludeId };
  return prisma.property.findMany({
    where,
    select: { id: true, title: true, surveyNumber: true, brokerId: true, price: true, status: true },
  });
}
