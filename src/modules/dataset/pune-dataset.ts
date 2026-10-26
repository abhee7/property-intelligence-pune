// src/modules/dataset/pune-dataset.ts
//
// Turns the Kaggle "Pune real estate listings" CSV into a PropIntel data plan.
//
// REAL (from the CSV):      title, society, locality, BHK, price, area, floor, facing,
//                           furnishing, ownership type, parking, bathrooms, possession.
// SYNTHETIC (generated):    survey numbers, owners, brokers, map coordinates (locality
//                           centre + jitter), PIN codes, court cases, and the deliberate
//                           duplicate / conflict / document scenarios that make the
//                           matching and risk features demonstrable.
// Everything synthetic is tagged in `metadata.synthetic` so it can never be mistaken for fact.
//
// Pure and deterministic: same CSV + same seed → identical plan. No database access here.

import { matchOwnerName } from "../matching/matching.algorithms";

// ─── CSV ───

/** Minimal RFC-4180 parser (quoted fields, escaped quotes, CRLF). Returns rows keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c !== "")) rows.push(row); }

  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? "").trim()])));
}

// ─── Field parsers ───

/** "1.75 Cr" → 17500000, "61.6 Lac" → 6160000 */
export function parsePrice(raw: string | undefined): number | null {
  const m = /([\d,]+(?:\.\d+)?)\s*(cr|crore|lac|lakh|l)\b/i.exec(raw || "");
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Math.round(n * (/^c/i.test(m[2]) ? 10_000_000 : 100_000));
}

/** "1165 sqft" / "1,165 sq ft" → 1165 */
export function parseSqft(raw: string | undefined): number | null {
  const m = /([\d,]+(?:\.\d+)?)/.exec(raw || "");
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return n > 0 ? n : null;
}

export type ListingKind = "Apartment" | "Flat" | "Penthouse" | "Builder Floor" | "Villa" | "House" | "Other";

export interface ParsedTitle {
  bhk: number | null;
  kind: ListingKind;
  society: string | null;
  localityRaw: string;
}

/** "3 BHK Flat for Sale in Acolade, Kharadi, Pune" → { bhk: 3, kind: "Flat", society: "Acolade", localityRaw: "Kharadi" } */
export function parseTitle(title: string, societyColumn?: string): ParsedTitle {
  const m = /^\s*(.*?)\s+for Sale in\s+(.+)$/i.exec(title.trim());
  const head = m?.[1] ?? title;
  const rest = m?.[2] ?? "";

  const bhk = /(\d+)\s*\+?\s*BHK/i.exec(head)?.[1];
  const kindWord = head.replace(/^\d+\s*\+?\s*BHK\s*/i, "").trim();
  const kind = (["Builder Floor", "Penthouse", "Apartment", "Villa", "Flat", "House"] as const).find((k) => new RegExp(`^${k}$`, "i").test(kindWord)) ?? "Other";

  // "Society, Locality, Pune" — the society is the first part, the locality is the last real part
  const parts = rest.split(",").map((p) => p.trim()).filter(Boolean);
  const last = (parts[parts.length - 1] || "").replace(/\s*Pune$/i, "").trim();
  const society = societyColumn?.trim() || (parts.length >= 2 ? parts[0] : null);
  const localityRaw = last || (parts.length >= 2 ? parts[parts.length - 2].replace(/\s*Pune$/i, "").trim() : "Pune");

  return { bhk: bhk ? parseInt(bhk, 10) : null, kind, society, localityRaw };
}

// ─── Localities ───
// Approximate centres (lat, lng), taluka and PIN for the localities that appear in the data.
// Good enough to place a pin in the right neighbourhood — NOT survey-grade coordinates.

interface Locality { lat: number; lng: number; taluka: string; pin: string }

