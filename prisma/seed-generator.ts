// ============================================================================
// seed-generator.ts — Run with: npx tsx prisma/seed-generator.ts
// Produces all JSON seed files + runs Prisma seed
// Zero external dependencies beyond what's in the project
// ============================================================================

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// LOOKUP TABLES — Real Maharashtra geography
// ============================================================================

const DISTRICTS = ["Pune", "Satara", "Sangli", "Kolhapur", "Solapur"];

const TALUKAS: Record<string, string[]> = {
  Pune: ["Haveli", "Mulshi", "Maval", "Bhor", "Velhe", "Purandar", "Baramati", "Indapur", "Shirur", "Khed", "Junnar", "Ambegaon", "Daund"],
  Satara: ["Satara", "Wai", "Mahabaleshwar", "Phaltan", "Karad", "Koregaon"],
  Sangli: ["Miraj", "Tasgaon", "Walwa", "Shirala", "Khanapur"],
  Kolhapur: ["Karveer", "Panhala", "Hatkanangle", "Shahuwadi", "Gaganbawda"],
  Solapur: ["Solapur North", "Solapur South", "Barshi", "Akkalkot", "Pandharpur"],
};

const VILLAGES: Record<string, string[]> = {
  Haveli: ["Hadapsar", "Kharadi", "Wagholi", "Lohegaon", "Mundhwa", "Keshavnagar", "Uruli Devachi", "Phursungi", "Manjri", "Undri", "Ambegaon Budruk", "Wadgaon Sheri"],
  Mulshi: ["Hinjewadi", "Pirangut", "Paud", "Lavale", "Maan", "Nande", "Bhukum", "Kolawade", "Tamhini"],
  Maval: ["Talegaon Dabhade", "Kanhe", "Vadgaon", "Kamshet", "Tung", "Pavna Nagar"],
  Bhor: ["Bhor", "Ambavade", "Nasrapur", "Kikvi", "Rajgad"],
  Velhe: ["Velhe", "Torna", "Mangdari"],
  Purandar: ["Saswad", "Narayanpur", "Jejuri", "Rajuri", "Malshiras"],
  Baramati: ["Baramati", "Supa", "Morgaon", "Malegaon"],
  Shirur: ["Shirur", "Talegaon Dhamdhere", "Ranjangaon", "Koregaon Bhima"],
  Khed: ["Chakan", "Rajgurunagar", "Alandi", "Kadus"],
  Satara: ["Satara", "Limb", "Karad"],
  Wai: ["Wai", "Dhom", "Menavali"],
  Miraj: ["Miraj", "Kupwad"],
  Karveer: ["Kolhapur", "Ujlaiwadi"],
  "Solapur North": ["Solapur", "Akkalkot"],
};

// Realistic Indian names — diverse communities
const FIRST_NAMES_MALE = [
  "Rajesh", "Sunil", "Amit", "Vikram", "Sachin", "Mahesh", "Anil", "Sanjay",
  "Pramod", "Ramesh", "Vinod", "Ashok", "Deepak", "Nitin", "Suresh", "Ganesh",
  "Prashant", "Ravi", "Manish", "Ajay", "Sandip", "Yogesh", "Rahul", "Vishal",
  "Tushar", "Pankaj", "Omprakash", "Balu", "Dattatray", "Shankar", "Mahadev",
  "Sambhaji", "Dnyaneshwar", "Balaji", "Vitthal", "Hanumant", "Pandurang",
  "Govind", "Shivaji", "Jagdish", "Mohan", "Krishna", "Narayan", "Lakshman",
];

const FIRST_NAMES_FEMALE = [
  "Sunita", "Anita", "Rekha", "Savita", "Meena", "Lata", "Priya", "Swati",
  "Manisha", "Suman", "Kavita", "Jyoti", "Asha", "Nanda", "Sangita", "Vandana",
  "Shobha", "Rohini", "Varsha", "Sneha", "Pooja", "Nirmala",
];

const LAST_NAMES = [
  "Patil", "Deshmukh", "Kulkarni", "Joshi", "Deshpande", "Pawar", "Jadhav",
  "More", "Shinde", "Gaikwad", "Bhosale", "Kadam", "Salunkhe", "Mane",
  "Chavan", "Kale", "Yadav", "Sharma", "Gupta", "Mehta", "Shah", "Patel",
  "Thorat", "Nimbalkar", "Sawant", "Khare", "Bhandari", "Wagh", "Lokhande",
  "Phule", "Kamble", "Sonawane", "Shrikhande", "Gadre", "Gokhale", "Apte",
];

const AGENCY_NAMES = [
  "Horizon Realty", "Pune Property Hub", "Sahyadri Estates", "Vastu Land Consultants",
  "Mahalaxmi Properties", "Pinnacle Realtors", "Deccan Property Advisors",
  "Ganga Realty Group", "Swami Samarth Properties", "Kohinoor Land Deals",
];

const PROPERTY_TYPES = [
  { id: "pt-residential-plot", name: "Residential plot", slug: "residential-plot" },
  { id: "pt-commercial-plot", name: "Commercial plot", slug: "commercial-plot" },
  { id: "pt-agricultural-land", name: "Agricultural land", slug: "agricultural-land" },
  { id: "pt-flat-apartment", name: "Flat / Apartment", slug: "flat-apartment" },
  { id: "pt-row-house", name: "Row house", slug: "row-house" },
  { id: "pt-bungalow", name: "Bungalow", slug: "bungalow" },
  { id: "pt-industrial-gala", name: "Industrial gala", slug: "industrial-gala" },
  { id: "pt-farm-house", name: "Farm house", slug: "farm-house" },
];

