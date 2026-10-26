// Imports the Pune real-estate listings dataset into PropIntel.
//
//   npm run dataset:import                    → back up the DB, replace the demo properties, import
//   npm run dataset:import -- --keep-existing → add to what is already there instead of replacing
//   npm run dataset:import -- --seed 7        → different (but reproducible) synthetic layer
//
// Needs the base seed first (tenant, users, document types):  npm run db:seed

import * as fs from "node:fs";
import * as path from "node:path";
import { prisma } from "../src/lib/db/client";
import { runPropertyMatching } from "../src/modules/matching/matching.service";
import { recomputeAllRisk, waitForRiskIdle } from "../src/modules/risk/risk.service";
import { buildPlan, parseCsv, sentimentFromHeadline, localitiesMentioned, mulberry32 } from "../src/modules/dataset/pune-dataset";

const CSV_PATH = path.join(process.cwd(), "data", "pune-real-estate", "listings.csv");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function backupDatabase(): string | null {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) return null;
  const dbPath = path.resolve(process.cwd(), "prisma", url.replace(/^file:/, ""));
  if (!fs.existsSync(dbPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = `${dbPath}.before-pune-import-${stamp}.bak`;
  fs.copyFileSync(dbPath, target);
  return target;
}

async function wipeExistingPropertyData(tenantId: string) {
  console.log("Clearing existing property data …");

  const docs: { fileUrl: string }[] = await prisma.document.findMany({ where: { property: { tenantId } }, select: { fileUrl: true } });
  for (const d of docs) {
    try {
      fs.unlinkSync(path.join(process.cwd(), "uploads", "documents", path.basename(d.fileUrl)));
    } catch {}
  }

  const propertyScope = { property: { tenantId } };
  await prisma.riskScoreFactor.deleteMany({ where: { riskScore: { tenantId } } });
  await prisma.riskScore.deleteMany({ where: { tenantId } });
  await prisma.propertyMatch.deleteMany({ where: { tenantId } });
  await prisma.document.deleteMany({ where: propertyScope });
  await prisma.notification.deleteMany({ where: { tenantId, propertyId: { not: null } } });
  await prisma.newspaperPropertyMention.deleteMany({ where: { tenantId } });

  const caseScope = { courtCase: { tenantId } };
  await prisma.courtCasePropertyLink.deleteMany({ where: caseScope });
  await prisma.courtHearing.deleteMany({ where: caseScope });
  await prisma.courtOrder.deleteMany({ where: caseScope });
  await prisma.courtCaseParty.deleteMany({ where: caseScope });
  await prisma.courtCase.deleteMany({ where: { tenantId } });

  await prisma.propertyMedia.deleteMany({ where: propertyScope });
  await prisma.property.deleteMany({ where: { tenantId } });
  // addresses that no property points at any more
  await prisma.address.deleteMany({ where: { properties: { none: {} } } });
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`Dataset not found at ${CSV_PATH}. Run: python scripts/download-pune-dataset.py`);

  const tenant = await prisma.tenant.findFirst({ where: value("tenant") ? { id: value("tenant") } : {}, orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("No tenant found — run `npm run db:seed` first.");

  const usersWithRole = (role: string): Promise<{ id: string; firstName: string; lastName: string }[]> =>
    prisma.user.findMany({ where: { tenantId: tenant.id, isActive: true, deletedAt: null, role: { name: role } }, select: { id: true, firstName: true, lastName: true }, orderBy: { id: "asc" } });
  const owners = await usersWithRole("land_owner");
  const ownerIds = owners.map((u) => u.id);
  const ownerNames = Object.fromEntries(owners.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const brokerIds = (await usersWithRole("broker")).map((u) => u.id);
  if (!ownerIds.length || !brokerIds.length) throw new Error("Need land_owner and broker users — run `npm run db:seed` first.");

  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const plan = buildPlan(rows, { ownerIds, ownerNames, brokerIds, seed: value("seed") ? Number(value("seed")) : undefined });
  console.log(`Dataset: ${rows.length} CSV rows → ${plan.properties.length} properties, ${plan.courtCases.length} court cases`);

  if (!flag("keep-existing")) {
    const bak = flag("no-backup") ? null : backupDatabase();
    if (bak) console.log(`Backup written: ${path.relative(process.cwd(), bak)}`);
    await wipeExistingPropertyData(tenant.id);
  }

  // ── properties + addresses ──
  const now = Date.now();
  console.log("Importing properties …");
  for (const batch of chunks(plan.properties, 100)) {
    await prisma.address.createMany({
      data: batch.map((p) => ({ id: `addr-${p.id}`, ...p.address, country: "IN" })),
    });
    await prisma.property.createMany({
      data: batch.map((p, i) => ({
        id: p.id,
        tenantId: tenant.id,
        ownerId: p.ownerId,
        brokerId: p.brokerId,
        addressId: `addr-${p.id}`,
        propertyTypeId: p.propertyTypeId,
        title: p.title,
        description: p.description,
        price: p.price,
        areaSqft: p.areaSqft,
        status: p.status,
        surveyNumber: p.surveyNumber,
        metadata: JSON.stringify({
          ...p.metadata,
          ...(p.recordScenario && { scenario: p.recordScenario }),
          ...(p.docScenario && { docScenario: p.docScenario }),
        }),
        listedAt: p.status === "DRAFT" ? null : new Date(now - ((p.sourceRow ?? i) % 200 + 1) * 86400000),
        createdAt: new Date(now - ((p.sourceRow ?? i) % 365 + 1) * 86400000),
      })),
    });
  }

  // ── court cases ──
  console.log("Importing court cases …");
  for (const batch of chunks(plan.courtCases, 100)) {
    await prisma.courtCase.createMany({
      data: batch.map((c) => ({
        id: c.id,
        tenantId: tenant.id,
        caseNumber: c.caseNumber,
        courtName: c.courtName,
        courtType: c.courtType,
        jurisdiction: "Pune",
        caseType: c.caseType,
        caseStatus: c.caseStatus,
        title: c.title,
        description: c.description,
        filingDate: c.filingDate,
        nextHearingDate: c.nextHearingDate,
        dispositionDate: c.dispositionDate,
      })),
    });
    await prisma.courtCaseParty.createMany({
      data: batch.flatMap((c) => c.parties.map((p) => ({ caseId: c.id, partyName: p.name, partyRole: p.role, advocateName: p.advocate }))),
    });
    await prisma.courtCasePropertyLink.createMany({
      data: batch.map((c) => ({ caseId: c.id, propertyId: c.propertyId, linkType: c.linkType, impactScore: c.impactScore, description: c.description })),
    });
    await prisma.courtHearing.createMany({
      data: batch.map((c) => ({
        caseId: c.id,
        hearingDate: c.nextHearingDate ?? c.dispositionDate ?? c.filingDate,
        hearingType: c.caseStatus === "ACTIVE" ? "Arguments" : "Final hearing",
        status: c.caseStatus === "ACTIVE" ? "PENDING" : "PASSED",
        outcome: c.caseStatus === "ACTIVE" ? null : "Disposed",
      })),
    });
    await prisma.courtOrder.createMany({
      data: batch
        .filter((c) => c.stayOrder)
        .map((c) => ({
          caseId: c.id,
          orderType: "Interim stay order",
          orderDate: new Date(c.filingDate.getTime() + 45 * 86400000),
          summary: "Court has granted an interim stay on mutation / transfer of the property.",
          affectsTitle: true,
          isStayOrder: true,
        })),
    });
  }

  // ── news: link existing articles to properties in the localities they mention ──
  const articles: { id: string; headline: string; summary: string | null }[] = await prisma.newspaperArticle.findMany({
    where: { source: { tenantId: tenant.id } },
    select: { id: true, headline: true, summary: true },
    orderBy: { id: "asc" },
  });
  const rng = mulberry32(99);
  const mentions: any[] = [];
  for (const a of articles) {
    const places = localitiesMentioned(`${a.headline} ${a.summary ?? ""}`);
    const candidates = plan.properties.filter((p) => !p.recordScenario && places.includes(p.metadata.village as string));
    if (!candidates.length) continue;
    const { sentiment, score } = sentimentFromHeadline(a.headline);
    const picked = [...candidates].sort(() => rng() - 0.5).slice(0, 3);
    for (const p of picked) {
      mentions.push({
        articleId: a.id,
        propertyId: p.id,
        tenantId: tenant.id,
        matchType: "ADDRESS_MATCH",
        relevanceScore: Math.round((0.55 + rng() * 0.35) * 100) / 100,
        sentiment,
        sentimentScore: score,
        matchedExcerpt: `…${a.headline}…`,
        reviewed: false,
      });
    }
  }
  if (mentions.length) await prisma.newspaperPropertyMention.createMany({ data: mentions });
  console.log(`News: ${mentions.length} article mentions linked from ${articles.length} articles`);

  // ── duplicates / conflicts, then risk ──
  console.log("Running matching engine on the full dataset …");
  const m = await runPropertyMatching(tenant.id);
  const byType: Record<string, number> = {};
  for (const x of m.matches) byType[x.matchType] = (byType[x.matchType] || 0) + 1;
  console.log(`  ${m.scanned.toLocaleString()} pairs in ${(m.duration / 1000).toFixed(1)}s → ${m.created} matches`, byType);

  console.log("Scoring risk …");
  const r = await recomputeAllRisk(tenant.id);
  console.log(`  ${r.updated} properties scored in ${(r.durationMs / 1000).toFixed(1)}s`, r.byLevel);

  console.log("\nPlan summary:", plan.summary);
  console.log("\nNext: npm run dataset:documents   (sample documents + real OCR for the demo properties)");

  await waitForRiskIdle();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
