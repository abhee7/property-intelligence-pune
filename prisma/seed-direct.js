// Direct SQLite seed — no Prisma engine required
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = new Database("prisma/dev.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const cuid = () => "c" + crypto.randomBytes(12).toString("hex").slice(0, 24);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pastISO = (days) => { const d = new Date(); d.setDate(d.getDate() - rand(1, days)); return d.toISOString(); };
const T = "t-demo-001";

const FIRST_M = ["Rajesh","Sunil","Amit","Vikram","Sachin","Mahesh","Anil","Sanjay","Pramod","Ramesh","Vinod","Ashok","Deepak","Nitin","Suresh","Ganesh","Prashant","Ravi","Manish","Ajay"];
const FIRST_F = ["Sunita","Anita","Rekha","Savita","Meena","Lata","Priya","Swati","Manisha","Jyoti"];
const LAST = ["Patil","Deshmukh","Kulkarni","Joshi","Deshpande","Pawar","Jadhav","More","Shinde","Gaikwad","Bhosale","Kadam","Salunkhe","Mane","Chavan","Kale","Sharma","Gupta","Mehta","Shah"];
const TALUKAS = ["Haveli","Mulshi","Maval","Bhor","Baramati","Shirur","Khed","Ambegaon"];
const VILLAGES = { Haveli:["Hadapsar","Kharadi","Wagholi","Mundhwa","Undri","Baner"], Mulshi:["Hinjewadi","Pirangut","Paud","Lavale"], Maval:["Talegaon","Kamshet"], Bhor:["Bhor","Nasrapur"], Baramati:["Baramati","Morgaon"], Shirur:["Shirur","Ranjangaon"], Khed:["Chakan","Alandi"], Ambegaon:["Ambegaon Budruk","Manchar"] };
const PTYPES = [{id:"pt-res",name:"Residential plot",slug:"res"},{id:"pt-com",name:"Commercial plot",slug:"com"},{id:"pt-agri",name:"Agricultural land",slug:"agri"},{id:"pt-flat",name:"Flat / Apartment",slug:"flat"},{id:"pt-row",name:"Row house",slug:"row"},{id:"pt-bung",name:"Bungalow",slug:"bung"},{id:"pt-ind",name:"Industrial gala",slug:"ind"},{id:"pt-farm",name:"Farm house",slug:"farm"}];
const DTYPES = [{id:"dt-title",name:"Title deed",slug:"title",ocr:1,mand:1},{id:"dt-712",name:"7/12 extract",slug:"712",ocr:1,mand:1},{id:"dt-enc",name:"Encumbrance certificate",slug:"enc",ocr:1,mand:1},{id:"dt-tax",name:"Property tax receipt",slug:"tax",ocr:1,mand:0},{id:"dt-sale",name:"Sale deed",slug:"sale",ocr:1,mand:0},{id:"dt-photo",name:"Site photographs",slug:"photo",ocr:0,mand:0}];
const STATUSES = ["DRAFT","LISTED","UNDER_VERIFICATION","VERIFIED","FLAGGED"];
const COURTS = ["Civil Court, Pune","District Court, Pune","High Court, Bombay (Pune Bench)","Revenue Tribunal, Pune"];
const NEWS = ["Sakal","Lokmat","Maharashtra Times","Pudhari","Loksatta","Pune Mirror","Indian Express","Times of India"];

async function seed() {
  const hash = await bcrypt.hash("Demo@12345", 12);
  console.log("Seeding PropIntel database...\n");

  // Tenant
  db.prepare("INSERT OR IGNORE INTO Tenant (id,name,slug,plan,isActive) VALUES (?,?,?,?,1)").run(T,"Sahyadri Land Intelligence","sahyadri-demo","PROFESSIONAL");
  db.prepare("INSERT OR IGNORE INTO TenantSettings (id,tenantId,maxUsers,maxProperties) VALUES (?,?,100,5000)").run(cuid(),T);
  console.log("  ✓ Tenant");

  // Roles
  for (const [id,name,display,level] of [["role-admin","admin","Platform admin",1],["role-agency","agency_admin","Agency admin",2],["role-broker","broker","Broker",3],["role-owner","land_owner","Land owner",4]])
    db.prepare("INSERT OR IGNORE INTO Role (id,name,displayName,hierarchyLevel) VALUES (?,?,?,?)").run(id,name,display,level);
  console.log("  ✓ Roles");

  // Users
  const ins = db.prepare("INSERT OR IGNORE INTO User (id,tenantId,roleId,email,phone,passwordHash,firstName,lastName,isActive,lastLoginAt,createdAt) VALUES (?,?,?,?,?,?,?,?,1,?,?)");
  const mkPhone = () => `+91${pick(["70","80","90","98"])}${rand(10000000,99999999)}`;
  const mkEmail = (f,l) => `${f.toLowerCase()}.${l.toLowerCase()}${rand(1,99)}@${pick(["gmail.com","yahoo.co.in","hotmail.com"])}`;
  
  ins.run("user-admin",T,"role-admin","admin@sahyadri-demo.com",mkPhone(),hash,"System","Admin",pastISO(1),pastISO(365));
  ins.run("user-agency",T,"role-agency","manager@sahyadri-demo.com",mkPhone(),hash,"Prashant","Kulkarni",pastISO(1),pastISO(365));
  
  const brokerIds = [], ownerIds = [];
  // First broker and owner have fixed emails for demo login buttons
  ins.run("broker-001",T,"role-broker","broker@sahyadri-demo.com",mkPhone(),hash,"Vinod","Deshmukh",pastISO(30),pastISO(365)); brokerIds.push("broker-001");
  for (let i=1;i<20;i++) { const fn=pick(FIRST_M),ln=pick(LAST),id=`broker-${String(i+1).padStart(3,"0")}`; ins.run(id,T,"role-broker",mkEmail(fn,ln),mkPhone(),hash,fn,ln,pastISO(30),pastISO(365)); brokerIds.push(id); }
  ins.run("owner-001",T,"role-owner","owner@sahyadri-demo.com",mkPhone(),hash,"Pramod","Lokhande",pastISO(60),pastISO(365)); ownerIds.push("owner-001");
  for (let i=1;i<50;i++) { const fn=pick(i<35?FIRST_M:FIRST_F),ln=pick(LAST),id=`owner-${String(i+1).padStart(3,"0")}`; ins.run(id,T,"role-owner",mkEmail(fn,ln),mkPhone(),hash,fn,ln,pastISO(60),pastISO(365)); ownerIds.push(id); }
  console.log("  ✓ 72 Users");

  // Property types
  for (const t of PTYPES) db.prepare("INSERT OR IGNORE INTO PropertyType (id,name,slug) VALUES (?,?,?)").run(t.id,t.name,t.slug);
  console.log("  ✓ Property types");

  // Document types
  for (const d of DTYPES) db.prepare("INSERT OR IGNORE INTO DocumentType (id,name,slug,requiresOcr,isMandatory) VALUES (?,?,?,?,?)").run(d.id,d.name,d.slug,d.ocr,d.mand);
  console.log("  ✓ Document types");

  // 100 Properties + Addresses
  const propIds = [];
  const insAddr = db.prepare("INSERT OR IGNORE INTO Address (id,line1,line2,city,district,state,postalCode,latitude,longitude) VALUES (?,?,?,?,?,?,?,?,?)");
  const insProp = db.prepare("INSERT OR IGNORE INTO Property (id,tenantId,ownerId,brokerId,addressId,propertyTypeId,title,description,price,areaSqft,status,surveyNumber,metadata,listedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  
  for (let i=0;i<100;i++) {
    const pid=`prop-${String(i+1).padStart(3,"0")}`, aid=`addr-${String(i+1).padStart(3,"0")}`;
    const tal=pick(TALUKAS), vils=VILLAGES[tal]||[tal], vil=pick(vils), pt=pick(PTYPES);
    const status=i<10?"VERIFIED":i<20?"LISTED":i<30?"UNDER_VERIFICATION":i<35?"FLAGGED":pick(STATUSES);
    const price=rand(2000000,35000000), area=rand(500,50000);
    const created=pastISO(365), listed=status!=="DRAFT"?pastISO(180):null;
    insAddr.run(aid,`Plot ${rand(1,200)}, ${vil}`,`Near ${pick(["Bus Stand","Temple","School","Market"])}`,`Pune`,`Pune`,`Maharashtra`,`${rand(410,416)}${rand(100,999)}`,18.52+(Math.random()-0.5)*0.3,73.85+(Math.random()-0.5)*0.4);
    insProp.run(pid,T,pick(ownerIds),pick(brokerIds),aid,pt.id,`${pt.name} at ${vil}`,`${pt.name} in ${vil}, ${tal}.`,price,area,status,`${rand(1,500)}/${rand(1,20)}${pick(["","A","B"])}`,JSON.stringify({taluka:tal,village:vil}),listed,created,created);
    propIds.push(pid);
  }
  console.log("  ✓ 100 Properties");

  // Risk factor definitions
  const fdefs = [{id:"fdef-title",name:"Title clarity",cat:"legal",w:0.30},{id:"fdef-legal",name:"Legal exposure",cat:"legal",w:0.25},{id:"fdef-docs",name:"Document authenticity",cat:"document",w:0.20},{id:"fdef-owner",name:"Ownership stability",cat:"ownership",w:0.15},{id:"fdef-news",name:"News sentiment",cat:"media",w:0.10}];
  for (const f of fdefs) db.prepare("INSERT OR IGNORE INTO RiskFactorDefinition (id,name,category,defaultWeight,sortOrder) VALUES (?,?,?,?,?)").run(f.id,f.name,f.cat,f.w,fdefs.indexOf(f));

  // Risk scores for 80 properties
  const insRisk = db.prepare("INSERT OR IGNORE INTO RiskScore (id,propertyId,tenantId,overallScore,riskLevel,aiNarrative,computedAt) VALUES (?,?,?,?,?,?,?)");
  const insFactor = db.prepare("INSERT INTO RiskScoreFactor (id,riskScoreId,factorDefId,factorScore,weight,explanation) VALUES (?,?,?,?,?,?)");
  let riskCount = 0;
  for (let i=0;i<80;i++) {
    const score=rand(5,85), level=score<=15?"MINIMAL":score<=35?"LOW":score<=55?"MODERATE":score<=75?"HIGH":"CRITICAL";
    const rid=`risk-${propIds[i]}`;
    try {
      insRisk.run(rid,propIds[i],T,score,level,`Risk: ${level}. Score ${score}/100.`,pastISO(14));
      for (const f of fdefs) insFactor.run(cuid(),rid,f.id,rand(10,95),f.w,`${f.name} assessment.`);
      riskCount++;
    } catch(e) {}
  }
  console.log(`  ✓ ${riskCount} Risk scores`);

  // Court cases
  for (let i=0;i<15;i++) {
    const cid=`court-${String(i+1).padStart(3,"0")}`, active=i<8, yr=rand(2019,2025);
    db.prepare("INSERT INTO CourtCase (id,tenantId,caseNumber,courtName,caseStatus,title,description,filingDate,nextHearingDate) VALUES (?,?,?,?,?,?,?,?,?)").run(cid,T,`${pick(["CS","WP","MA"])}/${rand(100,9999)}/${yr}`,pick(COURTS),active?"ACTIVE":"DISPOSED",`${pick(FIRST_M)} ${pick(LAST)} vs ${pick(FIRST_M)} ${pick(LAST)}`,"Property dispute.",`${yr}-${String(rand(1,12)).padStart(2,"0")}-15`,active?"2026-09-22":null);
    db.prepare("INSERT INTO CourtCaseParty (id,caseId,partyName,partyRole) VALUES (?,?,?,?)").run(cuid(),cid,`${pick(FIRST_M)} ${pick(LAST)}`,"PLAINTIFF");
    db.prepare("INSERT INTO CourtCaseParty (id,caseId,partyName,partyRole) VALUES (?,?,?,?)").run(cuid(),cid,`${pick(FIRST_M)} ${pick(LAST)}`,"DEFENDANT");
    if (i<10) db.prepare("INSERT INTO CourtCasePropertyLink (id,caseId,propertyId,linkType,impactScore) VALUES (?,?,?,?,?)").run(cuid(),cid,propIds[i*2],pick(["TITLE_DISPUTE","BOUNDARY_DISPUTE","FRAUD"]),Math.random()*0.5+0.3);
    if (i<3) db.prepare("INSERT INTO CourtOrder (id,caseId,orderType,orderDate,summary,affectsTitle,isStayOrder) VALUES (?,?,?,?,?,1,1)").run(cuid(),cid,"Interim stay order",pastISO(180),"Stay on mutation/transfer.");
    db.prepare("INSERT INTO CourtHearing (id,caseId,hearingDate,hearingType,status,outcome) VALUES (?,?,?,?,?,?)").run(cuid(),cid,pastISO(90),"Arguments","PASSED","Adjourned");
  }
  console.log("  ✓ 15 Court cases");

  // Newspaper
  const headlines=["Pune ring road land acquisition faces legal hurdles","Kharadi-Mundhwa corridor sees 22% price appreciation","PCMC uncovers illegal NA conversions in Wakad","Property registrations up 18% in Pune district Q2","Builder arrested for selling same flat to three buyers","Pune Metro Phase 2 to boost Swargate-Katraj realty","Encroachment drive removes 50 structures in Wagholi","Revenue dept finds 7/12 extract discrepancies Shirur","Smart City project transforms Kharadi real estate","RERA orders builder to refund Rs 1.2 crore","Farmer family dispute over 50-acre Baramati land","Illegal hillside construction in Lavale faces demolition","NRI investors drive luxury villa demand in Mulshi","Traffic plan proposes new road through Maval agri zone","Revenue tribunal upholds land title in Purandar","Water scarcity dampens demand in east Pune","Maan village farmers demand higher compensation","Property fraud ring busted with fake documents","Hinjewadi Phase 3 land prices surge 40%","Heritage committee blocks wada redevelopment"];
  
  for (let i=0;i<8;i++) db.prepare("INSERT INTO NewspaperSource (id,tenantId,name,region,lastCrawledAt) VALUES (?,?,?,?,?)").run(`src-${String(i+1).padStart(2,"0")}`,T,NEWS[i],"Pune",pastISO(1));
  for (let i=0;i<20;i++) {
    const aid=`art-${String(i+1).padStart(3,"0")}`, sid=`src-${String((i%8)+1).padStart(2,"0")}`, pub=pastISO(90);
    db.prepare("INSERT INTO NewspaperArticle (id,sourceId,externalId,headline,summary,publishedAt) VALUES (?,?,?,?,?,?)").run(aid,sid,`ext-${Date.now()}-${rand(1000,9999)}-${i}`,headlines[i],headlines[i]+".",pub);
    for (let e=0;e<rand(2,4);e++) db.prepare("INSERT INTO NewspaperEntity (id,articleId,entityType,entityValue,confidence) VALUES (?,?,?,?,?)").run(cuid(),aid,pick(["PERSON","LOCATION","ORG"]),pick([...FIRST_M,...Object.values(VILLAGES).flat()].map(v=>v)),0.6+Math.random()*0.35);
    if (i<14) db.prepare("INSERT INTO NewspaperPropertyMention (id,articleId,propertyId,tenantId,matchType,relevanceScore,sentiment) VALUES (?,?,?,?,?,?,?)").run(cuid(),aid,propIds[i],T,pick(["ADDRESS_MATCH","OWNER_MATCH","SURVEY_MATCH"]),0.4+Math.random()*0.55,pick(["POSITIVE","NEUTRAL","NEGATIVE"]));
  }
  console.log("  ✓ 20 Newspaper articles");

  // Final counts
  // ═══════════════════════════════════════
  // HERO PROPERTY — Survey 299/12 Hinjewadi
  // Full investigation chain for competition demo
  // ═══════════════════════════════════════
  
  const heroId = "prop-hero-001";
  const heroAddrId = "addr-hero-001";
  const heroRiskId = "risk-hero-001";
  const heroCaseId = "court-hero-001";
  const heroCase2Id = "court-hero-002";
  
  // Address
  db.prepare("INSERT OR REPLACE INTO Address (id,line1,line2,city,district,state,postalCode,latitude,longitude) VALUES (?,?,?,?,?,?,?,?,?)").run(
    heroAddrId, "Plot near Rajiv Gandhi IT Park, Phase 2", "Near Infosys Campus, Hinjewadi", "Pune", "Pune", "Maharashtra", "411057", 18.5912, 73.7380
  );
  
  // Property
  db.prepare("INSERT OR REPLACE INTO Property (id,tenantId,ownerId,brokerId,addressId,propertyTypeId,title,description,price,areaSqft,status,surveyNumber,khasraNumber,metadata,listedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    heroId, T, "owner-001", "broker-001", heroAddrId, "pt-com",
    "Survey 299/12, Hinjewadi Phase 2",
    "Commercial plot located in Hinjewadi Phase 2, Mulshi taluka, Pune district. 5,200 sq ft plot suitable for IT/commercial development. Road-facing plot near Rajiv Gandhi Infotech Park with excellent connectivity to Mumbai-Pune Expressway. Property is currently flagged due to active court cases and ownership disputes.",
    12500000, 5200, "FLAGGED", "S.No.299/12", "4521/87",
    JSON.stringify({ taluka: "Mulshi", village: "Hinjewadi", zone: "commercial", facing: "East", roadWidth: "30 ft", waterSupply: "Municipal", electricity: "MSEDCL connected" }),
    pastISO(180), pastISO(300), pastISO(1)
  );
  
  // Risk Score — 73/100 HIGH
  db.prepare("INSERT OR REPLACE INTO RiskScore (id,propertyId,tenantId,overallScore,riskLevel,aiNarrative,computedAt) VALUES (?,?,?,?,?,?,?)").run(
    heroRiskId, heroId, T, 73, "HIGH",
    "HIGH RISK — Active court case WP/8657/2020 with interim stay order blocks all title transfers. Legal exposure is the primary risk driver. Encumbrance registered with HDFC Bank and revenue recovery proceedings pending. Multiple ownership mutations recorded in the last 7 years (3 transfers, suggestive of speculative trading or title laundering). Negative news sentiment detected from land acquisition protests in the Mulshi taluka area. The encumbrance certificate flagged by OCR shows a discrepancy: registered area is 5,200 sq ft vs. the 7/12 extract showing 4,800 sq ft — a 400 sq ft mismatch that warrants physical survey verification.\n\nRECOMMENDATION: Do not proceed with any financial commitment until (1) court case WP/8657/2020 is resolved or stay is vacated, (2) area discrepancy is resolved via fresh survey, (3) all encumbrances are cleared. Estimated resolution timeline: 12-18 months.",
    pastISO(7)
  );
  
  // Risk Factors
  const heroFactors = [
    ["fdef-title", 28, "Title clarity severely compromised. Active dispute on ownership chain. 3 mutations in 7 years is abnormally high for this property class."],
    ["fdef-legal", 12, "CRITICAL — Interim stay order from WP/8657/2020 blocks all title transfers. Second civil suit CS/6880/2020 alleges forged sale deed. Combined legal exposure is severe."],
    ["fdef-docs", 65, "Encumbrance certificate shows area discrepancy (5,200 vs 4,800 sq ft). Title deed OCR confidence: 87%. Tax receipts are current and consistent."],
    ["fdef-owner", 45, "3 ownership changes in 7 years. Current owner acquired via gift deed from family trust — unusual transfer pattern. Previous owner had pending revenue recovery."],
    ["fdef-news", 38, "Negative sentiment from Sakal and Maharashtra Times articles about Mulshi land acquisition protests. Hinjewadi Phase 3 price surge articles may indicate speculative activity in the area."],
  ];
  for (const [fid, score, explanation] of heroFactors) {
    const fd = fdefs.find(f => f.id === fid);
    db.prepare("INSERT INTO RiskScoreFactor (id,riskScoreId,factorDefId,factorScore,weight,explanation) VALUES (?,?,?,?,?,?)").run(
      cuid(), heroRiskId, fid, score, fd ? fd.w : 0.2, explanation
    );
  }
  
  // Court Case 1 — Title dispute with stay order
  db.prepare("INSERT OR REPLACE INTO CourtCase (id,tenantId,caseNumber,courtName,courtType,jurisdiction,caseType,caseStatus,title,description,filingDate,nextHearingDate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
    heroCaseId, T, "WP/8657/2020", "High Court, Bombay (Pune Bench)", "High Court", "Pune", "CIVIL",
    "ACTIVE", "Deshmukh vs State of Maharashtra — Land Acquisition Challenge",
    "Writ petition challenging land acquisition proceedings under the Right to Fair Compensation Act, 2013. The petitioner contests the government notification for Pune ring road alignment that affects Survey No. 299/12. Interim stay granted on 15 Jul 2026 preventing any mutation or transfer of the property until final hearing.",
    "2020-11-15", "2026-09-22"
  );
  db.prepare("INSERT INTO CourtCaseParty (id,caseId,partyName,partyRole,advocateName) VALUES (?,?,?,?,?)").run(cuid(), heroCaseId, "Sunil Deshmukh", "PETITIONER", "Adv. Rajesh Kulkarni");
  db.prepare("INSERT INTO CourtCaseParty (id,caseId,partyName,partyRole,advocateName) VALUES (?,?,?,?,?)").run(cuid(), heroCaseId, "State of Maharashtra", "RESPONDENT", "Govt. Pleader");
  db.prepare("INSERT INTO CourtCasePropertyLink (id,caseId,propertyId,linkType,description,impactScore) VALUES (?,?,?,?,?,?)").run(cuid(), heroCaseId, heroId, "TITLE_DISPUTE", "Stay order blocks all title transfers", 0.92);
  db.prepare("INSERT INTO CourtOrder (id,caseId,orderType,orderDate,summary,affectsTitle,isStayOrder) VALUES (?,?,?,?,?,1,1)").run(cuid(), heroCaseId, "Interim stay order", "2026-07-15", "Court grants interim stay on mutation/transfer of Survey No. 299/12 pending final hearing. No changes to land records permitted.");
  db.prepare("INSERT INTO CourtHearing (id,caseId,hearingDate,hearingType,status,outcome) VALUES (?,?,?,?,?,?)").run(cuid(), heroCaseId, "2026-07-15", "Interim Application", "PASSED", "Stay granted");
  db.prepare("INSERT INTO CourtHearing (id,caseId,hearingDate,hearingType,status,outcome) VALUES (?,?,?,?,?,?)").run(cuid(), heroCaseId, "2026-06-10", "Admission", "PASSED", "Petition admitted, notice issued");
  
  // Court Case 2 — Fraud allegation
  db.prepare("INSERT OR REPLACE INTO CourtCase (id,tenantId,caseNumber,courtName,courtType,jurisdiction,caseType,caseStatus,title,description,filingDate,nextHearingDate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
    heroCase2Id, T, "CS/6880/2020", "District Court, Pune", "District", "Pune", "CIVIL",
    "ACTIVE", "Fraud Allegation — Forged Sale Deed",
    "Civil suit alleging that the sale deed dated 2019 for Survey No. 299/12 was executed using forged power of attorney. The plaintiff claims the actual owner never authorized the sale.",
    "2020-12-01", "2026-11-05"
  );
  db.prepare("INSERT INTO CourtCaseParty (id,caseId,partyName,partyRole) VALUES (?,?,?,?)").run(cuid(), heroCase2Id, "Vitthal Pawar (Original Owner)", "PLAINTIFF");
  db.prepare("INSERT INTO CourtCaseParty (id,caseId,partyName,partyRole) VALUES (?,?,?,?)").run(cuid(), heroCase2Id, "Sunil Deshmukh (Current Holder)", "DEFENDANT");
  db.prepare("INSERT INTO CourtCasePropertyLink (id,caseId,propertyId,linkType,description,impactScore) VALUES (?,?,?,?,?,?)").run(cuid(), heroCase2Id, heroId, "FRAUD_ALLEGATION", "Forged sale deed allegation — ownership chain compromised", 0.85);
  
  // News mentions for hero property
  const heroArt1 = "art-hero-001";
  const heroArt2 = "art-hero-002";
  db.prepare("INSERT OR REPLACE INTO NewspaperArticle (id,sourceId,externalId,headline,summary,content,url,author,section,publishedAt) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    heroArt1, "src-01", "sakal-hero-001",
    "Pune ring road land acquisition faces legal hurdles in Mulshi taluka",
    "Multiple property owners in Hinjewadi-Mulshi corridor have filed writ petitions challenging the alignment of the proposed Pune ring road. Survey numbers 299/12, 301/4, and 315/2 are among the affected plots.",
    "The Pune ring road project, a key infrastructure initiative connecting the eastern and western corridors of the city, has hit legal roadblocks in the Mulshi taluka region. At least 12 property owners have moved the Bombay High Court challenging the land acquisition notifications...",
    "https://sakal.com/pune/ring-road-mulshi-legal", "Prashant Kulkarni", "City", pastISO(30)
  );
  db.prepare("INSERT OR REPLACE INTO NewspaperArticle (id,sourceId,externalId,headline,summary,content,url,author,section,publishedAt) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    heroArt2, "src-07", "ie-hero-001",
    "Hinjewadi Phase 3 land prices surge 40% amid IT expansion",
    "Land prices in and around Hinjewadi have surged significantly, driven by IT company expansions and upcoming metro connectivity. Industry experts warn of speculative activity in certain survey numbers.",
    "The rapid expansion of IT parks in Hinjewadi Phase 3 has led to a 40% surge in land prices over the past year...",
    "https://indianexpress.com/hinjewadi-land-prices", "Meena Joshi", "Real Estate", pastISO(15)
  );
  
  db.prepare("INSERT INTO NewspaperPropertyMention (id,articleId,propertyId,tenantId,matchType,relevanceScore,sentiment,sentimentScore,matchedExcerpt) VALUES (?,?,?,?,?,?,?,?,?)").run(
    cuid(), heroArt1, heroId, T, "SURVEY_NUMBER_MATCH", 0.92, "NEGATIVE", -0.7,
    "Survey numbers 299/12, 301/4, and 315/2 are among the affected plots"
  );
  db.prepare("INSERT INTO NewspaperPropertyMention (id,articleId,propertyId,tenantId,matchType,relevanceScore,sentiment,sentimentScore,matchedExcerpt) VALUES (?,?,?,?,?,?,?,?,?)").run(
    cuid(), heroArt2, heroId, T, "ADDRESS_MATCH", 0.75, "MIXED", 0.1,
    "Industry experts warn of speculative activity in certain survey numbers"
  );
  
  console.log("  ✓ Hero property: Survey 299/12, Hinjewadi (73/100 HIGH RISK)");

  const count = (t) => db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  console.log("\n══════════════════════════════════════");
  console.log("  SEED COMPLETE");
  console.log("══════════════════════════════════════");
  console.log(`  Tenants:    ${count("Tenant")}`);
  console.log(`  Users:      ${count("User")}`);
  console.log(`  Properties: ${count("Property")}`);
  console.log(`  Risk scores:${count("RiskScore")}`);
  console.log(`  Court cases:${count("CourtCase")}`);
  console.log(`  Articles:   ${count("NewspaperArticle")}`);
  console.log(`  Mentions:   ${count("NewspaperPropertyMention")}`);
  console.log("\n  Password for all: Demo@12345");
  console.log("  Admin: admin@sahyadri-demo.com");
  console.log("  Manager: manager@sahyadri-demo.com");
  
  db.close();
}

seed().catch(e => { console.error("Seed failed:", e); process.exit(1); });