const DOCUMENT_TYPES = [
  { id: "dt-title-deed", name: "Title deed", slug: "title-deed", requiresOcr: true, isMandatory: true },
  { id: "dt-7-12-extract", name: "7/12 extract", slug: "7-12-extract", requiresOcr: true, isMandatory: true },
  { id: "dt-encumbrance-cert", name: "Encumbrance certificate", slug: "encumbrance-certificate", requiresOcr: true, isMandatory: true },
  { id: "dt-tax-receipt", name: "Property tax receipt", slug: "property-tax-receipt", requiresOcr: true, isMandatory: false },
  { id: "dt-sale-deed", name: "Sale deed", slug: "sale-deed", requiresOcr: true, isMandatory: false },
  { id: "dt-mutation-entry", name: "Mutation entry", slug: "mutation-entry", requiresOcr: true, isMandatory: false },
  { id: "dt-na-order", name: "NA order", slug: "na-order", requiresOcr: true, isMandatory: false },
  { id: "dt-site-photo", name: "Site photographs", slug: "site-photo", requiresOcr: false, isMandatory: false },
];

const NEWSPAPER_SOURCES = [
  "Sakal", "Lokmat", "Maharashtra Times", "Pudhari", "Loksatta",
  "Pune Mirror", "Indian Express Pune", "Times of India Pune",
];

const STATUSES = ["DRAFT", "LISTED", "UNDER_VERIFICATION", "VERIFIED", "FLAGGED", "ARCHIVED"];

const RISK_LEVELS = ["MINIMAL", "LOW", "MODERATE", "HIGH", "CRITICAL"];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals: number = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateSurveyNumber(taluka: string): string {
  // Real Indian survey number formats
  const formats = [
    () => `${randomInt(1, 500)}/${randomInt(1, 20)}`,                        // 118/2
    () => `${randomInt(1, 500)}/${randomInt(1, 20)}${pick(["A", "B", "C"])}`, // 42/3A
    () => `${randomInt(1, 999)}`,                                              // 347
    () => `${randomInt(1, 200)}/${randomInt(1, 10)}/${randomInt(1, 5)}`,      // 78/3/2
    () => `S.No.${randomInt(1, 500)}/${randomInt(1, 15)}`,                    // S.No.234/7
  ];
  return pick(formats)();
}

function generateKhasraNumber(): string | null {
  if (Math.random() > 0.6) return null; // Not all properties have khasra numbers
  return `${randomInt(100, 9999)}/${randomInt(1, 99)}`;
}

function generatePlotNumber(): string {
  const formats = [
    () => `Plot ${randomInt(1, 200)}`,
    () => `${randomInt(1, 50)}/${randomInt(1, 10)}`,
    () => `FP-${randomInt(1, 500)}`,
    () => `CTS ${randomInt(100, 9999)}`,
    () => `Gut No. ${randomInt(1, 300)}`,
  ];
  return pick(formats)();
}

function generatePhone(): string {
  const prefixes = ["70", "72", "73", "74", "75", "76", "77", "78", "79", "80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99"];
  return `+91${pick(prefixes)}${randomInt(10000000, 99999999)}`;
}

function generateEmail(firstName: string, lastName: string): string {
  const domains = ["gmail.com", "yahoo.co.in", "rediffmail.com", "hotmail.com", "outlook.com"];
  const sep = pick([".", "_", ""]);
  const num = Math.random() > 0.5 ? randomInt(1, 99).toString() : "";
  return `${firstName.toLowerCase()}${sep}${lastName.toLowerCase()}${num}@${pick(domains)}`;
}

function generatePropertyTitle(type: string, village: string): string {
  const plotNum = generatePlotNumber();
  switch (type) {
    case "Residential plot": return `${plotNum}, ${village}`;
    case "Commercial plot": return `Commercial ${plotNum}, ${village}`;
    case "Agricultural land": return `Agricultural land, Gut No. ${randomInt(1, 300)}, ${village}`;
    case "Flat / Apartment": return `Flat ${randomInt(1, 20)}${pick(["A", "B", "C", ""])}, ${pick(["Shivam", "Sai", "Om", "Ganesh", "Laxmi", "Krishna"])} ${pick(["Residency", "Heights", "Towers", "Park", "Enclave", "Nagar"])}, ${village}`;
    case "Row house": return `Row House ${randomInt(1, 50)}, ${pick(["Green", "Royal", "Sahyadri", "Deccan"])} ${pick(["Villas", "Township", "City", "Gardens"])}, ${village}`;
    case "Bungalow": return `Bungalow, ${plotNum}, ${village}`;
    case "Industrial gala": return `Gala ${randomInt(1, 30)}, ${pick(["MIDC", "Industrial Estate", "Co-op Industrial"])}, ${village}`;
    case "Farm house": return `Farm House, ${village} - ${pick(["Mulshi", "Bhor", "Velhe"])} Road`;
    default: return `Property at ${village}`;
  }
}

function generatePrice(type: string, area: number): number {
  // Realistic Pune area prices (per sq ft)
  const pricePerSqft: Record<string, [number, number]> = {
    "Residential plot": [2500, 12000],
    "Commercial plot": [5000, 25000],
    "Agricultural land": [200, 2000],
    "Flat / Apartment": [4500, 15000],
    "Row house": [4000, 10000],
    "Bungalow": [6000, 20000],
    "Industrial gala": [3000, 8000],
    "Farm house": [500, 3000],
  };
  const range = pricePerSqft[type] || [3000, 8000];
  const rate = randomInt(range[0], range[1]);
  return Math.round((rate * area) / 100000) * 100000; // Round to nearest lakh
}

