// src/modules/court/court-lookup.service.ts
//
// Live court-record lookup for one property. Searching returns candidates only; a case becomes part of
// the property's record (and so its risk score) only when a person chooses to link it.

import { prisma } from "@/lib/db/client";
import { scheduleRiskRecompute } from "@/modules/risk/risk.service";
import { getCase, searchCases, type LiveCaseDetail, type LiveCaseSummary } from "./ecourts.client";

const SOURCE_TAG = "eCourtsIndia";
const STAY_WORDS = /\b(stay|injunction|status\s*quo|restrain)/i;
const CLOSED = /disposed|closed|dismissed|withdrawn|decided|settled/i;

export interface SearchTerms {
  litigant?: string;
  query?: string;
}

async function loadProperty(tenantId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId, deletedAt: null },
    include: { owner: true, address: true },
  });
  if (!property) throw new Error("Property not found");
  return property;
}

/** What to look for by default: the owner on record as a litigant, otherwise the locality as free text. */
export async function suggestTerms(tenantId: string, propertyId: string): Promise<SearchTerms> {
  const p = await loadProperty(tenantId, propertyId);
  if (p.owner) return { litigant: `${p.owner.firstName} ${p.owner.lastName}`.trim() };
  const line = (p.address.line1 || "").replace(/^survey\s*(no\.?|number)?\s*[\w/\-]+,?\s*/i, "").trim();
  return { query: [line, p.address.city].filter(Boolean).join(" ") };
}

export interface LookupResult {
  terms: SearchTerms;
  cases: (LiveCaseSummary & { linked: boolean })[];
}

export async function lookupForProperty(tenantId: string, propertyId: string, override: SearchTerms = {}): Promise<LookupResult> {
  const terms: SearchTerms =
    override.litigant?.trim() || override.query?.trim()
      ? { litigant: override.litigant?.trim() || undefined, query: override.query?.trim() || undefined }
      : await suggestTerms(tenantId, propertyId);

  const cases = await searchCases({ ...terms, pageSize: 10 });
  const already = await prisma.courtCasePropertyLink.findMany({
    where: { propertyId, courtCase: { tenantId } },
    select: { courtCase: { select: { description: true } } },
  });
  const linked = (cnr: string) => already.some((l: any) => l.courtCase.description?.includes(`CNR ${cnr}`));
  return { terms, cases: cases.map((c) => ({ ...c, linked: linked(c.cnr) })) };
}

const toDate = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Fetches one case in full, saves it, and links it to the property. Safe to repeat for the same case. */
export async function linkCaseToProperty(tenantId: string, propertyId: string, cnr: string): Promise<{ caseId: string; created: boolean }> {
  await loadProperty(tenantId, propertyId);

  const existing = await prisma.courtCase.findFirst({ where: { tenantId, description: { contains: `CNR ${cnr}` } } });
  let caseId = existing?.id;
  const created = !existing;

  if (!existing) {
    const c: LiveCaseDetail = await getCase(cnr);
    const stay = c.orders.filter((o) => o.interim && STAY_WORDS.test(o.type));
    const row = await prisma.courtCase.create({
      data: {
        tenantId,
        caseNumber: c.caseNumber,
        courtName: c.courtName ?? "Court not stated",
        caseType: c.caseType,
        caseStatus: c.caseStatus,
        title: [c.petitioners[0], c.respondents[0]].filter(Boolean).join(" vs ") || c.caseNumber,
        description: `CNR ${c.cnr} · source ${SOURCE_TAG}`,
        filingDate: toDate(c.filingDate),
        nextHearingDate: CLOSED.test(c.caseStatus) ? null : toDate(c.nextHearingDate),
        dispositionDate: toDate(c.decisionDate),
        parties: {
          create: [
            ...c.petitioners.map((n, i) => ({ partyName: n, partyRole: "PETITIONER", advocateName: c.petitionerAdvocates[i] ?? null })),
            ...c.respondents.map((n, i) => ({ partyName: n, partyRole: "RESPONDENT", advocateName: c.respondentAdvocates[i] ?? null })),
          ],
        },
        hearings: {
          create: c.hearings.flatMap((h) => {
            const d = toDate(h.date);
            return d ? [{ hearingDate: d, hearingType: h.purpose, judgeName: h.judge, status: "DONE" }] : [];
          }),
        },
        orders: {
          create: c.orders.flatMap((o) => {
            const d = toDate(o.date) ?? toDate(c.decisionDate) ?? new Date();
            return [{ orderType: o.type, orderDate: d, documentUrl: o.url, isStayOrder: stay.includes(o), affectsTitle: false, summary: null }];
          }),
        },
      },
    });
    caseId = row.id;
  }

  const link = await prisma.courtCasePropertyLink.findFirst({ where: { caseId: caseId!, propertyId } });
  if (!link) {
    await prisma.courtCasePropertyLink.create({
      data: { caseId: caseId!, propertyId, linkType: "LIVE_RECORD", description: `Linked from ${SOURCE_TAG} by a reviewer`, impactScore: 0.5 },
    });
  }
  scheduleRiskRecompute(tenantId, propertyId);
  return { caseId: caseId!, created };
}
