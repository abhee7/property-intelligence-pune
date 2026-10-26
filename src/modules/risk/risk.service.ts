// src/modules/risk/risk.service.ts
//
// Loads everything we know about a property, scores it with risk.engine,
// and saves the result (RiskScore + one RiskScoreFactor per factor).

import { prisma } from "@/lib/db/client";
import { isRiskEscalation, notifyRiskEscalation } from "@/modules/notifications/notification.service";
import { decideNarrative, generateAiNarrative, hashNarrativeInput, buildNarrativeInput, type NarrativeTrigger } from "./risk.narrative";
import { getAiConfig } from "@/lib/ai/claude";
import { computeRisk, DEFAULT_FACTOR_WEIGHTS, FACTOR_NAMES, type FactorKey, type RiskComputation, type RiskInputs } from "./risk.engine";

const RISK_VALIDITY_DAYS = 30;

const FACTOR_CATEGORY: Record<FactorKey, string> = {
  title: "legal",
  legal: "legal",
  documents: "document",
  ownership: "ownership",
  news: "media",
};
const FACTOR_ORDER: FactorKey[] = ["title", "legal", "documents", "ownership", "news"];

// ─── Shared lookups (loaded once per recompute run) ───

interface SharedContext {
  definitions: Map<FactorKey, { id: string; defaultWeight: number }>;
  mandatoryDocTypes: { slug: string; name: string }[];
}

async function ensureDefinitions(): Promise<SharedContext["definitions"]> {
  const rows = await prisma.riskFactorDefinition.findMany();
  const byName = new Map<string, any>(rows.map((r: any) => [r.name, r]));
  const out = new Map<FactorKey, { id: string; defaultWeight: number }>();

  for (const [idx, key] of FACTOR_ORDER.entries()) {
    const name = FACTOR_NAMES[key];
    let row = byName.get(name);
    if (!row) {
      row = await prisma.riskFactorDefinition.create({
        data: { name, category: FACTOR_CATEGORY[key], defaultWeight: DEFAULT_FACTOR_WEIGHTS[key], sortOrder: idx + 1 },
      });
    }
    out.set(key, { id: row.id, defaultWeight: row.defaultWeight });
  }
  return out;
}

async function loadShared(): Promise<SharedContext> {
  const [definitions, types] = await Promise.all([
    ensureDefinitions(),
    prisma.documentType.findMany({ where: { isMandatory: true }, select: { slug: true, name: true } }),
  ]);
  return { definitions, mandatoryDocTypes: types };
}

/** Per-tenant weight overrides live in TenantSettings.riskWeights, keyed by factor key or factor name. */
async function tenantWeights(tenantId: string): Promise<Partial<Record<FactorKey, number>>> {
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId }, select: { riskWeights: true } });
  let raw: Record<string, number> = {};
  try {
    raw = JSON.parse(settings?.riskWeights || "{}");
  } catch {}
  const out: Partial<Record<FactorKey, number>> = {};
  for (const key of FACTOR_ORDER) {
    const v = raw[key] ?? raw[FACTOR_NAMES[key]];
    if (typeof v === "number" && v >= 0) out[key] = v;
  }
  return out;
}

// ─── Gathering inputs ───

export async function gatherRiskInputs(tenantId: string, propertyId: string, shared?: SharedContext): Promise<RiskInputs | null> {
  const ctx = shared ?? (await loadShared());

  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId, deletedAt: null },
    select: {
      status: true,
      surveyNumber: true,
      ownerId: true,
      courtLinks: {
        select: {
          linkType: true,
          impactScore: true,
          courtCase: {
            select: {
              caseNumber: true,
              caseStatus: true,
              nextHearingDate: true,
              orders: { select: { isStayOrder: true, affectsTitle: true } },
            },
          },
        },
      },
      newsMentions: {
        select: { sentiment: true, sentimentScore: true, relevanceScore: true, article: { select: { headline: true } } },
      },
      documents: {
        where: { deletedAt: null },
        select: {
          originalName: true,
          ocrStatus: true,
          extractedData: true,
          documentType: { select: { slug: true, name: true, requiresOcr: true } },
        },
      },
    },
  });
  if (!property) return null;

  const matches = await prisma.propertyMatch.findMany({
    where: {
      tenantId,
      status: { not: "dismissed" },
      OR: [{ propertyAId: propertyId }, { propertyBId: propertyId }],
      propertyA: { deletedAt: null },
      propertyB: { deletedAt: null },
    },
    select: { matchType: true, status: true },
  });

  return {
    property: { status: property.status, surveyNumber: property.surveyNumber, hasOwner: !!property.ownerId },
    courtCases: property.courtLinks.map((l: any) => ({
      caseNumber: l.courtCase.caseNumber,
      caseStatus: l.courtCase.caseStatus,
      linkType: l.linkType,
      impactScore: l.impactScore,
      nextHearingDate: l.courtCase.nextHearingDate,
      hasStayOrder: l.courtCase.orders.some((o: any) => o.isStayOrder),
      affectsTitle: l.courtCase.orders.some((o: any) => o.affectsTitle),
    })),
    news: property.newsMentions.map((n: any) => ({
      headline: n.article?.headline ?? "Untitled article",
      sentiment: n.sentiment,
      sentimentScore: n.sentimentScore,
      relevanceScore: n.relevanceScore,
    })),
    mandatoryDocTypes: ctx.mandatoryDocTypes,
    documents: property.documents.map((d: any) => {
      let verification: RiskInputs["documents"][number]["verification"] = null;
      try {
        const v = JSON.parse(d.extractedData || "{}").verification;
        if (v) {
          verification = {
            overall: v.overall,
            checks: (v.checks || []).map((c: any) => ({ field: c.field, label: c.label, status: c.status })),
            kindMismatch: !!v.kindMismatch,
            pointsToOtherProperty: (v.possibleOtherProperties?.length ?? 0) > 0,
          };
        }
      } catch {}
      return {
        name: d.originalName,
        typeSlug: d.documentType.slug,
        typeName: d.documentType.name,
        requiresOcr: d.documentType.requiresOcr,
        ocrStatus: d.ocrStatus,
        verification,
      };
    }),
    matches,
  };
}

