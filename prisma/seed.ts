// prisma/seed.ts — Run with: npx prisma db seed
// Self-contained — no external JSON files needed

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { runPropertyMatching } from "../src/modules/matching/matching.service";
import { recomputeAllRisk } from "../src/modules/risk/risk.service";

const prisma = new PrismaClient();
const TENANT_ID = "t-demo-001";
const PASSWORD = "Demo@12345";

// Seeded, so every install gets the same names — the documented demo (DEMO.md) depends on who owns what.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20260723);
function rand(a: number, b: number) { return Math.floor(random() * (b - a + 1)) + a; }
function pick<T>(arr: T[]): T { return arr[Math.floor(random() * arr.length)]; }
function pastDate(daysBack: number) { const d = new Date(); d.setDate(d.getDate() - rand(1, daysBack)); return d; }

const FIRST_M = ["Rajesh","Sunil","Amit","Vikram","Sachin","Mahesh","Anil","Sanjay","Pramod","Ramesh","Vinod","Ashok","Deepak","Nitin","Suresh","Ganesh","Prashant","Ravi","Manish","Ajay"];
const FIRST_F = ["Sunita","Anita","Rekha","Savita","Meena","Lata","Priya","Swati","Manisha","Jyoti"];
const LAST = ["Patil","Deshmukh","Kulkarni","Joshi","Deshpande","Pawar","Jadhav","More","Shinde","Gaikwad","Bhosale","Kadam","Salunkhe","Mane","Chavan","Kale","Sharma","Gupta","Mehta","Shah"];
const TALUKAS = ["Haveli","Mulshi","Maval","Bhor","Velhe","Purandar","Baramati","Shirur","Khed","Ambegaon"];
const VILLAGES: Record<string,string[]> = { Haveli:["Hadapsar","Kharadi","Wagholi","Mundhwa","Undri","Baner"], Mulshi:["Hinjewadi","Pirangut","Paud","Lavale","Maan"], Maval:["Talegaon","Kamshet","Kanhe"], Bhor:["Bhor","Nasrapur"], Baramati:["Baramati","Morgaon"], Shirur:["Shirur","Ranjangaon"], Khed:["Chakan","Alandi"], Ambegaon:["Ambegaon Budruk","Manchar"], Velhe:["Velhe","Torna"], Purandar:["Saswad","Jejuri"] };
const TYPES = [
  { id:"pt-residential", name:"Residential plot", slug:"residential-plot" },
  { id:"pt-commercial", name:"Commercial plot", slug:"commercial-plot" },
  { id:"pt-agricultural", name:"Agricultural land", slug:"agricultural-land" },
  { id:"pt-flat", name:"Flat / Apartment", slug:"flat-apartment" },
  { id:"pt-rowhouse", name:"Row house", slug:"row-house" },
  { id:"pt-bungalow", name:"Bungalow", slug:"bungalow" },
  { id:"pt-industrial", name:"Industrial gala", slug:"industrial-gala" },
  { id:"pt-farmhouse", name:"Farm house", slug:"farm-house" },
];
const DOC_TYPES = [
  { id:"dt-title", name:"Title deed", slug:"title-deed", requiresOcr:true, isMandatory:true },
  { id:"dt-712", name:"7/12 extract", slug:"7-12-extract", requiresOcr:true, isMandatory:true },
  { id:"dt-encumbrance", name:"Encumbrance certificate", slug:"encumbrance-cert", requiresOcr:true, isMandatory:true },
  { id:"dt-tax", name:"Property tax receipt", slug:"tax-receipt", requiresOcr:true, isMandatory:false },
  { id:"dt-sale", name:"Sale deed", slug:"sale-deed", requiresOcr:true, isMandatory:false },
  { id:"dt-photo", name:"Site photographs", slug:"site-photo", requiresOcr:false, isMandatory:false },
];
const STATUSES = ["DRAFT","LISTED","UNDER_VERIFICATION","VERIFIED","FLAGGED"];
const RISK_LEVELS = ["MINIMAL","LOW","MODERATE","HIGH","CRITICAL"];
const NEWS_SOURCES = ["Sakal","Lokmat","Maharashtra Times","Pudhari","Loksatta","Pune Mirror","Indian Express","Times of India"];

function surveyNo() { return `${rand(1,500)}/${rand(1,20)}${pick(["","A","B","C"])}`; }
function phone() { return `+91${pick(["70","80","90","98","87","76"])}${rand(10000000,99999999)}`; }
function email(f: string, l: string) { return `${f.toLowerCase()}.${l.toLowerCase()}${rand(1,99)}@${pick(["gmail.com","yahoo.co.in","hotmail.com","outlook.com"])}`; }