export const LOCALITIES: Record<string, Locality> = {
  "Kharadi": { lat: 18.5514, lng: 73.9395, taluka: "Haveli", pin: "411014" },
  "Pimpri Chinchwad": { lat: 18.6298, lng: 73.7997, taluka: "Haveli", pin: "411018" },
  "Hinjawadi": { lat: 18.5912, lng: 73.7389, taluka: "Mulshi", pin: "411057" },
  "Baner": { lat: 18.559, lng: 73.7868, taluka: "Haveli", pin: "411045" },
  "Bavdhan": { lat: 18.5149, lng: 73.7788, taluka: "Mulshi", pin: "411021" },
  "Wakad": { lat: 18.5987, lng: 73.7612, taluka: "Mulshi", pin: "411057" },
  "Undri": { lat: 18.465, lng: 73.907, taluka: "Haveli", pin: "411060" },
  "Balewadi": { lat: 18.5767, lng: 73.7787, taluka: "Haveli", pin: "411045" },
  "Hadapsar": { lat: 18.5089, lng: 73.926, taluka: "Haveli", pin: "411028" },
  "Mundhwa": { lat: 18.5314, lng: 73.933, taluka: "Haveli", pin: "411036" },
  "NIBM Road": { lat: 18.4772, lng: 73.8937, taluka: "Haveli", pin: "411048" },
  "Magarpatta": { lat: 18.5156, lng: 73.9279, taluka: "Haveli", pin: "411013" },
  "Tathawade": { lat: 18.614, lng: 73.7552, taluka: "Mulshi", pin: "411033" },
  "Wagholi": { lat: 18.58, lng: 73.98, taluka: "Haveli", pin: "412207" },
  "Kothrud": { lat: 18.5074, lng: 73.8077, taluka: "Haveli", pin: "411038" },
  "Viman Nagar": { lat: 18.5679, lng: 73.9143, taluka: "Haveli", pin: "411014" },
  "Mahalunge": { lat: 18.57, lng: 73.76, taluka: "Mulshi", pin: "411045" },
  "Amanora Park Town": { lat: 18.517, lng: 73.934, taluka: "Haveli", pin: "411028" },
  "Pashan": { lat: 18.5397, lng: 73.7922, taluka: "Haveli", pin: "411021" },
  "Kondhwa": { lat: 18.466, lng: 73.889, taluka: "Haveli", pin: "411048" },
  "Kalyani Nagar": { lat: 18.5463, lng: 73.9029, taluka: "Haveli", pin: "411006" },
  "Koregaon Park": { lat: 18.5362, lng: 73.8938, taluka: "Haveli", pin: "411001" },
  "Dhanori": { lat: 18.5946, lng: 73.9084, taluka: "Haveli", pin: "411015" },
  "Talegaon Dabhade": { lat: 18.735, lng: 73.676, taluka: "Maval", pin: "410507" },
  "Manjri": { lat: 18.52, lng: 73.975, taluka: "Haveli", pin: "412307" },
  "Lohegaon": { lat: 18.597, lng: 73.922, taluka: "Haveli", pin: "411047" },
  "Shivaji Nagar": { lat: 18.5308, lng: 73.8475, taluka: "Haveli", pin: "411005" },
  "Sinhgad Road": { lat: 18.48, lng: 73.81, taluka: "Haveli", pin: "411030" },
  "Sus": { lat: 18.54, lng: 73.76, taluka: "Mulshi", pin: "411021" },
  "Wanowrie": { lat: 18.495, lng: 73.897, taluka: "Haveli", pin: "411040" },
  "Dehu Road": { lat: 18.709, lng: 73.741, taluka: "Haveli", pin: "412101" },
  "Narhe": { lat: 18.462, lng: 73.816, taluka: "Haveli", pin: "411041" },
  "Aundh": { lat: 18.558, lng: 73.8075, taluka: "Haveli", pin: "411007" },
  "Moshi": { lat: 18.677, lng: 73.846, taluka: "Haveli", pin: "412105" },
  "Bibwewadi": { lat: 18.477, lng: 73.862, taluka: "Haveli", pin: "411037" },
  "Jambhe": { lat: 18.554, lng: 73.704, taluka: "Mulshi", pin: "412110" },
  "Airport Road": { lat: 18.58, lng: 73.9, taluka: "Haveli", pin: "411032" },
  "Mohammed Wadi": { lat: 18.465, lng: 73.915, taluka: "Haveli", pin: "411060" },
  "Sangamvadi": { lat: 18.536, lng: 73.868, taluka: "Haveli", pin: "411001" },
  "Erandwane": { lat: 18.504, lng: 73.833, taluka: "Haveli", pin: "411004" },
  "Wadgaon Sheri": { lat: 18.55, lng: 73.915, taluka: "Haveli", pin: "411014" },
  "Pimpri": { lat: 18.6279, lng: 73.8009, taluka: "Haveli", pin: "411017" },
  "Ghorpadi": { lat: 18.508, lng: 73.906, taluka: "Haveli", pin: "411001" },
  "Rahatani": { lat: 18.6, lng: 73.79, taluka: "Haveli", pin: "411017" },
  "Dhayari": { lat: 18.45, lng: 73.801, taluka: "Haveli", pin: "411041" },
  "Charholi": { lat: 18.635, lng: 73.9, taluka: "Haveli", pin: "412105" },
  "Katraj": { lat: 18.4575, lng: 73.865, taluka: "Haveli", pin: "411046" },
  "Pirangut": { lat: 18.522, lng: 73.686, taluka: "Mulshi", pin: "412115" },
  "Camp": { lat: 18.5155, lng: 73.879, taluka: "Haveli", pin: "411001" },
  "Bhukum": { lat: 18.524, lng: 73.699, taluka: "Mulshi", pin: "412115" },
  "Bhosari": { lat: 18.6469, lng: 73.8458, taluka: "Haveli", pin: "411039" },
  "Yerwada": { lat: 18.5535, lng: 73.8848, taluka: "Haveli", pin: "411006" },
  "Warje": { lat: 18.4837, lng: 73.7993, taluka: "Haveli", pin: "411058" },
  "Pune": { lat: 18.5204, lng: 73.8567, taluka: "Haveli", pin: "411001" },
};