// ─── Serialised execution ───
// SQLite allows one writer at a time. Risk writes come from many places (OCR finishing,
// a matching run, a manual button) — running them one after another avoids lock timeouts.

const queueState = globalThis as unknown as { __riskQueue?: Promise<unknown> };

function runExclusive<T>(job: () => Promise<T>): Promise<T> {
  const next = (queueState.__riskQueue ?? Promise.resolve()).then(job, job);
  queueState.__riskQueue = next.catch(() => undefined);
  return next;
}

/** Resolves once every queued risk computation has finished. */
export function waitForRiskIdle(): Promise<void> {
  return (queueState.__riskQueue ?? Promise.resolve()).then(() => undefined);
}

// ─── Compute + save ───

/** What happened to the narrative on this run. */
export interface NarrativeStatus {
  source: "rules" | "ai" | "kept"; // kept = the stored Claude narrative still matches this exact data
  requested: boolean; // a person asked for the AI version
  ok?: boolean;
  reason?: string;
  kind?: string;
  model?: string;
}

export type RiskRun = RiskComputation & { narrativeStatus: NarrativeStatus };

export interface RiskRunOptions {
  /** manual = a person asked for an AI narrative; event = something changed; bulk = recalculating everything */
  trigger?: NarrativeTrigger;
}

export async function computeAndSaveRisk(tenantId: string, propertyId: string, opts: RiskRunOptions = {}): Promise<RiskRun | null> {
  const trigger = opts.trigger ?? "event";
  const saved = await runExclusive(() => computeAndSaveRiskNow(tenantId, propertyId, undefined, trigger));
  if (!saved) return null;

  // Tell people when a property has just become High / Critical (never during a bulk recalculation)
  if (trigger !== "bulk" && isRiskEscalation(saved.previousLevel, saved.result.riskLevel)) {
    try {
      await runExclusive(() => notifyRiskEscalation(tenantId, propertyId, saved.previousLevel!, saved.result.riskLevel, saved.result.overallScore));
    } catch (err) {
      console.warn("[risk] could not send the escalation alert:", (err as Error)?.message || err);
    }
  }

  const status: NarrativeStatus = { source: saved.decision === "keep" ? "kept" : "rules", requested: trigger === "manual" };

  // The Claude call happens OUTSIDE the database queue so a slow API call never blocks other risk updates.
  if (saved.decision === "generate" && saved.property) {
    const outcome = await generateAiNarrative(saved.result, saved.property);
    if (outcome.ok) {
      await runExclusive(() => storeAiNarrative(propertyId, saved.hash, outcome.text, outcome.model));
      Object.assign(status, { source: "ai", ok: true, model: outcome.model });
    } else {
      Object.assign(status, { ok: false, reason: outcome.reason, kind: outcome.kind });
    }
  } else if (trigger === "manual" && saved.decision === "rules") {
    Object.assign(status, { ok: false, kind: "disabled", reason: getAiConfig().configured ? "AI narratives are switched off (AI_NARRATIVES=off)" : "No Claude API key is configured — add ANTHROPIC_API_KEY to .env" });
  }

  return { ...saved.result, narrativeStatus: status };
}

/** Saves a Claude narrative only if the stored score still describes the same data it was written about. */
async function storeAiNarrative(propertyId: string, hash: string, text: string, model: string) {
  await prisma.riskScore.updateMany({
    where: { propertyId, inputsHash: hash },
    data: { aiNarrative: text, narrativeSource: "ai", narrativeModel: model },
  });
}

