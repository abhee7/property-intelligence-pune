// Government "digital satbara" 7/12 (गाव नमुना सात): the layout, the scrambled text layer, the
// hectare.are.sq-metre area. Everything here is invented text in the same layout — no real record.

import { describe, it, expect } from "vitest";
import {
  classifyDocument,
  extractFields,
  extractOccupants,
  parseHaAreSqm,
} from "@/modules/documents/ocr/field-extractor";
import { readSevenTwelveNumerals } from "@/modules/documents/ocr/layer-numerals";
import { isTextLayerUsable } from "@/modules/documents/ocr/ocr.engine";
import { verifyAgainstProperty } from "@/modules/documents/ocr/verification";

/** OCR output shaped like a real page: name rows with bracketed mutation numbers, column titles beside them. */
const SAMPLE = `महाराट्र शासन .
गाव नमुना सात (अधिकार अभिलेख पत्रक) oa
[महाराष्ट्र जमीन महसुल अधिकार अभिलेख आणि नोंदवह्या (तयार करणे व सुस्थितीत ठेवणे) नियम १९७१ यातील नियम ३,५,६ आणि ७]
गाव :- खडकवाडी (५६५६६६) तालुका :- हवेली जिल्हा :- पुणे i es ]
PU-ID : 10000000001 भूमापन क्रमांक व उपविभाग २३३/१२ 10000000001
क्षेत्राचे एकक हे.आर.चौ.मी| ६२० रमेश सुरेश पाटील (७६७१) [कुळाचे नाव व खंड
ee — सविता रमेश पाटील (८४५२) |
अ) लागवड योग्य क्षेत्र अनिल दत्तात्रय जाधव (८४५२) [sR अधिकार
जिरायत. ०.००.८० विजय मारुती शिंदे (८४५३) [ताग काशिराम हरी पाटील (७५५)
ला.यो. क्षेत्र ०.०१.७० प्रणाली प्रकाश गायकवाड (८४५३) प्रलंबित फेरफार : नाही.
एकुण
पो.ख क्षेत्र ०.००.३०
एकुण क्षेत्र ०.०२.००
आकारणी ०.०२
हा गाव नमुना क्रमांक ७ दिनांक १९/०३/२०२० रोजी डिजिटल स्वाक्षरीत केला आहे व गाव नमुना क्रमांक १२ चा डेटा स्वयंप्रमाणित असल्यामुळे ७/१२ अभिलेखावर
भप भी | 19/93 डाउनलोड दि.

गाव नमुना बारा (पिकांची नोंदवही)
गाव :- खडकवाडी (५६५६६६) तालुका :- हवेली जिल्हा:- पुणे`;

describe("gaon namuna 7 — classification", () => {
  it("is recognised by its printed title, even though the body mentions 'फेरफार' (mutation)", () => {
    expect(classifyDocument(SAMPLE)).toEqual({ kind: "seven_twelve", score: 1 });
  });
});

describe("gaon namuna 7 — area in hectare.are.sq-metre", () => {
  it("reads 0.02.30 as 230 m²", () => {
    expect(parseHaAreSqm("0.02.30")).toBe(230);
    expect(parseHaAreSqm("1.00.05")).toBe(10005);
    expect(parseHaAreSqm("0.00.00")).toBeNull();
    expect(parseHaAreSqm("12.5")).toBeNull();
  });

  it("takes the grand total beside 'एकुण क्षेत्र', not the cultivable or pot-kharab figures", () => {
    const r = extractFields(SAMPLE);
    expect(r.fields.areaSqft).toBeCloseTo(200 * 10.7639, 1);
    expect(r.fields.areaText).toContain("0.02.00");
  });
});

describe("gaon namuna 7 — fields", () => {
  const r = extractFields(SAMPLE);

  it("reads survey number and subdivision from 'भूमापन क्रमांक व उपविभाग'", () => {
    expect(r.fields.surveyNumber).toBe("233/12");
  });

  it("splits village, taluka and district that share one line", () => {
    expect(r.fields.village).toBe("खडकवाडी");
    expect(r.fields.taluka).toBe("हवेली");
    expect(r.fields.district).toBe("पुणे"); // despite trailing speckle ("i es ]")
  });

  it("lists every occupant, one per row", () => {
    expect(r.fields.ownerNames).toEqual([
      "रमेश सुरेश पाटील",
      "सविता रमेश पाटील",
      "अनिल दत्तात्रय जाधव",
      "विजय मारुती शिंदे",
      "प्रणाली प्रकाश गायकवाड",
    ]);
    expect(r.fields.ownerName).toBe("रमेश सुरेश पाटील");
  });

  it("does not take the other-rights holder in the right-hand column for an occupant", () => {
    expect(r.fields.ownerNames).not.toContain("ताग काशिराम हरी पाटील");
  });

  it("does not take column titles or the certificate footer for people", () => {
    const names = extractOccupants(SAMPLE).join(" ");
    expect(names).not.toMatch(/स्वयंप्रमाणित|अभिलेखावर|क्षेत्र|खराब|आकारणी/);
  });

  describe("scan noise on the name rows", () => {
    const page = (rows: string[]) => `गाव नमुना सात (अधिकार अभिलेख पत्रक)\n${rows.join("\n")}\nगाव नमुना बारा (पिकांची नोंदवही)`;

    it("still reads a name whose mutation number was garbled by the scan", () => {
      const names = extractOccupants(page(["प -— सविता रमेश पाटील (RY4¢Y) पक्त", "अनिता अनंत जाधव [TA ------- वव"]));
      expect(names).toEqual(["सविता रमेश पाटील", "अनिता अनंत जाधव"]);
    });

    it("drops stray accent marks inside a word", () => {
      expect(extractOccupants(page(["[रमेश सुरेश पाटी॒ल 1 (9584)"]))).toEqual(["रमेश सुरेश पाटील"]);
    });

    it("corrects a surname that is one character off a surname seen twice on the same page", () => {
      const names = extractOccupants(
        page(["रमेश सुरेश गायकवाड (7531)", "सविता रमेश गायकवाड (7531)", "अनिल दत्तात्रय गायकवाळ (9584)"]),
      );
      expect(names[2]).toBe("अनिल दत्तात्रय गायकवाड");
    });

    it("leaves a different surname alone when it is not a repeated one", () => {
      const names = extractOccupants(page(["रमेश सुरेश पाटील (7531)", "अंकुश लुका जाधव (7531)"]));
      expect(names).toEqual(["रमेश सुरेश पाटील", "अंकुश लुका जाधव"]);
    });
  });

  it("finds nothing on documents that are not a gaon namuna 7", () => {
    expect(extractOccupants("Sale deed between Shri Ramesh Patil (7671) and Savita Patil")).toEqual([]);
  });
});

