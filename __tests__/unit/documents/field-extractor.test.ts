// __tests__/unit/documents/field-extractor.test.ts

import { describe, it, expect } from "vitest";
import {
  normalizeDigits,
  classifyDocument,
  kindFromSlug,
  extractSurveyNumber,
  extractOwnerName,
  extractArea,
  extractDate,
  extractAmount,
  extractFields,
  stripOcrJunk,
} from "@/modules/documents/ocr/field-extractor";
import { verifyAgainstProperty } from "@/modules/documents/ocr/verification";

const SEVEN_TWELVE = `Government of Maharashtra
VILLAGE FORM 7/12 - RECORD OF RIGHTS
Village: Hinjewadi
Taluka: Mulshi
District: Pune
Survey No: 118/2A
Area: 0.40 H.R
Khatedar: Shri Rajesh Suresh Mehta
Date: 12/03/2024`;

const SALE_DEED = `DEED OF SALE (Sale Deed)
Registration No: HVL-4521-2024
Date: 21 March 2024
Vendor: Shri Rajesh Suresh Mehta
Purchaser: Mr. Anil Kulkarni
Property: Survey No. 118/2A, Village: Hinjewadi
Area: 4,000 sq ft
Consideration: Rs. 45,00,000`;

describe("normalizeDigits", () => {
  it("converts Devanagari digits to ASCII", () => {
    expect(normalizeDigits("सर्व्हे नंबर ११८/२")).toBe("सर्व्हे नंबर 118/2");
  });
});

describe("classifyDocument / kindFromSlug", () => {
  it("recognises a 7/12 extract", () => {
    expect(classifyDocument(SEVEN_TWELVE).kind).toBe("seven_twelve");
  });
  it("recognises a sale deed", () => {
    expect(classifyDocument(SALE_DEED).kind).toBe("sale_deed");
  });
  it("returns unknown for unrelated text", () => {
    expect(classifyDocument("lorem ipsum dolor sit amet").kind).toBe("unknown");
  });
  it("maps database slugs to kinds", () => {
    expect(kindFromSlug("7-12-extract")).toBe("seven_twelve");
    expect(kindFromSlug("sale-deed")).toBe("sale_deed");
    expect(kindFromSlug("tax-receipt")).toBe("tax_receipt");
    expect(kindFromSlug("site-photo")).toBe("unknown");
  });
});

describe("extractSurveyNumber", () => {
  it.each([
    ["Survey No: 118/2A", "118/2A"],
    ["S.No. 299/12", "299/12"],
    ["Gat No 45", "45"],
    ["सर्व्हे नंबर 118/2", "118/2"],
  ])("%s → %s", (text, expected) => {
    expect(extractSurveyNumber(text)?.value.replace(/\s/g, "")).toBe(expected);
  });
  it("returns null when absent", () => {
    expect(extractSurveyNumber("no numbers of that kind here")).toBeNull();
  });
});

describe("extractOwnerName", () => {
  it("strips titles and stops at the end of the name", () => {
    expect(extractOwnerName("Khatedar: Shri Rajesh Suresh Mehta")?.value).toBe("Rajesh Suresh Mehta");
  });
  it("removes OCR stray full-stops", () => {
    expect(extractOwnerName("Owner: Shri Rajesh. Mehta")?.value).toBe("Rajesh Mehta");
  });
  it("reads the Marathi label", () => {
    expect(extractOwnerName("भोगवटादार: राजेश मेहता")?.value).toBe("राजेश मेहता");
  });
});

describe("Marathi village", () => {
  it("reads the village, not the form title that also starts with 'गाव'", () => {
    const text = "गाव नमुना ७/१२ - अधिकार अभिलेख\nगाव: खराडी\nतालुका: हवेली";
    expect(extractFields(text, "seven_twelve").fields.village).toBe("खराडी");
  });
  it("reads 'मौजे' without a colon", () => {
    expect(extractFields("मौजे खराडी\nतालुका: हवेली", "seven_twelve").fields.village).toBe("खराडी");
  });
});

describe("extractArea", () => {
  it.each([
    ["Area: 4,000 sq ft", 4000],
    ["Area: 100 sq m", 1076.39],
    ["Area: 2 Guntha", 2178],
    ["Area: 1 acre", 43560],
    ["Area: 0.40 H.R", 43055.6],
  ])("%s → %d sq ft", (text, sqft) => {
    expect(extractArea(text)?.sqft).toBeCloseTo(sqft, 1);
  });
  it("returns null when there is no area", () => {
    expect(extractArea("Survey No: 118/2A")).toBeNull();
  });
});

describe("extractDate", () => {
  it("reads dd/mm/yyyy as an Indian date", () => {
    expect(extractDate("Date: 12/03/2024")?.iso).toBe("2024-03-12");
  });
  it("reads '21 March 2024'", () => {
    expect(extractDate("Dated 21 March 2024")?.iso).toBe("2024-03-21");
  });
  it("rejects impossible dates", () => {
    expect(extractDate("45/13/2024")).toBeNull();
  });
});

describe("extractAmount", () => {
  it("parses Indian digit grouping", () => {
    expect(extractAmount("Consideration: Rs. 45,00,000")?.value).toBe(4500000);
  });
});