function generateArea(type: string): number {
  const areaRanges: Record<string, [number, number]> = {
    "Residential plot": [800, 5000],
    "Commercial plot": [500, 10000],
    "Agricultural land": [5000, 200000],
    "Flat / Apartment": [450, 2500],
    "Row house": [1200, 3000],
    "Bungalow": [2000, 10000],
    "Industrial gala": [500, 5000],
    "Farm house": [10000, 100000],
  };
  const range = areaRanges[type] || [1000, 5000];
  return randomInt(range[0], range[1]);
}

function generateLatLng(village: string): { lat: number; lng: number } {
  // Pune-area approximate coordinates with some scatter
  const base = { lat: 18.52, lng: 73.85 };
  return {
    lat: parseFloat((base.lat + randomFloat(-0.15, 0.15)).toFixed(6)),
    lng: parseFloat((base.lng + randomFloat(-0.20, 0.20)).toFixed(6)),
  };
}

function pastDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(1, daysBack));
  return d.toISOString();
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + randomInt(1, daysAhead));
  return d.toISOString();
}

function dateStr(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(0, daysBack));
  return d.toISOString().split("T")[0];
}

// ============================================================================
// DATA GENERATION
// ============================================================================

const TENANT_ID = "t-demo-001";
const TENANT = {
  id: TENANT_ID,
  name: "Sahyadri Land Intelligence",
  slug: "sahyadri-demo",
  domain: null,
  plan: "PROFESSIONAL",
  isActive: true,
};

// ---- ROLES ----
const ROLES = [
  { id: "role-admin", name: "admin", displayName: "Platform admin", hierarchyLevel: 1, isSystem: true },
  { id: "role-agency-admin", name: "agency_admin", displayName: "Agency admin", hierarchyLevel: 2, isSystem: true },
  { id: "role-broker", name: "broker", displayName: "Broker", hierarchyLevel: 3, isSystem: true },
  { id: "role-landowner", name: "land_owner", displayName: "Land owner", hierarchyLevel: 4, isSystem: true },
];

// ---- 20 BROKERS ----
function generateBrokers(count: number) {
  const brokers = [];
  for (let i = 0; i < count; i++) {
    const isFemale = Math.random() > 0.8;
    const firstName = isFemale ? pick(FIRST_NAMES_FEMALE) : pick(FIRST_NAMES_MALE);
    const lastName = pick(LAST_NAMES);
    const agency = pick(AGENCY_NAMES);
    brokers.push({
      id: `broker-${String(i + 1).padStart(3, "0")}`,
      tenantId: TENANT_ID,
      roleId: "role-broker",
      email: generateEmail(firstName, lastName),
      phone: generatePhone(),
      firstName,
      lastName,
      isActive: i < 18, // 2 inactive brokers for realism
      mfaEnabled: Math.random() > 0.7,
      lastLoginAt: i < 18 ? pastDate(7) : pastDate(90),
      createdAt: pastDate(365),
      metadata: { agency, licenseNumber: `RERA/P/${randomInt(10000, 99999)}/${randomInt(2020, 2026)}` },
    });
  }
  return brokers;
}

// ---- 50 OWNERS ----
function generateOwners(count: number) {
  const owners = [];
  for (let i = 0; i < count; i++) {
    const isFemale = Math.random() > 0.65;
    const firstName = isFemale ? pick(FIRST_NAMES_FEMALE) : pick(FIRST_NAMES_MALE);
    const lastName = pick(LAST_NAMES);
    owners.push({
      id: `owner-${String(i + 1).padStart(3, "0")}`,
      tenantId: TENANT_ID,
      roleId: "role-landowner",
      email: generateEmail(firstName, lastName),
      phone: generatePhone(),
      firstName,
      lastName,
      isActive: true,
      mfaEnabled: false,
      lastLoginAt: Math.random() > 0.4 ? pastDate(30) : null,
      createdAt: pastDate(500),
    });
  }
  return owners;
}