describe("gaon namuna 7 — scrambled PDF text layer", () => {
  it("flags the unmapped-font gibberish a real download produces", () => {
    // letters from IPA/Latin-Extended blocks and control characters, but exact digits
    const garbled = "ɗʰɔɳʲ\u0003ɱʏɖɛʼ ʒɤɸʌ\u0007ɭɧ 233/12 ʑɞɣɨɠ\u0001ʆ ɳɵʧ 0.02.00 ʡɷɻʂɮɑ ʓʖɐɯ ɩɬɲʃ\u0002ʁɦ ʅʊɰ";
    expect(isTextLayerUsable(garbled)).toBe(false);
  });

  it("accepts ordinary English and real Devanagari text", () => {
    expect(isTextLayerUsable("Sale deed executed between the vendor and the purchaser for survey number 45 at Baner Pune")).toBe(true);
    expect(isTextLayerUsable("गाव नमुना सात अधिकार अभिलेख पत्रक भोगवटादाराचे नाव क्षेत्र आकारणी")).toBe(true);
  });

  it("recovers survey number, khate numbers, total area and assessment by position", () => {
    const item = (str: string, x: number, y: number) => ({ str, x, y });
    const items = [
      item("233/12", 201, 137),
      item("10000000001", 53, 136), // the PU-ID: long, not a khate
      item("620", 96, 195),
      item("( 7671 )", 397, 195),
      item("0.01.70", 54, 241), // cultivable
      item("0.00.30", 54, 348), // pot-kharab
      item("0.02.00", 54, 424), // grand total
      item("0.02", 54, 470), // assessment
      item("3206100001315826", 454, 755), // footer verification number
      item("16/93", 560, 760), // page counter in the footer
    ];
    const out = readSevenTwelveNumerals(items, 615, 792);
    expect(out).toContain("भूमापन क्रमांक व उपविभाग: 233/12");
    expect(out).toContain("खाते क्रमांक: 620");
    expect(out).toContain("एकुण क्षेत्र हे.आर.चौ.मी: 0.02.00");
    expect(out).toContain("आकारणी: 0.02");
  });

  it("says nothing when the page is not the first page of a 7/12", () => {
    expect(readSevenTwelveNumerals([{ str: "Page 2 of 2", x: 10, y: 10 }], 615, 792)).toBe("");
  });

  it("the recovered lines are read back correctly by the field extractor", () => {
    const layer = "भूमापन क्रमांक व उपविभाग: 233/12\nखाते क्रमांक: 620, 1337\nएकुण क्षेत्र हे.आर.चौ.मी: 0.21.80\nआकारणी: 0.30";
    // OCR misread the survey number ("33/99"); the numerals taken from the layer come first and win
    const r = extractFields(layer + "\n" + SAMPLE.replace("२३३/१२", "33/99").replace("०.०२.००", "०.०२.०"));
    expect(r.fields.surveyNumber).toBe("233/12");
    expect(r.fields.khateNumbers).toEqual(["620", "1337"]);
    expect(r.fields.areaSqft).toBeCloseTo(2180 * 10.7639, 0);
  });
});

describe("gaon namuna 7 — verification against the property record", () => {
  const extraction = extractFields(SAMPLE);

  it("passes the owner check when the owner on record is any one of the listed occupants", () => {
    const r = verifyAgainstProperty(
      extraction,
      { surveyNumber: "233/12", areaSqft: 200 * 10.7639, ownerName: "प्रणाली प्रकाश गायकवाड", village: "खडकवाडी" },
      "seven_twelve",
    );
    expect(r.checks.find((c) => c.field === "ownerName")?.status).toBe("match");
    expect(r.overall).toBe("verified");
  });

  it("still flags an owner who is not among the occupants", () => {
    const r = verifyAgainstProperty(
      extraction,
      { surveyNumber: "233/12", areaSqft: 200 * 10.7639, ownerName: "कुणाल भास्कर देशमुख", village: "खडकवाडी" },
      "seven_twelve",
    );
    expect(r.checks.find((c) => c.field === "ownerName")?.status).not.toBe("match");
  });
});