describe("extractFields", () => {
  it("extracts every expected field from a 7/12 extract", () => {
    const r = extractFields(SEVEN_TWELVE, "seven_twelve");
    expect(r.fields).toMatchObject({
      surveyNumber: "118/2A",
      ownerName: "Rajesh Suresh Mehta",
      village: "Hinjewadi",
      taluka: "Mulshi",
      district: "Pune",
      documentDate: "2024-03-12",
    });
    expect(r.completeness).toBe(1);
  });

  it("extracts seller, buyer and price from a sale deed", () => {
    const r = extractFields(SALE_DEED, "sale_deed");
    expect(r.fields).toMatchObject({
      ownerName: "Rajesh Suresh Mehta",
      buyerName: "Anil Kulkarni",
      registrationNumber: "HVL-4521-2024",
      amount: 4500000,
      areaSqft: 4000,
    });
  });

  it("reports low completeness for junk text", () => {
    expect(extractFields("xx qq zz", "seven_twelve").completeness).toBe(0);
  });
});

describe("verifyAgainstProperty", () => {
  const property = { surveyNumber: "118/2A", areaSqft: 43000, ownerName: "Rajesh Mehta", village: "Hinjewadi" };

  it("verifies a matching document", () => {
    const v = verifyAgainstProperty(extractFields(SEVEN_TWELVE, "seven_twelve"), property, "seven_twelve");
    expect(v.overall).toBe("verified");
  });

  it("flags a different owner and area", () => {
    const other = SEVEN_TWELVE.replace("Rajesh Suresh Mehta", "Vinod Shinde").replace("0.40 H.R", "0.10 H.R");
    const v = verifyAgainstProperty(extractFields(other, "seven_twelve"), property, "seven_twelve");
    expect(v.overall).toBe("discrepancies");
    expect(v.checks.find((c) => c.field === "ownerName")?.status).toBe("mismatch");
    expect(v.checks.find((c) => c.field === "areaSqft")?.status).toBe("mismatch");
  });

  it("warns when the document is not the type it was uploaded as", () => {
    const v = verifyAgainstProperty(extractFields(SALE_DEED, "title_deed"), property, "title_deed");
    expect(v.kindMismatch).toEqual({ uploadedAs: "title_deed", looksLike: "sale_deed" });
  });

  it("compares Marathi text to a Latin-script record by transliterating it", () => {
    const marathi = extractFields("भोगवटादार: राजेश मेहता\nसर्व्हे नंबर 118/2A", "seven_twelve");
    const v = verifyAgainstProperty(marathi, property, "seven_twelve");
    const owner = v.checks.find((c) => c.field === "ownerName");
    expect(owner?.transliteration?.engine).toBe("rules");
    // the record's owner is someone else here, which rule-based reading alone can't call a mismatch
    expect(["match", "partial", "unverifiable"]).toContain(owner?.status);
  });

  it("reports insufficient data when nothing could be compared", () => {
    const v = verifyAgainstProperty(extractFields("xx", "seven_twelve"), property, "seven_twelve");
    expect(v.overall).toBe("insufficient_data");
  });
});

describe("OCR debris in extracted values", () => {
  it.each([
    ["Balewadi रा ह", "Balewadi"],
    ["Prabhat Road Ta Co", "Prabhat Road"],
    ["Prashant Jadhav ” \"", "Prashant Jadhav"],
    ["Haveli EE - - \"", "Haveli"],
    ["Talegaon Dabhade", "Talegaon Dabhade"],
    ["Pimpri Chinchwad", "Pimpri Chinchwad"],
    ["राजेश मेहता", "राजेश मेहता"],
  ])("%s → %s", (dirty, clean) => {
    expect(stripOcrJunk(dirty)).toBe(clean);
  });

  it("keeps a real middle initial", () => {
    expect(stripOcrJunk("Rajesh S Mehta")).toBe("Rajesh S Mehta");
  });

  it("extracts clean fields from a noisy scan", () => {
    const r = extractFields(`VILLAGE FORM 7/12\nVillage: Balewadi रा ह\nTaluka: Haveli CL न\nDistrict: Pune : oo\nSurvey No: 169/21D\nKhatedar: Shri Prashant Jadhav ” "\nArea: 1,250 sq ft`, "seven_twelve");
    expect(r.fields).toMatchObject({ village: "Balewadi", taluka: "Haveli", district: "Pune", ownerName: "Prashant Jadhav", surveyNumber: "169/21D" });
  });
});

describe("verifyAgainstProperty — poor scans", () => {
  const property = { surveyNumber: "149/17B", areaSqft: 1250, ownerName: "Prashant Kulkarni", village: "Balewadi" };
  const misread = extractFields("VILLAGE FORM 7/12\nVillage: Balewadi\nSurvey No: 1491\nKhatedar: Shri Prashant Kulkarni\nArea: 1,250 sq ft", "seven_twelve");

  it("accuses a mismatch when the scan is confident", () => {
    const v = verifyAgainstProperty(misread, property, "seven_twelve", 92);
    expect(v.checks.find((c) => c.field === "surveyNumber")?.status).toBe("mismatch");
    expect(v.overall).toBe("discrepancies");
  });

  it("downgrades it to 'can't compare' when the scan is shaky", () => {
    const v = verifyAgainstProperty(misread, property, "seven_twelve", 55);
    const c = v.checks.find((x) => x.field === "surveyNumber")!;
    expect(c.status).toBe("unverifiable");
    expect(c.note).toContain("55%");
    expect(v.overall).toBe("insufficient_data"); // can't call it verified while a field is held back
  });

  it("still reports what a shaky scan did match", () => {
    const v = verifyAgainstProperty(misread, property, "seven_twelve", 55);
    expect(v.checks.find((x) => x.field === "ownerName")?.status).toBe("match");
  });
});