// ---- 100 PROPERTIES (including 10 duplicates) ----
function generateProperties(brokers: any[], owners: any[]) {
  const properties: any[] = [];
  const addresses: any[] = [];
  const propertyMedia: any[] = [];

  // Generate 90 unique properties
  for (let i = 0; i < 90; i++) {
    const district = i < 70 ? "Pune" : pick(DISTRICTS);
    const talukaList = TALUKAS[district] || ["Haveli"];
    const taluka = pick(talukaList);
    const villageList = VILLAGES[taluka] || [taluka];
    const village = pick(villageList);
    const propType = pick(PROPERTY_TYPES);
    const area = generateArea(propType.name);
    const price = generatePrice(propType.name, area);
    const coords = generateLatLng(village);
    const surveyNumber = generateSurveyNumber(taluka);
    const broker = pick(brokers.filter((b) => b.isActive));
    const owner = pick(owners);
    const status = i < 15 ? "VERIFIED" : i < 30 ? "LISTED" : i < 45 ? "UNDER_VERIFICATION" : i < 55 ? "DRAFT" : i < 60 ? "FLAGGED" : pick(STATUSES);

    const addressId = `addr-${String(i + 1).padStart(3, "0")}`;
    const propertyId = `prop-${String(i + 1).padStart(3, "0")}`;

    addresses.push({
      id: addressId,
      line1: `${generatePlotNumber()}, ${village}`,
      line2: `Near ${pick(["Bus Stand", "School", "Temple", "Market", "Highway", "Railway Station", "College", "Hospital"])}`,
      city: district === "Pune" ? "Pune" : pick(["Satara", "Sangli", "Kolhapur", "Solapur"]),
      district,
      state: "Maharashtra",
      postalCode: `${randomInt(410, 416)}${randomInt(100, 999)}`,
      country: "IN",
      latitude: coords.lat,
      longitude: coords.lng,
    });

    properties.push({
      id: propertyId,
      tenantId: TENANT_ID,
      ownerId: owner.id,
      brokerId: broker.id,
      addressId,
      propertyTypeId: propType.id,
      title: generatePropertyTitle(propType.name, village),
      description: `${propType.name} located in ${village}, ${taluka} taluka, ${district} district. ${area > 5000 ? "Large plot" : "Compact plot"} suitable for ${propType.name === "Agricultural land" ? "farming and horticulture" : "development"}. ${Math.random() > 0.5 ? "Clear title, all documents available." : "Documents under verification."}`,
      price,
      areaSqft: area,
      status,
      surveyNumber,
      khasraNumber: generateKhasraNumber(),
      yearBuilt: propType.name.includes("plot") || propType.name.includes("land") ? null : randomInt(1990, 2024),
      metadata: {
        taluka,
        village,
        zone: pick(["residential", "commercial", "agricultural", "industrial", "mixed"]),
        facing: pick(["East", "West", "North", "South", "North-East", "South-West"]),
        roadWidth: `${pick(["9", "12", "15", "18", "24", "30", "40", "60"])} ft`,
        waterSupply: pick(["Municipal", "Borewell", "Well", "None"]),
        electricity: pick(["MSEDCL connected", "Available nearby", "Not available"]),
      },
      listedAt: status !== "DRAFT" ? pastDate(180) : null,
      createdAt: pastDate(365),
      updatedAt: pastDate(30),
    });

    // Add 1-3 media items per property
    const mediaCount = randomInt(1, 3);
    for (let m = 0; m < mediaCount; m++) {
      propertyMedia.push({
        id: `media-${propertyId}-${m + 1}`,
        propertyId,
        fileUrl: `/demo/images/property-${randomInt(1, 20)}.jpg`,
        mediaType: m === 0 ? "IMAGE" : pick(["IMAGE", "SATELLITE", "FLOOR_PLAN"]),
        caption: m === 0 ? "Primary view" : `View ${m + 1}`,
        sortOrder: m,
        isPrimary: m === 0,
      });
    }
  }

  // ---- 10 DUPLICATE LISTINGS ----
  // These simulate the same property listed by different brokers or with slight title variations
  // The matching agent should detect these
  for (let d = 0; d < 10; d++) {
    const original = properties[d * 8]; // Every 8th property gets a duplicate
    const dupBroker = pick(brokers.filter((b) => b.isActive && b.id !== original.brokerId));
    const dupOwner = Math.random() > 0.5 ? original.ownerId : pick(owners).id;
    const dupAddressId = `addr-dup-${String(d + 1).padStart(3, "0")}`;
    const dupPropertyId = `prop-dup-${String(d + 1).padStart(3, "0")}`;

    // Slightly different address text but same coordinates
    const origAddr = addresses.find((a: any) => a.id === original.addressId)!;
    addresses.push({
      ...origAddr,
      id: dupAddressId,
      line1: origAddr.line1.replace("Plot", "Pl.").replace("Flat", "Fl.") + (Math.random() > 0.5 ? " (Part)" : ""),
      latitude: origAddr.latitude + randomFloat(-0.001, 0.001),
      longitude: origAddr.longitude + randomFloat(-0.001, 0.001),
    });

    properties.push({
      ...original,
      id: dupPropertyId,
      brokerId: dupBroker.id,
      ownerId: dupOwner,
      addressId: dupAddressId,
      title: original.title
        .replace(/Plot \d+/, `Plot ${randomInt(1, 200)}`)
        .replace(/Flat \d+/, `Flat ${randomInt(1, 20)}`) + " (Relisted)",
      price: Math.round(original.price * (0.95 + Math.random() * 0.1)), // ±5% price
      status: pick(["LISTED", "DRAFT"]),
      surveyNumber: original.surveyNumber, // SAME survey number = dead giveaway
      createdAt: pastDate(60),
      updatedAt: pastDate(14),
      metadata: {
        ...original.metadata,
        isDuplicate: true,        // Hidden flag for testing
        originalId: original.id,
      },
    });
  }

  return { properties, addresses, propertyMedia };
}