async function main() {
  const passwordHash = await hash(PASSWORD, 12);
  console.log("Seeding database...\n");

  // 1. Tenant
  const tenant = await prisma.tenant.upsert({ where: { slug: "sahyadri-demo" }, update: {}, create: { id: TENANT_ID, name: "Sahyadri Land Intelligence", slug: "sahyadri-demo", plan: "PROFESSIONAL", isActive: true } });
  await prisma.tenantSettings.upsert({ where: { tenantId: TENANT_ID }, update: {}, create: { tenantId: TENANT_ID, maxUsers: 100, maxProperties: 5000 } });
  console.log("  ✓ Tenant");

  // 2. Roles
  const roles = [
    { id: "role-admin", name: "admin", displayName: "Platform admin", hierarchyLevel: 1 },
    { id: "role-agency", name: "agency_admin", displayName: "Agency admin", hierarchyLevel: 2 },
    { id: "role-broker", name: "broker", displayName: "Broker", hierarchyLevel: 3 },
    { id: "role-owner", name: "land_owner", displayName: "Land owner", hierarchyLevel: 4 },
  ];
  for (const r of roles) await prisma.role.upsert({ where: { name: r.name }, update: {}, create: r });
  console.log("  ✓ Roles");

  // 3. Users — admin + agency admin + 20 brokers + 50 owners
  const users: Array<{ id: string; roleId: string; firstName: string; lastName: string }> = [];
  
  const userList = [
    { id: "user-admin", roleId: "role-admin", firstName: "System", lastName: "Admin", email: "admin@sahyadri-demo.com" },
    { id: "user-agency", roleId: "role-agency", firstName: "Prashant", lastName: "Kulkarni", email: "manager@sahyadri-demo.com" },
  ];
  // 20 brokers — first one has a fixed email for demo login
  userList.push({ id: "broker-001", roleId: "role-broker", firstName: "Vinod", lastName: "Deshmukh", email: "broker@sahyadri-demo.com" });
  for (let i = 1; i < 20; i++) {
    const fn = pick(i < 16 ? FIRST_M : FIRST_F);
    const ln = pick(LAST);
    userList.push({ id: `broker-${String(i+1).padStart(3,"0")}`, roleId: "role-broker", firstName: fn, lastName: ln, email: email(fn, ln) });
  }
  // 50 owners — first one has a fixed email for demo login
  userList.push({ id: "owner-001", roleId: "role-owner", firstName: "Pramod", lastName: "Lokhande", email: "owner@sahyadri-demo.com" });
  for (let i = 1; i < 50; i++) {
    const fn = pick(i < 35 ? FIRST_M : FIRST_F);
    const ln = pick(LAST);
    userList.push({ id: `owner-${String(i+1).padStart(3,"0")}`, roleId: "role-owner", firstName: fn, lastName: ln, email: email(fn, ln) });
  }

  for (const u of userList) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { id: u.id, tenantId: TENANT_ID, roleId: u.roleId, email: u.email, phone: phone(), passwordHash, firstName: u.firstName, lastName: u.lastName, isActive: true, lastLoginAt: pastDate(30), createdAt: pastDate(365) },
    });
    users.push(u);
  }
  console.log(`  ✓ ${userList.length} Users`);

  // 4. Property types
  for (const t of TYPES) await prisma.propertyType.upsert({ where: { name: t.name }, update: {}, create: t });
  console.log("  ✓ Property types");

  // 5. Document types
  for (const d of DOC_TYPES) await prisma.documentType.upsert({ where: { name: d.name }, update: {}, create: d });
  console.log("  ✓ Document types");

  // 6. 100 Properties with addresses
  const brokerIds = users.filter(u => u.roleId === "role-broker").map(u => u.id);
  const ownerIds = users.filter(u => u.roleId === "role-owner").map(u => u.id);
  const propertyIds: string[] = [];

  for (let i = 0; i < 100; i++) {
    const propId = `prop-${String(i+1).padStart(3,"0")}`;
    const addrId = `addr-${String(i+1).padStart(3,"0")}`;
    const taluka = pick(TALUKAS);
    const villageList = VILLAGES[taluka] || [taluka];
    const village = pick(villageList);
    const typeObj = pick(TYPES);
    const status = i < 10 ? "VERIFIED" : i < 20 ? "LISTED" : i < 30 ? "UNDER_VERIFICATION" : i < 35 ? "FLAGGED" : pick(STATUSES);
    const price = rand(2000000, 35000000);
    const area = rand(500, 50000);

    await prisma.address.upsert({
      where: { id: addrId }, update: {},
      create: { id: addrId, line1: `Plot ${rand(1,200)}, ${village}`, line2: `Near ${pick(["Bus Stand","Temple","School","Market","Hospital"])}`, city: "Pune", district: "Pune", state: "Maharashtra", postalCode: `${rand(410,416)}${rand(100,999)}`, latitude: 18.52 + (random() - 0.5) * 0.3, longitude: 73.85 + (random() - 0.5) * 0.4 },
    });

    await prisma.property.upsert({
      where: { id: propId }, update: {},
      create: { id: propId, tenantId: TENANT_ID, ownerId: pick(ownerIds), brokerId: pick(brokerIds), addressId: addrId, propertyTypeId: typeObj.id, title: `${typeObj.name} at ${village}`, description: `${typeObj.name} located in ${village}, ${taluka} taluka, Pune district.`, price, areaSqft: area, status, surveyNumber: surveyNo(), metadata: JSON.stringify({ taluka, village, zone: pick(["residential","commercial","agricultural"]), facing: pick(["East","West","North","South"]) }), listedAt: status !== "DRAFT" ? pastDate(180) : null, createdAt: pastDate(365) },
    });
    propertyIds.push(propId);
  }
  console.log("  ✓ 100 Properties + addresses");

  // 7. Risk scores for non-draft properties
  const factorDefs = [
    { id: "fdef-title", name: "Title clarity", category: "legal", defaultWeight: 0.30, sortOrder: 1 },
    { id: "fdef-legal", name: "Legal exposure", category: "legal", defaultWeight: 0.25, sortOrder: 2 },
    { id: "fdef-docs", name: "Document authenticity", category: "document", defaultWeight: 0.20, sortOrder: 3 },
    { id: "fdef-owner", name: "Ownership stability", category: "ownership", defaultWeight: 0.15, sortOrder: 4 },
    { id: "fdef-news", name: "News sentiment", category: "media", defaultWeight: 0.10, sortOrder: 5 },
  ];
  for (const fd of factorDefs) await prisma.riskFactorDefinition.upsert({ where: { name: fd.name }, update: {}, create: fd });

  // (risk scores are computed for real at the end, once cases, news and documents exist)

  // 8. Court cases
  const courts = ["Civil Court, Pune","District Court, Pune","High Court, Bombay (Pune Bench)","Revenue Tribunal, Pune"];
  for (let i = 0; i < 15; i++) {
    const caseId = `court-${String(i+1).padStart(3,"0")}`;
    const isActive = i < 8;
    const yr = rand(2019, 2025);

    await prisma.courtCase.create({
      data: { id: caseId, tenantId: TENANT_ID, caseNumber: `${pick(["CS","WP","MA","RCA"])}/${rand(100,9999)}/${yr}`, courtName: pick(courts), courtType: "District", jurisdiction: "Pune", caseType: pick(["CIVIL","REVENUE","CONSUMER"]), caseStatus: isActive ? "ACTIVE" : "DISPOSED", title: `${pick(FIRST_M)} ${pick(LAST)} vs ${pick(FIRST_M)} ${pick(LAST)}`, description: "Property dispute regarding title and ownership.", filingDate: new Date(`${yr}-${String(rand(1,12)).padStart(2,"0")}-${String(rand(1,28)).padStart(2,"0")}`), nextHearingDate: isActive ? new Date("2026-09-22") : null },
    });

    await prisma.courtCaseParty.create({ data: { caseId, partyName: `${pick(FIRST_M)} ${pick(LAST)}`, partyRole: "PLAINTIFF", advocateName: `Adv. ${pick(FIRST_M)} ${pick(LAST)}` } });
    await prisma.courtCaseParty.create({ data: { caseId, partyName: `${pick(FIRST_M)} ${pick(LAST)}`, partyRole: "DEFENDANT", advocateName: `Adv. ${pick(FIRST_M)} ${pick(LAST)}` } });

    if (i < 10) await prisma.courtCasePropertyLink.create({ data: { caseId, propertyId: propertyIds[i * 2], linkType: pick(["TITLE_DISPUTE","BOUNDARY_DISPUTE","FRAUD"]), impactScore: random() * 0.5 + 0.3 } });

    if (i < 3) await prisma.courtOrder.create({ data: { caseId, orderType: "Interim stay order", orderDate: pastDate(180), summary: "Court has granted interim stay on mutation/transfer.", affectsTitle: true, isStayOrder: true } });

    await prisma.courtHearing.create({ data: { caseId, hearingDate: pastDate(90), hearingType: "Arguments", status: "PASSED", outcome: "Adjourned" } });
  }
  console.log("  ✓ 15 Court cases");

  // 9. Newspaper sources + articles
  for (let i = 0; i < NEWS_SOURCES.length; i++) {
    const srcId = `src-${String(i+1).padStart(2,"0")}`;
    await prisma.newspaperSource.create({
      data: { id: srcId, tenantId: TENANT_ID, name: NEWS_SOURCES[i], feedUrl: `https://${NEWS_SOURCES[i].toLowerCase().replace(/\s/g,"")}.com/rss`, baseUrl: `https://${NEWS_SOURCES[i].toLowerCase().replace(/\s/g,"")}.com`, region: "Pune", isActive: true, lastCrawledAt: pastDate(1) },
    });
  }

  const headlines = [
    "Pune ring road land acquisition faces legal hurdles in Mulshi",
    "Kharadi-Mundhwa corridor sees 22% price appreciation in H1 2026",
    "PCMC uncovers illegal NA conversions in Wakad belt",
    "Property registrations up 18% in Pune district Q2",
    "Builder arrested for selling same flat to three buyers",
    "Pune Metro Phase 2 to boost realty along Swargate-Katraj",
    "Encroachment drive removes 50 illegal structures in Wagholi",
    "Revenue dept finds discrepancies in 7/12 extracts Shirur",
    "Smart City project transforms Kharadi real estate",
    "RERA orders builder to refund Rs 1.2 crore",
    "Farmer family dispute over 50-acre Baramati land",
    "Illegal hillside construction in Lavale faces demolition",
    "NRI investors drive luxury villa demand in Mulshi",
    "Traffic plan proposes new road through agricultural zone Maval",
    "Revenue tribunal upholds land title in Purandar dispute",
    "Water scarcity dampens real estate demand in east Pune",
    "Maan village farmers demand higher compensation",
    "Property fraud ring busted with fake documents",
    "Hinjewadi Phase 3 land prices surge 40%",
    "Heritage committee blocks wada redevelopment in cantonment",
  ];

  for (let i = 0; i < 20; i++) {
    const artId = `art-${String(i+1).padStart(3,"0")}`;
    const srcId = `src-${String((i % NEWS_SOURCES.length) + 1).padStart(2,"0")}`;
    const pubDate = pastDate(90);

    await prisma.newspaperArticle.create({
      data: { id: artId, sourceId: srcId, externalId: `${NEWS_SOURCES[i % NEWS_SOURCES.length].toLowerCase().replace(/\s/g,"-")}-${pubDate.toISOString().split("T")[0]}-${rand(1000,9999)}`, headline: headlines[i], summary: `${headlines[i]}. Coverage of Pune real estate developments.`, content: `Full article about ${headlines[i].toLowerCase()}.`, url: `https://example.com/${rand(10000,99999)}`, author: `${pick(FIRST_M)} ${pick(LAST)}`, section: pick(["Real Estate","City","Legal","Business"]), publishedAt: pubDate, rawMetadata: JSON.stringify({ wordCount: rand(300,1200) }) },
    });

    for (let e = 0; e < rand(2, 4); e++) {
      await prisma.newspaperEntity.create({
        data: { articleId: artId, entityType: pick(["PERSON","LOCATION","ORGANIZATION"]), entityValue: pick([`${pick(FIRST_M)} ${pick(LAST)}`, pick(Object.values(VILLAGES).flat()), pick(["PCMC","PMC","RERA","Revenue Dept"])]), confidence: 0.6 + random() * 0.35 },
      });
    }

    if (i < 14) {
      await prisma.newspaperPropertyMention.create({
        data: { articleId: artId, propertyId: propertyIds[i], tenantId: TENANT_ID, matchType: pick(["ADDRESS_MATCH","OWNER_MATCH","SURVEY_NUMBER_MATCH"]), relevanceScore: 0.4 + random() * 0.55, sentiment: pick(["POSITIVE","NEUTRAL","NEGATIVE"]), sentimentScore: random() * 1.6 - 0.8, matchedExcerpt: `...property mentioned in article...`, reviewed: random() > 0.6 },
      });
    }
  }
  console.log("  ✓ 20 Newspaper articles");

  // 10. Duplicate/conflict matching, then risk scores from the real data above
  const matching = await runPropertyMatching(TENANT_ID);
  console.log(`  ✓ ${matching.created} match candidates`);
  const risk = await recomputeAllRisk(TENANT_ID);
  console.log(`  ✓ ${risk.updated} risk scores (${JSON.stringify(risk.byLevel)})`);

  // Done
  console.log(`\n✅ Seed complete!\n`);
  console.log("Demo accounts (password for all: Demo@12345):");
  console.log("  admin@sahyadri-demo.com     (Platform admin)");
  console.log("  manager@sahyadri-demo.com   (Agency admin)");
  console.log(`  ${userList[2].email}  (Broker)`);
  console.log(`  ${userList[22].email}  (Land owner)`);
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