async function computeAndSaveRiskNow(
  tenantId: string,
  propertyId: string,
  shared: SharedContext | undefined,
  trigger: NarrativeTrigger,
) {
  const ctx = shared ?? (await loadShared());
  const inputs = await gatherRiskInputs(tenantId, propertyId, ctx);
  if (!inputs) return null;

  const result = computeRisk(inputs, await tenantWeights(tenantId));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RISK_VALIDITY_DAYS * 86400000);

  // Keep an existing Claude narrative while the data it describes hasn't changed
  const existing = await prisma.riskScore.findUnique({ where: { propertyId }, select: { narrativeSource: true, inputsHash: true, riskLevel: true } });
  const cfg = getAiConfig();
  const header = { title: "", locality: null as string | null, status: "" };
  const hash = hashNarrativeInput(buildNarrativeInput(result, header)); // hash ignores the property header
  const decision = decideNarrative(existing, hash, { trigger, mode: cfg.narratives, configured: cfg.configured });

  let property: { title: string; locality: string | null; status: string } | null = null;
  if (decision === "generate") {
    const row = await prisma.property.findFirst({ where: { id: propertyId, tenantId }, select: { title: true, status: true, metadata: true } });
    let locality: string | null = null;
    try {
      locality = JSON.parse(row?.metadata || "{}").village ?? null;
    } catch {}
    if (row) property = { title: row.title, locality, status: row.status };
  }

  const scoreFields = {
    overallScore: result.overallScore,
    riskLevel: result.riskLevel,
    flags: JSON.stringify(result.flags),
    computedAt: now,
    expiresAt,
    inputsHash: hash,
  };
  // "keep" leaves the stored AI narrative (and its source / model) untouched
  const narrativeFields = decision === "keep" ? {} : { aiNarrative: result.narrative, narrativeSource: "rules", narrativeModel: null };

  await prisma.$transaction(async (tx: any) => {
    const score = await tx.riskScore.upsert({
      where: { propertyId },
      create: { propertyId, tenantId, aiNarrative: result.narrative, ...scoreFields },
      update: { ...scoreFields, ...narrativeFields },
    });

    await tx.riskScoreFactor.deleteMany({ where: { riskScoreId: score.id } });
    for (const f of result.factors) {
      await tx.riskScoreFactor.create({
        data: {
          riskScoreId: score.id,
          factorDefId: ctx.definitions.get(f.key)!.id,
          factorScore: f.score,
          weight: f.weight,
          evidence: JSON.stringify(f.evidence),
          explanation: f.explanation,
        },
      });
    }
  });

  return { result, hash, decision, property, previousLevel: (existing?.riskLevel as string | undefined) ?? null };
}

export function recomputeAllRisk(tenantId: string): Promise<{ updated: number; failed: number; byLevel: Record<string, number>; durationMs: number }> {
  return runExclusive(() => recomputeAllRiskNow(tenantId));
}

async function recomputeAllRiskNow(tenantId: string): Promise<{ updated: number; failed: number; byLevel: Record<string, number>; durationMs: number }> {
  const start = Date.now();
  const ctx = await loadShared();
  const properties = await prisma.property.findMany({ where: { tenantId, deletedAt: null }, select: { id: true } });

  let updated = 0;
  let failed = 0;
  const byLevel: Record<string, number> = {};

  for (const { id } of properties) {
    try {
      const r = await computeAndSaveRiskNow(tenantId, id, ctx, "bulk");
      if (r) {
        updated++;
        byLevel[r.result.riskLevel] = (byLevel[r.result.riskLevel] || 0) + 1;
      }
    } catch (err) {
      failed++;
      console.error(`[risk] failed for ${id}:`, err);
    }
  }
  return { updated, failed, byLevel, durationMs: Date.now() - start };
}

// ─── Background refresh ───
// Called whenever something that feeds the score changes (OCR finished, match reviewed, …).
// Debounced so a burst of changes to one property recomputes it once.

const g = globalThis as unknown as { __riskTimers?: Map<string, ReturnType<typeof setTimeout>> };

export function scheduleRiskRecompute(tenantId: string, propertyId: string): void {
  g.__riskTimers ??= new Map();
  const key = `${tenantId}:${propertyId}`;
  clearTimeout(g.__riskTimers.get(key));

  const timer = setTimeout(() => {
    g.__riskTimers!.delete(key);
    computeAndSaveRisk(tenantId, propertyId, { trigger: "event" }).catch((err) => console.error(`[risk] recompute failed for ${propertyId}:`, err));
  }, 400);
  timer.unref?.();
  g.__riskTimers.set(key, timer);
}

// ─── Reading ───

export async function getPropertyRisk(tenantId: string, propertyId: string) {
  const risk = await prisma.riskScore.findFirst({
    where: { propertyId, tenantId },
    include: { factors: { include: { factorDef: true }, orderBy: { factorDef: { sortOrder: "asc" } } } },
  });
  if (!risk) return null;

  const parse = (s: string, fallback: any) => {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  };

  return {
    overallScore: risk.overallScore,
    riskLevel: risk.riskLevel,
    aiNarrative: risk.aiNarrative,
    narrativeSource: risk.narrativeSource,
    narrativeModel: risk.narrativeModel,
    computedAt: risk.computedAt,
    expiresAt: risk.expiresAt,
    flags: parse(risk.flags, []),
    factors: risk.factors.map((f: any) => ({
      name: f.factorDef.name,
      category: f.factorDef.category,
      score: f.factorScore,
      weight: f.weight,
      explanation: f.explanation,
      evidence: parse(f.evidence, []),
    })),
  };
}