// ---- 15 COURT CASES ----
function generateCourtCases(properties: any[], owners: any[]) {
  const cases: any[] = [];
  const parties: any[] = [];
  const propertyLinks: any[] = [];
  const hearings: any[] = [];
  const orders: any[] = [];

  const courtNames = [
    "Civil Court, Pune", "District Court, Pune", "Sub-Divisional Court, Haveli",
    "Revenue Tribunal, Pune Division", "High Court, Bombay (Pune Bench)",
    "Tahsildar Court, Mulshi", "City Civil Court, Pune",
    "Consumer Dispute Redressal Forum, Pune", "Land Acquisition Tribunal, Pune",
  ];

  const caseTypes = ["CIVIL", "REVENUE", "CONSUMER", "LAND_TRIBUNAL", "HIGH_COURT_APPEAL"];

  // Link cases to specific properties for demo purposes
  const linkedPropertyIndices = [2, 5, 8, 12, 18, 23, 31, 40, 52, 61, 70, 78, 82, 88, 3];

  for (let i = 0; i < 15; i++) {
    const caseId = `court-${String(i + 1).padStart(3, "0")}`;
    const linkedProp = properties[linkedPropertyIndices[i]] || properties[i];
    const linkedOwner = owners.find((o: any) => o.id === linkedProp.ownerId) || owners[0];
    const caseType = pick(caseTypes);
    const isActive = i < 8; // 8 active, 7 disposed
    const hasStayOrder = i < 3; // 3 with stay orders (high risk)
    const filingYear = randomInt(2019, 2025);

    cases.push({
      id: caseId,
      tenantId: TENANT_ID,
      caseNumber: `${pick(["CS", "MA", "RA", "WP", "SA", "RCA"])}/${randomInt(100, 9999)}/${filingYear}`,
      courtName: pick(courtNames),
      courtType: caseType === "HIGH_COURT_APPEAL" ? "High Court" : "District/Subordinate",
      jurisdiction: "Pune",
      caseType,
      caseStatus: isActive ? "ACTIVE" : pick(["DISPOSED", "SETTLED", "WITHDRAWN"]),
      title: pick([
        `${linkedOwner.firstName} ${linkedOwner.lastName} vs ${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)}`,
        `${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)} vs State of Maharashtra`,
        `${linkedOwner.firstName} ${linkedOwner.lastName} & Ors vs ${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)} & Ors`,
        `In Re: Survey No. ${linkedProp.surveyNumber}, ${linkedProp.metadata?.village || "Pune"}`,
      ]),
      description: pick([
        "Dispute regarding title and ownership of the property. Plaintiff claims prior purchase through registered sale deed.",
        "Revenue appeal challenging mutation entry. Respondent contests the validity of the succession certificate.",
        "Consumer complaint against builder for delay in possession and deviation from sanctioned plans.",
        "Partition suit between family members regarding inherited agricultural land.",
        "Encroachment complaint. Plaintiff alleges unauthorized construction beyond sanctioned plot boundary.",
        "Fraud allegation regarding forged sale deed and impersonation of original owner.",
      ]),
      filingDate: `${filingYear}-${String(randomInt(1, 12)).padStart(2, "0")}-${String(randomInt(1, 28)).padStart(2, "0")}`,
      nextHearingDate: isActive ? futureDate(90).split("T")[0] : null,
      dispositionDate: !isActive ? dateStr(180) : null,
    });

    // 2-4 parties per case
    const partyCount = randomInt(2, 4);
    for (let p = 0; p < partyCount; p++) {
      const isPlaintiff = p === 0;
      parties.push({
        id: `party-${caseId}-${p + 1}`,
        caseId,
        partyName: p === 0
          ? `${linkedOwner.firstName} ${linkedOwner.lastName}`
          : `${pick([...FIRST_NAMES_MALE, ...FIRST_NAMES_FEMALE])} ${pick(LAST_NAMES)}`,
        partyRole: isPlaintiff ? pick(["PLAINTIFF", "PETITIONER"]) : pick(["DEFENDANT", "RESPONDENT"]),
        advocateName: `Adv. ${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)}`,
      });
    }

    // Link to property
    propertyLinks.push({
      id: `cpl-${caseId}`,
      caseId,
      propertyId: linkedProp.id,
      linkType: pick(["TITLE_DISPUTE", "BOUNDARY_DISPUTE", "FRAUD_ALLEGATION", "ENCUMBRANCE", "INHERITANCE", "PARTITION"]),
      description: `Court case linked to property ${linkedProp.title}`,
      impactScore: hasStayOrder ? randomFloat(0.8, 1.0) : randomFloat(0.2, 0.7),
      linkedAt: pastDate(180),
    });

    // 1-4 hearings per case
    const hearingCount = randomInt(1, 4);
    for (let h = 0; h < hearingCount; h++) {
      hearings.push({
        id: `hearing-${caseId}-${h + 1}`,
        caseId,
        hearingDate: h < hearingCount - 1 ? dateStr(365) : (isActive ? futureDate(60).split("T")[0] : dateStr(90)),
        hearingType: pick(["Arguments", "Evidence", "Final hearing", "Order", "Adjournment"]),
        courtRoom: `Room ${randomInt(1, 20)}`,
        judgeName: `Hon. ${pick(["Justice", "Shri", "Smt"])} ${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)}`,
        outcome: h < hearingCount - 1 ? pick(["Adjourned", "Arguments heard", "Evidence recorded", "Order reserved"]) : null,
        status: h < hearingCount - 1 ? "PASSED" : (isActive ? "PENDING" : "PASSED"),
      });
    }

    // Stay orders for high-risk cases
    if (hasStayOrder) {
      orders.push({
        id: `order-${caseId}-stay`,
        caseId,
        orderType: "Interim stay order",
        orderDate: dateStr(180),
        summary: "Court has granted interim stay on mutation/transfer of the property until further orders. No sale, mortgage, or transfer of the property shall be effected during the pendency of this order.",
        documentUrl: `/demo/docs/stay-order-${caseId}.pdf`,
        affectsTitle: true,
        isStayOrder: true,
      });
    }

    // Regular orders for some cases
    if (Math.random() > 0.5) {
      orders.push({
        id: `order-${caseId}-misc`,
        caseId,
        orderType: pick(["Miscellaneous order", "Directions order", "Interim order"]),
        orderDate: dateStr(120),
        summary: pick([
          "Parties directed to maintain status quo regarding the suit property.",
          "Application for amendment of plaint allowed.",
          "Commissioner appointed for local inspection of the property.",
          "Matter adjourned for filing of written statement by the defendant.",
        ]),
        documentUrl: null,
        affectsTitle: false,
        isStayOrder: false,
      });
    }
  }

  return { cases, parties, propertyLinks, hearings, orders };
}

