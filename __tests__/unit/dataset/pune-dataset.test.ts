// __tests__/unit/dataset/pune-dataset.test.ts

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseCsv, parsePrice, parseSqft, parseTitle, resolveLocality, propertyTypeFor,
  buildPlan, sentimentFromHeadline, localitiesMentioned, mulberry32,
} from "@/modules/dataset/pune-dataset";
import { computeMatchScore } from "@/modules/matching/matching.algorithms";

const CSV = readFileSync(path.join(process.cwd(), "data/pune-real-estate/listings.csv"), "utf8");
const OWNER_NAMES = ["Rajesh Patil", "Sunil Joshi", "Amit Kulkarni", "Vikram Shinde", "Sachin Pawar", "Mahesh Gaikwad", "Anil Deshmukh", "Sanjay More", "Pramod Kadam", "Ramesh Chavan"];
const OWNERS = OWNER_NAMES.map((_, i) => `owner-${i}`);
const nameOf = (id: string) => OWNER_NAMES[OWNERS.indexOf(id)];
const BROKERS = Array.from({ length: 5 }, (_, i) => `broker-${i}`);
const plan = () => buildPlan(parseCsv(CSV), { ownerIds: OWNERS, brokerIds: BROKERS });

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n1,2\r\n');
    expect(rows).toEqual([{ a: "x, y", b: 'say "hi"' }, { a: "1", b: "2" }]);
  });
  it("reads the real file: 930 rows, 18 columns", () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(930);
    expect(Object.keys(rows[0])).toHaveLength(18);
    expect(rows[0].Title).toContain("Saarrthi Shimmer n Shine");
  });
});

describe("parsers", () => {
  it.each([["1.75 Cr", 17500000], ["61.6 Lac", 6160000], ["2.60 Cr", 26000000], ["1,200 Lac", 120000000]])("price %s → %d", (raw, n) => {
    expect(parsePrice(raw)).toBe(n);
  });
  it("returns null for junk prices", () => expect(parsePrice("Call for price")).toBeNull());
  it.each([["1165 sqft", 1165], ["1,165 sq ft", 1165], ["", null], [undefined, null]])("area %s → %s", (raw, n) => {
    expect(parseSqft(raw as string | undefined)).toBe(n);
  });
  it("parses a listing title", () => {
    expect(parseTitle("3 BHK Flat  for Sale in Acolade, Kharadi, Pune", "Acolade")).toEqual({ bhk: 3, kind: "Flat", society: "Acolade", localityRaw: "Kharadi" });
    expect(parseTitle("4 BHK Villa for Sale in Atul Westernhills Phase 1, Baner Pune").localityRaw).toBe("Baner");
    expect(parseTitle("3 BHK  House for Sale in Kalpana Empress, Wanowrie Pune").kind).toBe("House");
  });
  it("maps listing kinds to property types", () => {
    expect(propertyTypeFor("Apartment")).toBe("pt-flat");
    expect(propertyTypeFor("Villa")).toBe("pt-bungalow");
    expect(propertyTypeFor("House")).toBe("pt-rowhouse");
  });
});

describe("resolveLocality", () => {
  it("matches known localities exactly", () => expect(resolveLocality("Kharadi Pune")).toMatchObject({ name: "Kharadi", exact: true, taluka: "Haveli" }));
  it("collapses spelling variants and sub-localities", () => {
    expect(resolveLocality("Phase 3 Hinjewadi Rajiv Gandhi Infotech Park").name).toBe("Hinjawadi");
    expect(resolveLocality("Keshav Nagar Mundhwa").name).toBe("Mundhwa");
    expect(resolveLocality("Laxman Nagar Baner").name).toBe("Baner");
    expect(resolveLocality("Tathawade Pimpri Chinchwad").name).toBe("Pimpri Chinchwad");
  });
  it("falls back to Pune centre and says so", () => {
    const r = resolveLocality("Some Unknown Layout");
    expect(r.name).toBe("Some Unknown Layout");
    expect(r.exact).toBe(false);
    expect(r.lat).toBeCloseTo(18.52, 1);
  });
});