// Spelling variants and sub-localities that should collapse onto a canonical name
const LOCALITY_ALIASES: [RegExp, string][] = [
  [/hinjew?adi|hinjawadi/i, "Hinjawadi"],
  [/pimpri\s*chinchwad|chinchwad/i, "Pimpri Chinchwad"],
  [/keshav nagar mundhwa|mundhwa/i, "Mundhwa"],
  [/nibm/i, "NIBM Road"],
  [/manjri/i, "Manjri"],
  [/kharadi/i, "Kharadi"],
  [/charholi/i, "Charholi"],
  [/kondhwa/i, "Kondhwa"],
  [/shivaji\s*nagar/i, "Shivaji Nagar"],
  [/kalyani\s*nagar/i, "Kalyani Nagar"],
  [/viman\s*nagar/i, "Viman Nagar"],
  [/wadgaon\s*sheri/i, "Wadgaon Sheri"],
  [/mohamm?ad\s*wadi|mohamadwadi/i, "Mohammed Wadi"],
  [/dehu\s*road/i, "Dehu Road"],
  [/amanora/i, "Amanora Park Town"],
  [/talegaon/i, "Talegaon Dabhade"],
  [/koregaon\s*park/i, "Koregaon Park"],
];

export interface ResolvedLocality extends Locality { name: string; exact: boolean }