// ---- 20 NEWSPAPER ARTICLES ----
function generateNewspaperArticles(properties: any[]) {
  const articles: any[] = [];
  const entities: any[] = [];
  const mentions: any[] = [];

  const headlines = [
    "Pune's Hinjewadi IT corridor sees 40% surge in land prices amid infra push",
    "Farmers protest land acquisition for Pune ring road in Mulshi taluka",
    "PCMC uncovers illegal NA conversions in Wakad-Hinjewadi belt",
    "Property registrations in Pune district up 18% in Q2 2026",
    "Builder arrested for selling same flat to three buyers in Hadapsar",
    "Pune Metro Phase 2 to boost realty prices along Swargate-Katraj corridor",
    "Encroachment drive removes 50 illegal structures in Wagholi",
    "Revenue dept finds discrepancies in 7/12 extracts in Shirur taluka",
    "Smart City project transforms Kharadi-Mundhwa real estate landscape",
    "Heritage committee blocks redevelopment of old wada in Pune cantonment",
    "RERA orders builder to refund Rs 1.2 crore for delayed possession in Baner",
    "Pune sees record stamp duty collection of Rs 8,000 crore in FY26",
    "Farmer family dispute over 50-acre Baramati land reaches High Court",
    "Illegal hillside construction in Lavale faces demolition order",
    "NRI investors drive luxury villa demand in Mulshi-Hinjewadi corridor",
    "Pune traffic plan proposes new road through agricultural zone in Maval",
    "Revenue tribunal upholds land title in 20-year-old Purandar dispute",
    "Water scarcity concerns dampen real estate demand in eastern Pune",
    "Maan village farmers demand higher compensation for expressway land",
    "Property fraud ring busted: fake documents used to sell government land",
  ];

  for (let i = 0; i < 20; i++) {
    const articleId = `article-${String(i + 1).padStart(3, "0")}`;
    const source = pick(NEWSPAPER_SOURCES);
    const publishedAt = dateStr(randomInt(1, 90));
    const sentiment = i < 6 ? "POSITIVE" : i < 14 ? "NEUTRAL" : "NEGATIVE";

    articles.push({
      id: articleId,
      sourceId: `source-${NEWSPAPER_SOURCES.indexOf(source) + 1}`,
      externalId: `${source.toLowerCase().replace(/\s/g, "-")}-${publishedAt}-${randomInt(1000, 9999)}`,
      headline: headlines[i],
      summary: `${headlines[i]}. This article discusses developments in Pune district's real estate market and their implications for property values and land ownership in the region.`,
      content: `[Full article content would be extracted from the PDF/RSS feed. This is placeholder text for the prototype. The article discusses ${headlines[i].toLowerCase()} with quotes from local officials and market analysts. The report covers impact on ${randomInt(5, 50)} properties in the area.]`,
      url: `https://${source.toLowerCase().replace(/\s/g, "")}.com/pune/${publishedAt}/${randomInt(10000, 99999)}`,
      author: `${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)}`,
      section: pick(["Real Estate", "City", "Maharashtra", "Business", "Legal"]),
      language: "en",
      publishedAt,
      rawMetadata: { wordCount: randomInt(300, 1200), hasImage: Math.random() > 0.3 },
    });

    // 2-5 entities per article
    const entityCount = randomInt(2, 5);
    for (let e = 0; e < entityCount; e++) {
      entities.push({
        id: `entity-${articleId}-${e + 1}`,
        articleId,
        entityType: pick(["PERSON", "LOCATION", "ORGANIZATION", "CASE_NUMBER", "SURVEY_NUMBER"]),
        entityValue: pick([
          `${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)}`,
          pick(Object.values(VILLAGES).flat()),
          pick(["PCMC", "PMC", "PMRDA", "RERA", "Revenue Department"]),
          `CS/${randomInt(100, 9999)}/${randomInt(2020, 2026)}`,
          generateSurveyNumber("Haveli"),
        ]),
        confidence: randomFloat(0.6, 0.98),
        startOffset: randomInt(50, 500),
        endOffset: randomInt(510, 600),
      });
    }

    // Link 60% of articles to a property
    if (Math.random() > 0.4 && i < properties.length) {
      const linkedProp = properties[i % properties.length];
      mentions.push({
        id: `mention-${articleId}`,
        articleId,
        propertyId: linkedProp.id,
        tenantId: TENANT_ID,
        matchType: pick(["ADDRESS_MATCH", "OWNER_MATCH", "SURVEY_NUMBER_MATCH", "KEYWORD_MATCH"]),
        relevanceScore: randomFloat(0.4, 0.95),
        sentiment,
        sentimentScore: sentiment === "POSITIVE" ? randomFloat(0.3, 0.8) : sentiment === "NEGATIVE" ? randomFloat(-0.8, -0.2) : randomFloat(-0.2, 0.2),
        matchedExcerpt: `...property located in ${linkedProp.metadata?.village || "Pune"} bearing survey number ${linkedProp.surveyNumber}...`,
        reviewed: Math.random() > 0.6,
        createdAt: pastDate(30),
      });
    }
  }

  // Newspaper sources
  const sources = NEWSPAPER_SOURCES.map((name, i) => ({
    id: `source-${i + 1}`,
    tenantId: TENANT_ID,
    name,
    sourceType: "rss",
    feedUrl: `https://${name.toLowerCase().replace(/\s/g, "")}.com/rss/pune`,
    baseUrl: `https://${name.toLowerCase().replace(/\s/g, "")}.com`,
    region: "Pune",
    language: "en",
    isActive: true,
    crawlIntervalMin: 60,
    lastCrawledAt: pastDate(1),
  }));

  return { articles, entities, mentions, sources };
}