describe("buildPlan on the real data", () => {
  const p = plan();

  it("is deterministic", () => {
    expect(JSON.stringify(plan().properties.slice(0, 50))).toBe(JSON.stringify(p.properties.slice(0, 50)));
  });
  it("changes with a different seed", () => {
    const other = buildPlan(parseCsv(CSV), { ownerIds: OWNERS, brokerIds: BROKERS, seed: 1 });
    expect(other.properties[0].surveyNumber).not.toBe(p.properties[0].surveyNumber);
  });

  it("creates one property per CSV row plus the generated scenario records", () => {
    expect(p.summary.csvRows).toBe(930);
    expect(p.summary.properties).toBe(930 + p.summary.relistings + p.summary.ownershipConflicts);
    expect(p.summary.relistings).toBe(8);
    expect(p.summary.ownershipConflicts).toBe(6);
  });

  it("gives every property a valid price, area, coordinates in the Pune region, and an Indian PIN", () => {
    for (const x of p.properties) {
      expect(x.price).toBeGreaterThan(0);
      expect(x.areaSqft).toBeGreaterThan(0);
      expect(x.address.latitude).toBeGreaterThan(18.3);
      expect(x.address.latitude).toBeLessThan(18.85);
      expect(x.address.longitude).toBeGreaterThan(73.5);
      expect(x.address.longitude).toBeLessThan(74.1);
      expect(x.address.postalCode).toMatch(/^\d{6}$/);
    }
  });

  it("has unique ids", () => expect(new Set(p.properties.map((x) => x.id)).size).toBe(p.properties.length));

  it("never reuses a survey number inside a village unless it is a deliberate duplicate/claim", () => {
    const seen = new Map<string, string>();
    for (const x of p.properties.filter((y) => !y.recordScenario)) {
      const k = `${x.metadata.village}|${x.surveyNumber}`;
      expect(seen.has(k), `${k} used by ${seen.get(k)} and ${x.id}`).toBe(false);
      seen.set(k, x.id);
    }
  });

  it("makes relistings and scraped duplicates share the original's survey, village and owner", () => {
    const dups = p.properties.filter((x) => x.recordScenario === "relisting" || x.recordScenario === "scraped-duplicate");
    expect(dups.length).toBeGreaterThan(8);
    for (const d of dups) {
      const orig = p.properties.find((o) => !o.recordScenario && o.surveyNumber === d.surveyNumber && o.metadata.village === d.metadata.village)!;
      expect(orig, d.id).toBeDefined();
      expect(d.ownerId).toBe(orig.ownerId);
    }
  });

  it("makes ownership-conflict records share survey + village but not owner", () => {
    const conflicts = p.properties.filter((x) => x.recordScenario === "ownership-conflict");
    expect(conflicts).toHaveLength(6);
    for (const c of conflicts) {
      const orig = p.properties.find((o) => !o.recordScenario && o.surveyNumber === c.surveyNumber && o.metadata.village === c.metadata.village)!;
      expect(orig.ownerId).not.toBe(c.ownerId);
    }
  });

  it("produces scenarios the matching engine actually recognises", () => {
    const facts = (x: (typeof p.properties)[number]) => ({
      surveyNumber: x.surveyNumber, ownerName: nameOf(x.ownerId), village: x.metadata.village as string,
      area: x.areaSqft, price: x.price, latitude: x.address.latitude, longitude: x.address.longitude,
    });
    const orig = (c: (typeof p.properties)[number]) => p.properties.find((o) => !o.recordScenario && o.surveyNumber === c.surveyNumber && o.metadata.village === c.metadata.village)!;

    for (const c of p.properties.filter((x) => x.recordScenario === "ownership-conflict")) {
      expect(computeMatchScore(facts(c), facts(orig(c))).matchType).toBe("conflict");
    }
    for (const r of p.properties.filter((x) => x.recordScenario === "relisting")) {
      expect(["exact_duplicate", "likely_duplicate"]).toContain(computeMatchScore(facts(r), facts(orig(r))).matchType);
    }
  });

  it("assigns sample-document scenarios to exactly the configured numbers", () => {
    const by = (s: string) => p.properties.filter((x) => x.docScenario === s).length;
    expect([by("clean"), by("owner-mismatch"), by("area-mismatch"), by("wrong-property"), by("wrong-type")]).toEqual([24, 7, 5, 4, 3]);
  });

  it("only links court cases to properties that exist, with unique case numbers", () => {
    const ids = new Set(p.properties.map((x) => x.id));
    expect(p.courtCases.length).toBeGreaterThan(80);
    expect(new Set(p.courtCases.map((c) => c.caseNumber)).size).toBe(p.courtCases.length);
    for (const c of p.courtCases) {
      expect(ids.has(c.propertyId)).toBe(true);
      expect(c.parties).toHaveLength(2);
      if (c.caseStatus === "ACTIVE") expect(c.nextHearingDate!.getTime()).toBeGreaterThan(new Date("2026-10-23").getTime());
      else expect(c.nextHearingDate).toBeNull();
    }
  });

  it("keeps stay orders on active cases only, and never touches the clean-document demo set", () => {
    for (const c of p.courtCases.filter((x) => x.stayOrder)) expect(c.caseStatus).toBe("ACTIVE");
    const clean = new Set(p.properties.filter((x) => x.docScenario === "clean").map((x) => x.id));
    expect(p.courtCases.some((c) => clean.has(c.propertyId))).toBe(false);
  });

  it("marks what is synthetic so it can't be mistaken for fact", () => {
    for (const x of p.properties) expect(x.metadata.synthetic).toEqual(expect.arrayContaining(["surveyNumber", "owner", "coordinates"]));
  });

  it("flags properties that have a stay order or a duplicate, and verifies the clean-document set", () => {
    const flagged = new Set(p.properties.filter((x) => x.status === "FLAGGED").map((x) => x.id));
    for (const c of p.courtCases.filter((x) => x.stayOrder)) expect(flagged.has(c.propertyId)).toBe(true);
    expect(p.properties.filter((x) => x.docScenario === "clean").every((x) => x.status === "VERIFIED")).toBe(true);
  });
});

describe("buildPlan guards", () => {
  it("needs owners and brokers", () => {
    expect(() => buildPlan([], { ownerIds: [], brokerIds: ["b"] })).toThrow();
  });
});

describe("news linking helpers", () => {
  it.each([
    ["Builder arrested for selling same flat to three buyers", "NEGATIVE"],
    ["Property fraud ring busted with fake documents", "NEGATIVE"],
    ["Hinjewadi Phase 3 land prices surge 40%", "POSITIVE"],
    ["Property registrations up 18% in Pune district Q2", "POSITIVE"],
    ["Pune ring road meeting held on Tuesday", "NEUTRAL"],
  ])("%s → %s", (headline, expected) => expect(sentimentFromHeadline(headline).sentiment).toBe(expected));

  it("finds localities in a headline", () => {
    expect(localitiesMentioned("Hinjewadi Phase 3 land prices surge 40%")).toContain("Hinjawadi");
    expect(localitiesMentioned("Kharadi-Mundhwa corridor sees 22% price appreciation")).toEqual(expect.arrayContaining(["Kharadi", "Mundhwa"]));
    expect(localitiesMentioned("Weather in Mumbai")).toEqual([]);
  });
});

describe("mulberry32", () => {
  it("is reproducible and in [0,1)", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