export function resolveLocality(raw: string): ResolvedLocality {
  const text = raw.replace(/\s*Pune$/i, "").trim();

  const direct = Object.keys(LOCALITIES).find((k) => k.toLowerCase() === text.toLowerCase());
  if (direct) return { name: direct, ...LOCALITIES[direct], exact: true };

  for (const [re, canonical] of LOCALITY_ALIASES) if (re.test(text)) return { name: canonical, ...LOCALITIES[canonical], exact: false };

  // "Laxmi Nagar Balewadi" → ends with a known locality
  const suffix = Object.keys(LOCALITIES)
    .filter((k) => k !== "Pune")
    .sort((a, b) => b.length - a.length)
    .find((k) => text.toLowerCase().endsWith(k.toLowerCase()) || text.toLowerCase().includes(k.toLowerCase()));
  if (suffix) return { name: suffix, ...LOCALITIES[suffix], exact: false };

  return { name: text || "Pune", ...LOCALITIES.Pune, exact: false };
}

// ─── Property type ───

export function propertyTypeFor(kind: ListingKind): string {
  if (kind === "Villa") return "pt-bungalow";
  if (kind === "House") return "pt-rowhouse";
  return "pt-flat"; // Apartment, Flat, Penthouse, Builder Floor
}

// ─── Deterministic randomness ───

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(private next: () => number) {}
  float() { return this.next(); }
  int(lo: number, hi: number) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ─── Plan types ───

export type DocScenario = "clean" | "owner-mismatch" | "area-mismatch" | "wrong-property" | "wrong-type";
export type RecordScenario = "scraped-duplicate" | "relisting" | "ownership-conflict";

export interface PlannedProperty {
  id: string;
  title: string;
  description: string;
  propertyTypeId: string;
  price: number | null;
  areaSqft: number | null;
  surveyNumber: string;
  ownerId: string;
  brokerId: string;
  status: string;
  address: { line1: string; line2: string | null; city: string; district: string; state: string; postalCode: string; latitude: number; longitude: number };
  metadata: Record<string, unknown>;
  sourceRow: number | null; // 1-based CSV data row, null for generated records
  recordScenario?: RecordScenario;
  docScenario?: DocScenario;
}

export interface PlannedCase {
  id: string;
  caseNumber: string;
  courtName: string;
  courtType: string;
  caseType: string;
  caseStatus: "ACTIVE" | "DISPOSED";
  title: string;
  description: string;
  filingDate: Date;
  nextHearingDate: Date | null;
  dispositionDate: Date | null;
  propertyId: string;
  linkType: string;
  impactScore: number;
  parties: { name: string; role: "PLAINTIFF" | "DEFENDANT"; advocate: string }[];
  stayOrder: boolean;
}

export interface DatasetPlan {
  properties: PlannedProperty[];
  courtCases: PlannedCase[];
  summary: Record<string, number>;
}

export interface PlanOptions {
  ownerIds: string[];
  /** optional display names by owner id — lets conflict scenarios pick an owner with a clearly different surname */
  ownerNames?: Record<string, string>;
  brokerIds: string[];
  seed?: number;
  now?: Date;
  /** how many properties get each kind of scenario (defaults give a good demo) */
  counts?: Partial<{ relistings: number; conflicts: number; courtShare: number; docClean: number; docOwner: number; docArea: number; docWrongProperty: number; docWrongType: number }>;
}

// ─── Names (synthetic) ───

const FIRST = ["Rajesh", "Sunil", "Amit", "Vikram", "Sachin", "Mahesh", "Anil", "Sanjay", "Pramod", "Ramesh", "Vinod", "Ashok", "Deepak", "Nitin", "Suresh", "Ganesh", "Prashant", "Ravi", "Manish", "Ajay", "Sunita", "Anita", "Rekha", "Savita", "Meena", "Priya", "Swati", "Jyoti"];
const LAST = ["Patil", "Deshmukh", "Kulkarni", "Joshi", "Deshpande", "Pawar", "Jadhav", "More", "Shinde", "Gaikwad", "Bhosale", "Kadam", "Salunkhe", "Mane", "Chavan", "Kale", "Sharma", "Gupta", "Mehta", "Shah"];
const fullName = (r: Rng) => `${r.pick(FIRST)} ${r.pick(LAST)}`;

// ─── Building the plan ───

const clean = (s: string | undefined) => (s ?? "").trim();