// ---- RISK SCORES ----
function generateRiskScores(properties: any[], courtPropertyLinks: any[]) {
  const scores: any[] = [];
  const factors: any[] = [];

  const courtLinkedPropertyIds = new Set(courtPropertyLinks.map((l: any) => l.propertyId));

  for (const prop of properties) {
    if (prop.status === "DRAFT") continue; // No score for drafts

    const hasCourt = courtLinkedPropertyIds.has(prop.id);
    const isDuplicate = prop.metadata?.isDuplicate;

    // Properties with court cases or duplicates get higher risk
    let overallScore: number;
    if (hasCourt) {
      overallScore = randomInt(55, 92);
    } else if (isDuplicate) {
      overallScore = randomInt(40, 65);
    } else {
      overallScore = randomInt(5, 40);
    }

    const riskLevel = overallScore <= 15 ? "MINIMAL" : overallScore <= 35 ? "LOW" : overallScore <= 55 ? "MODERATE" : overallScore <= 75 ? "HIGH" : "CRITICAL";

    const scoreId = `risk-${prop.id}`;

    scores.push({
      id: scoreId,
      propertyId: prop.id,
      tenantId: TENANT_ID,
      overallScore,
      riskLevel,
      aiNarrative: `Risk assessment for ${prop.title}: ${riskLevel} risk (score: ${overallScore}/100). ${hasCourt ? "Active court case detected — legal exposure is the primary risk driver." : isDuplicate ? "Potential duplicate listing detected — verify ownership independently." : "No significant risk factors identified."} Data completeness: ${hasCourt ? "4/4" : "3/4"} sources consulted.`,
      flags: hasCourt ? ["active_litigation", "title_dispute"] : isDuplicate ? ["potential_duplicate"] : [],
      computedAt: pastDate(7),
      expiresAt: futureDate(30),
    });

    // 5 factors per score
    const titleScore = hasCourt ? randomInt(20, 50) : randomInt(75, 98);
    const legalScore = hasCourt ? randomInt(10, 40) : randomInt(80, 99);
    const docScore = randomInt(60, 95);
    const ownerScore = isDuplicate ? randomInt(30, 55) : randomInt(70, 98);
    const newsScore = randomInt(60, 95);

    const factorDefs = [
      { name: "Title clarity", score: titleScore, weight: 0.30 },
      { name: "Legal exposure", score: legalScore, weight: 0.25 },
      { name: "Document authenticity", score: docScore, weight: 0.20 },
      { name: "Ownership stability", score: ownerScore, weight: 0.15 },
      { name: "News sentiment", score: newsScore, weight: 0.10 },
    ];

    for (const f of factorDefs) {
      factors.push({
        id: `factor-${scoreId}-${f.name.toLowerCase().replace(/\s/g, "-")}`,
        riskScoreId: scoreId,
        factorDefId: `fdef-${f.name.toLowerCase().replace(/\s/g, "-")}`,
        factorScore: f.score,
        weight: f.weight,
        evidence: [`Score: ${f.score}/100`],
        explanation: f.score > 80 ? `${f.name}: No concerns.` : f.score > 50 ? `${f.name}: Moderate concerns — review recommended.` : `${f.name}: Significant concerns — immediate attention required.`,
      });
    }
  }

  return { scores, factors };
}

// ============================================================================
// ASSEMBLE AND WRITE
// ============================================================================

console.log("Generating seed data...\n");

const brokers = generateBrokers(20);
const owners = generateOwners(50);
const { properties, addresses, propertyMedia } = generateProperties(brokers, owners);
const court = generateCourtCases(properties, owners);
const news = generateNewspaperArticles(properties);
const risk = generateRiskScores(properties, court.propertyLinks);

// Admin user
const adminUser = {
  id: "user-admin-001",
  tenantId: TENANT_ID,
  roleId: "role-admin",
  email: "admin@sahyadri-demo.com",
  phone: "+919876543210",
  firstName: "System",
  lastName: "Admin",
  isActive: true,
  mfaEnabled: true,
  lastLoginAt: pastDate(1),
  createdAt: pastDate(500),
};

// Agency admin
const agencyAdmin = {
  id: "user-agency-001",
  tenantId: TENANT_ID,
  roleId: "role-agency-admin",
  email: "manager@sahyadri-demo.com",
  phone: "+919876543211",
  firstName: "Prashant",
  lastName: "Kulkarni",
  isActive: true,
  mfaEnabled: true,
  lastLoginAt: pastDate(1),
  createdAt: pastDate(400),
};

const seedData = {
  _meta: {
    generatedAt: new Date().toISOString(),
    version: "1.0.0",
    description: "Production-realistic demo data for Property Intelligence Platform",
    counts: {
      properties: properties.length,
      addresses: addresses.length,
      brokers: brokers.length,
      owners: owners.length,
      courtCases: court.cases.length,
      courtParties: court.parties.length,
      courtPropertyLinks: court.propertyLinks.length,
      courtHearings: court.hearings.length,
      courtOrders: court.orders.length,
      newspaperSources: news.sources.length,
      newspaperArticles: news.articles.length,
      newspaperEntities: news.entities.length,
      newspaperMentions: news.mentions.length,
      riskScores: risk.scores.length,
      riskFactors: risk.factors.length,
      propertyMedia: propertyMedia.length,
      duplicateListings: properties.filter((p) => p.metadata?.isDuplicate).length,
    },
  },
  tenant: TENANT,
  tenantSettings: {
    id: "ts-001",
    tenantId: TENANT_ID,
    riskWeights: { titleClarity: 0.30, legalExposure: 0.25, documentAuthenticity: 0.20, ownershipStability: 0.15, newsSentiment: 0.10 },
    maxUsers: 100,
    maxProperties: 5000,
    defaultCurrency: "INR",
    timezone: "Asia/Kolkata",
  },
  roles: ROLES,
  users: [adminUser, agencyAdmin, ...brokers, ...owners],
  propertyTypes: PROPERTY_TYPES,
  documentTypes: DOCUMENT_TYPES,
  addresses,
  properties,
  propertyMedia,
  courtCases: court.cases,
  courtCaseParties: court.parties,
  courtCasePropertyLinks: court.propertyLinks,
  courtHearings: court.hearings,
  courtOrders: court.orders,
  newspaperSources: news.sources,
  newspaperArticles: news.articles,
  newspaperEntities: news.entities,
  newspaperPropertyMentions: news.mentions,
  riskScores: risk.scores,
  riskScoreFactors: risk.factors,
};

// Write all data to a single file
const outputPath = path.join(__dirname, "..", "data", "seed");
fs.mkdirSync(outputPath, { recursive: true });

fs.writeFileSync(
  path.join(outputPath, "seed-data.json"),
  JSON.stringify(seedData, null, 2),
  "utf-8"
);

// Also write split files for the mock providers
fs.writeFileSync(
  path.join(outputPath, "gov-records.json"),
  JSON.stringify({
    landRecords: properties.map((p: any) => ({
      surveyNumber: p.surveyNumber,
      khasraNumber: p.khasraNumber,
      district: addresses.find((a: any) => a.id === p.addressId)?.district || "Pune",
      taluka: p.metadata?.taluka || "Haveli",
      village: p.metadata?.village || "Pune",
      ownerName: `${owners.find((o: any) => o.id === p.ownerId)?.firstName || "Unknown"} ${owners.find((o: any) => o.id === p.ownerId)?.lastName || ""}`.trim(),
      area: `${p.areaSqft} sq ft`,
      landUse: p.metadata?.zone || "residential",
      mutationEntries: Array.from({ length: randomInt(1, 4) }, (_, i) => ({
        mutationNumber: `MUT/${randomInt(1000, 9999)}/${randomInt(2015, 2025)}`,
        date: `${randomInt(1, 28)}/${randomInt(1, 12)}/${randomInt(2015, 2025)}`,
        fromOwner: `${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)}`,
        toOwner: `${owners.find((o: any) => o.id === p.ownerId)?.firstName} ${owners.find((o: any) => o.id === p.ownerId)?.lastName}`,
        type: pick(["sale", "inheritance", "gift", "partition"]),
      })),
      encumbrances: Math.random() > 0.7 ? [pick(["Bank mortgage — SBI", "Bank mortgage — HDFC", "Lien — Maharashtra State Co-op Bank", "Revenue recovery pending"])] : [],
      lastUpdated: dateStr(60),
    })),
    taxRecords: properties.slice(0, 60).map((p: any) => ({
      propertyId: p.id,
      assessmentYear: "2025-2026",
      taxAmount: randomInt(5000, 50000),
      paidAmount: Math.random() > 0.2 ? randomInt(5000, 50000) : 0,
      status: Math.random() > 0.2 ? "paid" : pick(["partial", "unpaid"]),
      dueDate: "2026-03-31",
    })),
  }, null, 2),
  "utf-8"
);

fs.writeFileSync(
  path.join(outputPath, "court-cases.json"),
  JSON.stringify({ cases: court.cases.map((c: any) => ({
    ...c,
    parties: court.parties.filter((p: any) => p.caseId === c.id),
    orders: court.orders.filter((o: any) => o.caseId === c.id),
  }))}, null, 2),
  "utf-8"
);

fs.writeFileSync(
  path.join(outputPath, "newspaper-articles.json"),
  JSON.stringify({
    sources: news.sources,
    articles: news.articles.map((a: any) => ({
      ...a,
      entities: news.entities.filter((e: any) => e.articleId === a.id),
    })),
  }, null, 2),
  "utf-8"
);

// Print summary
console.log("Seed data generated successfully!\n");
console.log("╔══════════════════════════════════════════════╗");
console.log("║           SEED DATA SUMMARY                 ║");
console.log("╠══════════════════════════════════════════════╣");
Object.entries(seedData._meta.counts).forEach(([key, val]) => {
  console.log(`║  ${key.padEnd(28)} ${String(val).padStart(6)}  ║`);
});
console.log("╚══════════════════════════════════════════════╝");
console.log(`\nFiles written to: ${outputPath}/`);
console.log("  - seed-data.json          (complete — for Prisma seed)");
console.log("  - gov-records.json        (for MockGovRecordProvider)");
console.log("  - court-cases.json        (for MockCourtRecordProvider)");
console.log("  - newspaper-articles.json (for MockNewsProvider)");