function listingKey(r: Record<string, string>): string {
  return ["Title", "Price", "Carpet_Area", "Super_Area", "Floor", "Society"].map((k) => clean(r[k])).join("|");
}

export function buildPlan(rows: Record<string, string>[], opts: PlanOptions): DatasetPlan {
  if (!opts.ownerIds.length || !opts.brokerIds.length) throw new Error("buildPlan needs at least one owner and one broker id");

  const rng = new Rng(mulberry32(opts.seed ?? 20260723));
  const now = opts.now ?? new Date("2026-10-23T00:00:00Z");
  const counts = { relistings: 8, conflicts: 6, courtShare: 0.12, docClean: 24, docOwner: 7, docArea: 5, docWrongProperty: 4, docWrongType: 3, ...(opts.counts || {}) };

  const usedSurveys = new Map<string, Set<string>>(); // village → survey numbers already taken
  const newSurvey = (village: string): string => {
    const used = usedSurveys.get(village) ?? new Set<string>();
    usedSurveys.set(village, used);
    for (let tries = 0; tries < 500; tries++) {
      const s = `${rng.int(1, 420)}/${rng.int(1, 24)}${rng.chance(0.35) ? rng.pick(["A", "B", "C", "D"]) : ""}`;
      if (!used.has(s)) { used.add(s); return s; }
    }
    throw new Error(`Ran out of survey numbers for ${village}`);
  };

  const properties: PlannedProperty[] = [];
  const byKey = new Map<string, PlannedProperty>();
  const pad = (n: number) => String(n).padStart(4, "0");

  // 1. One property per CSV row. Rows repeating an earlier listing (the scraper saw it twice)
  //    become real duplicate listings that share the original's identity.
  rows.forEach((row, idx) => {
    const parsed = parseTitle(clean(row.Title), clean(row.Society));
    const loc = resolveLocality(parsed.localityRaw);
    const price = parsePrice(row.Price);
    const rate = parseSqft(row.Rate_per_SqFt);
    const area = parseSqft(row.Carpet_Area) ?? parseSqft(row.Super_Area) ?? (price && rate ? Math.round(price / rate) : null);

    const key = listingKey(row);
    const original = byKey.get(key);

    const base = original ?? undefined;
    const owner = base?.ownerId ?? rng.pick(opts.ownerIds);
    const broker = rng.pick(opts.brokerIds);

    const prop: PlannedProperty = {
      id: `pune-${pad(idx + 1)}`,
      title: `${parsed.bhk ? `${parsed.bhk} BHK ` : ""}${parsed.kind === "Other" ? "Property" : parsed.kind}${parsed.society ? ` in ${parsed.society}` : ""}, ${loc.name}`,
      description:
        `${parsed.bhk ? `${parsed.bhk} BHK ` : ""}${parsed.kind.toLowerCase()} in ${parsed.society || loc.name}, ${loc.name}, Pune.` +
        (area ? ` ${Math.round(area).toLocaleString("en-IN")} sq ft.` : "") +
        (clean(row.Floor) ? ` Floor ${clean(row.Floor)}.` : "") +
        (clean(row.Furnishing) ? ` ${clean(row.Furnishing)}.` : "") +
        (clean(row.facing) ? ` ${clean(row.facing)}-facing.` : ""),
      propertyTypeId: propertyTypeFor(parsed.kind),
      price,
      areaSqft: base?.areaSqft ?? area,
      surveyNumber: base?.surveyNumber ?? newSurvey(loc.name),
      ownerId: owner,
      brokerId: broker,
      status: "LISTED",
      address: base
        ? { ...base.address }
        : {
            line1: parsed.society ? `${parsed.society}` : `Plot ${rng.int(1, 200)}, ${loc.name}`,
            line2: clean(row.Floor) ? `Floor ${clean(row.Floor)}` : null,
            city: "Pune",
            district: "Pune",
            state: "Maharashtra",
            postalCode: loc.pin,
            // ±0.004° ≈ ±400 m around the locality centre
            latitude: Math.round((loc.lat + (rng.float() - 0.5) * 0.008) * 1e6) / 1e6,
            longitude: Math.round((loc.lng + (rng.float() - 0.5) * 0.008) * 1e6) / 1e6,
          },
      metadata: {
        village: loc.name,
        taluka: loc.taluka,
        zone: "residential",
        ...(clean(row.facing) && { facing: clean(row.facing) }),
        source: "kaggle:shubham001official/pune-real-estate-listings-dataset",
        sourceTitle: clean(row.Title),
        localityRaw: parsed.localityRaw,
        localityApprox: !loc.exact,
        bhk: parsed.bhk,
        listingKind: parsed.kind,
        society: parsed.society,
        floor: clean(row.Floor) || null,
        furnishing: clean(row.Furnishing) || null,
        ownershipType: clean(row.Ownership) || null,
        transaction: clean(row.Transaction) || null,
        parking: clean(row.Car_Parking).replace(/,$/, "") || null,
        bathrooms: Number(row.Bathroom) || null,
        balconies: Number(row.Balcony) || null,
        ratePerSqft: rate,
        possession: clean(row.Under_Construction) || null,
        overlooking: clean(row.overlooking) || null,
        superAreaSqft: parseSqft(row.Super_Area),
        synthetic: ["surveyNumber", "owner", "broker", "coordinates", "postalCode"],
      },
      sourceRow: idx + 1,
      ...(original ? { recordScenario: "scraped-duplicate" as const } : {}),
    };

    if (!original) byKey.set(key, prop);
    properties.push(prop);
  });

  const originals = properties.filter((p) => !p.recordScenario);
  const pool = rng.shuffle(originals);
  const take = (n: number) => pool.splice(0, n);

  // 2. Scenario: documents (decides which properties get sample documents and how they disagree)
  const docPlan: [DocScenario, number][] = [
    ["clean", counts.docClean],
    ["owner-mismatch", counts.docOwner],
    ["area-mismatch", counts.docArea],
    ["wrong-property", counts.docWrongProperty],
    ["wrong-type", counts.docWrongType],
  ];
  for (const [scenario, n] of docPlan) for (const p of take(n)) p.docScenario = scenario;

  // 3. Scenario: the same flat re-listed by another broker
  const generated: PlannedProperty[] = [];
  let genCounter = rows.length;
  const jitter = (v: number, spread: number) => Math.round((v + (rng.float() - 0.5) * spread) * 1e6) / 1e6;

  for (const orig of take(counts.relistings)) {
    const otherBrokers = opts.brokerIds.filter((b) => b !== orig.brokerId);
    const broker = rng.pick(otherBrokers.length ? otherBrokers : opts.brokerIds);
    generated.push({
      ...orig,
      id: `pune-${pad(++genCounter)}`,
      title: `${orig.title} (relisted)`,
      brokerId: broker,
      price: orig.price ? Math.round((orig.price * (1 + (rng.float() - 0.5) * 0.06)) / 1000) * 1000 : null,
      areaSqft: orig.areaSqft ? Math.round(orig.areaSqft * (1 + (rng.float() - 0.5) * 0.01)) : null,
      address: { ...orig.address, latitude: jitter(orig.address.latitude, 0.0002), longitude: jitter(orig.address.longitude, 0.0002) },
      metadata: { ...orig.metadata, source: "synthetic:relisting", synthetic: [...(orig.metadata.synthetic as string[]), "listing"] },
      sourceRow: null,
      recordScenario: "relisting",
      docScenario: undefined,
    });
  }

  // 4. Scenario: the same survey number claimed by a different owner
  for (const orig of take(counts.conflicts)) {
    const nameOf = (id: string) => opts.ownerNames?.[id] ?? id;
    const otherOwners = opts.ownerIds.filter((o) => o !== orig.ownerId);
    if (!otherOwners.length) throw new Error("Ownership-conflict scenarios need at least two owners");
    // use the matching engine's own name comparison so the planted conflict is unambiguous:
    // a shared surname or first name would read as "possibly the same person"
    const distinct = otherOwners.filter((o) => matchOwnerName(nameOf(o), nameOf(orig.ownerId)) < 0.4);
    const otherOwner = rng.pick(distinct.length ? distinct : otherOwners);
    generated.push({
      ...orig,
      id: `pune-${pad(++genCounter)}`,
      title: `${orig.title} (second claim)`,
      ownerId: otherOwner,
      brokerId: rng.pick(opts.brokerIds),
      price: orig.price ? Math.round((orig.price * (0.85 + rng.float() * 0.3)) / 1000) * 1000 : null,
      areaSqft: orig.areaSqft ? Math.round(orig.areaSqft * (0.92 + rng.float() * 0.16)) : null,
      address: { ...orig.address, latitude: jitter(orig.address.latitude, 0.0004), longitude: jitter(orig.address.longitude, 0.0004) },
      metadata: { ...orig.metadata, source: "synthetic:ownership-conflict", synthetic: [...(orig.metadata.synthetic as string[]), "listing"] },
      sourceRow: null,
      recordScenario: "ownership-conflict",
      docScenario: undefined,
    });
  }
  properties.push(...generated);

  // 5. Court cases on ~12% of the remaining originals (never on the "clean documents" demo set)
  const litigable = originals.filter((p) => p.docScenario !== "clean");
  const caseTargets = rng.shuffle(litigable).slice(0, Math.round(originals.length * counts.courtShare));
  const courtCases: PlannedCase[] = [];
  const usedCaseNumbers = new Set<string>();

  const CASE_KINDS = [
    { linkType: "TITLE_DISPUTE", w: 0.34, caseType: "CIVIL", prefix: "CS", court: ["Civil Court, Pune", "District Court, Pune"] },
    { linkType: "BOUNDARY_DISPUTE", w: 0.14, caseType: "CIVIL", prefix: "RCA", court: ["Civil Court, Pune", "Revenue Tribunal, Pune"] },
    { linkType: "FRAUD", w: 0.06, caseType: "CRIMINAL", prefix: "CC", court: ["District Court, Pune", "High Court, Bombay (Pune Bench)"] },
    { linkType: "RERA_COMPLAINT", w: 0.2, caseType: "RERA", prefix: "CC", court: ["MahaRERA, Mumbai"] },
    { linkType: "PAYMENT_DISPUTE", w: 0.14, caseType: "CONSUMER", prefix: "CC", court: ["District Consumer Commission, Pune"] },
    { linkType: "TENANCY", w: 0.12, caseType: "CIVIL", prefix: "MA", court: ["Civil Court, Pune"] },
  ];
  const pickKind = () => {
    let x = rng.float();
    for (const k of CASE_KINDS) { if ((x -= k.w) < 0) return k; }
    return CASE_KINDS[0];
  };

  caseTargets.forEach((prop, i) => {
    const nCases = rng.chance(0.12) ? 2 : 1;
    for (let c = 0; c < nCases; c++) {
      const kind = pickKind();
      const year = rng.int(2019, 2026);
      let caseNumber = "";
      do { caseNumber = `${kind.prefix}/${rng.int(100, 9999)}/${year}`; } while (usedCaseNumbers.has(caseNumber));
      usedCaseNumbers.add(caseNumber);

      const active = rng.chance(0.65);
      const filing = new Date(Date.UTC(year, rng.int(0, 11), rng.int(1, 28)));
      const stay = active && ["TITLE_DISPUTE", "BOUNDARY_DISPUTE", "FRAUD"].includes(kind.linkType) && rng.chance(0.14);
      const plaintiff = fullName(rng);
      const defendant = fullName(rng);

      courtCases.push({
        id: `pune-case-${pad(i * 2 + c + 1)}`,
        caseNumber,
        courtName: rng.pick(kind.court),
        courtType: kind.caseType === "RERA" ? "Tribunal" : "District",
        caseType: kind.caseType,
        caseStatus: active ? "ACTIVE" : "DISPOSED",
        title: `${plaintiff} vs ${defendant}`,
        description: `${kind.linkType.replace(/_/g, " ").toLowerCase()} concerning ${prop.title}.`,
        filingDate: filing,
        nextHearingDate: active ? new Date(now.getTime() + rng.int(5, 120) * 86400000) : null,
        dispositionDate: active ? null : new Date(Math.min(now.getTime() - 86400000, filing.getTime() + rng.int(180, 900) * 86400000)),
        propertyId: prop.id,
        linkType: kind.linkType,
        impactScore: Math.round((0.3 + rng.float() * 0.6) * 100) / 100,
        parties: [
          { name: plaintiff, role: "PLAINTIFF", advocate: `Adv. ${fullName(rng)}` },
          { name: defendant, role: "DEFENDANT", advocate: `Adv. ${fullName(rng)}` },
        ],
        stayOrder: stay,
      });
    }
  });

  // 6. Status mirrors what a reviewer would have concluded
  const litigationFlag = new Set(courtCases.filter((c) => c.stayOrder || c.linkType === "FRAUD").map((c) => c.propertyId));

  // a property is "involved" if it was re-listed / re-claimed / scraped twice — both sides get flagged
  const involved = new Set<string>();
  for (const p of properties.filter((x) => x.recordScenario)) {
    involved.add(p.id);
    const orig = originals.find((o) => o.surveyNumber === p.surveyNumber && o.metadata.village === p.metadata.village);
    if (orig) involved.add(orig.id);
  }

  for (const p of properties) {
    if (p.docScenario === "clean") p.status = "VERIFIED";
    else if (p.docScenario) p.status = "UNDER_VERIFICATION";
    else if (litigationFlag.has(p.id) || involved.has(p.id)) p.status = "FLAGGED";
    else if (rng.chance(0.04)) p.status = "DRAFT";
  }

  const summary: Record<string, number> = {
    csvRows: rows.length,
    scrapedDuplicates: properties.filter((p) => p.recordScenario === "scraped-duplicate").length,
    relistings: generated.filter((p) => p.recordScenario === "relisting").length,
    ownershipConflicts: generated.filter((p) => p.recordScenario === "ownership-conflict").length,
    properties: properties.length,
    courtCases: courtCases.length,
    activeCases: courtCases.filter((c) => c.caseStatus === "ACTIVE").length,
    stayOrders: courtCases.filter((c) => c.stayOrder).length,
    withSampleDocuments: properties.filter((p) => p.docScenario).length,
    approximateLocalities: properties.filter((p) => p.metadata.localityApprox).length,
  };

  return { properties, courtCases, summary };
}

// ─── News linking ───

export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export function sentimentFromHeadline(headline: string): { sentiment: Sentiment; score: number } {
  const neg = /illegal|fraud|dispute|arrest|encroach|demolition|discrepanc|scarcity|refund|hurdle|blocks?|busted|fake|scam|stuck|delay/i;
  const pos = /surge|boost|rise|up \d+%|appreciation|transform|upholds|growth|smart city|metro|demand/i;
  if (neg.test(headline)) return { sentiment: "NEGATIVE", score: -0.6 };
  if (pos.test(headline)) return { sentiment: "POSITIVE", score: 0.55 };
  return { sentiment: "NEUTRAL", score: 0 };
}

/** Which localities does this piece of text mention? (canonical names) */
export function localitiesMentioned(text: string): string[] {
  const found = new Set<string>();
  for (const name of Object.keys(LOCALITIES)) {
    if (name === "Pune") continue;
    if (new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)) found.add(name);
  }
  for (const [re, canonical] of LOCALITY_ALIASES) if (re.test(text)) found.add(canonical);
  return [...found];
}
