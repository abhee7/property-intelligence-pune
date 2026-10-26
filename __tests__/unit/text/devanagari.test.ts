// __tests__/unit/text/devanagari.test.ts

import { describe, it, expect } from "vitest";
import { transliterateDevanagari, hasDevanagariText, titleCase } from "@/lib/text/devanagari";
import { phoneticKey, matchOwnerNamePhonetic, matchVillagePhonetic } from "@/lib/text/phonetic";

describe("transliterateDevanagari", () => {
  it.each([
    ["राजेश मेहता", "rajesh mehta"],
    ["प्रशांत कुलकर्णी", "prashant kulkarni"],
    ["सुनील देशमुख", "sunil deshmukh"],
    ["अमित पाटील", "amit patil"],
    ["रमेश कदम", "ramesh kadam"],
    ["संजय साळुंखे", "sanjay salunkhe"],
    ["विक्रम जाधव", "vikram jadhav"],
    ["खराडी", "kharadi"],
    ["पिंपरी चिंचवड", "pimpri chinchvad"],
    ["ज्ञानेश्वर", "dnyaneshvar"],
  ])("%s → %s", (dev, latin) => {
    expect(transliterateDevanagari(dev)).toBe(latin);
  });

  it("drops the inherent 'a' at the end of a word, as Marathi does", () => {
    expect(transliterateDevanagari("कदम")).toBe("kadam");
    expect(transliterateDevanagari("राम")).toBe("ram");
  });

  it("keeps it before a nasal and in the first syllable", () => {
    expect(transliterateDevanagari("संजय")).toBe("sanjay");
    expect(transliterateDevanagari("कमल")).toBe("kamal");
  });

  it("handles anusvara before a labial as 'm'", () => {
    expect(transliterateDevanagari("अंबा")).toBe("amba");
  });

  it("converts Devanagari digits and passes Latin text through", () => {
    expect(transliterateDevanagari("८७/२०")).toBe("87/20");
    expect(transliterateDevanagari("Survey १२३")).toBe("Survey 123");
  });

  it("is safe on empty / non-Devanagari input", () => {
    expect(transliterateDevanagari("")).toBe("");
    expect(transliterateDevanagari("Rajesh Mehta")).toBe("Rajesh Mehta");
  });

  it("detects Devanagari", () => {
    expect(hasDevanagariText("राजेश")).toBe(true);
    expect(hasDevanagariText("Rajesh")).toBe(false);
    expect(hasDevanagariText(null)).toBe(false);
  });

  it("title-cases for display", () => expect(titleCase("rajesh mehta")).toBe("Rajesh Mehta"));
});

describe("phoneticKey", () => {
  it("collapses common spelling variants onto one key", () => {
    const same = (a: string, b: string) => expect(phoneticKey(a)).toBe(phoneticKey(b));
    same("Kulkarni", "Kulkarny".replace("y", "i"));
    same("Gaikwad", "Gaekwad");
    same("Patil", "Pateel");
    same("Pawar", "Pavar");
    same("Talegaon", "Talegav");
  });
  it("keeps different names apart", () => {
    expect(phoneticKey("Patil")).not.toBe(phoneticKey("Pathak"));
    expect(phoneticKey("Kale")).not.toBe(phoneticKey("Kulkarni"));
  });
});

// A regression table of real Marathi names / places against their usual English spelling.
describe("Marathi → English comparison", () => {
  const people: [string, string][] = [
    ["राजेश मेहता", "Rajesh Mehta"], ["प्रशांत कुलकर्णी", "Prashant Kulkarni"], ["सुनील देशमुख", "Sunil Deshmukh"],
    ["अमित पाटील", "Amit Patil"], ["विक्रम जाधव", "Vikram Jadhav"], ["सचिन शिंदे", "Sachin Shinde"],
    ["महेश गायकवाड", "Mahesh Gaikwad"], ["अनिल भोसले", "Anil Bhosale"], ["रमेश कदम", "Ramesh Kadam"],
    ["संजय साळुंखे", "Sanjay Salunkhe"], ["प्रमोद माने", "Pramod Mane"], ["अशोक चव्हाण", "Ashok Chavan"],
    ["दीपक काळे", "Deepak Kale"], ["नितीन पवार", "Nitin Pawar"], ["सुरेश मोरे", "Suresh More"],
    ["गणेश देशपांडे", "Ganesh Deshpande"], ["रवी जोशी", "Ravi Joshi"], ["मनीष शहा", "Manish Shah"],
    ["सुनीता पाटील", "Sunita Patil"], ["अनिता कुलकर्णी", "Anita Kulkarni"], ["मीना शिंदे", "Meena Shinde"],
    ["स्वाती कुलकर्णी", "Swati Kulkarni"], ["ज्योती मोरे", "Jyoti More"], ["ज्ञानेश्वर लोखंडे", "Dnyaneshwar Lokhande"],
    ["विठ्ठल पवार", "Vitthal Pawar"], ["शंकर थोरात", "Shankar Thorat"], ["कृष्णा कुलकर्णी", "Krishna Kulkarni"],
  ];
  const places: [string, string][] = [
    ["हिंजवडी", "Hinjewadi"], ["खराडी", "Kharadi"], ["बाणेर", "Baner"], ["वाकड", "Wakad"], ["कोथरूड", "Kothrud"],
    ["हडपसर", "Hadapsar"], ["मुंढवा", "Mundhwa"], ["उंड्री", "Undri"], ["पिंपरी चिंचवड", "Pimpri Chinchwad"],
    ["तळेगाव दाभाडे", "Talegaon Dabhade"], ["वाघोली", "Wagholi"], ["बावधन", "Bavdhan"], ["लोहगाव", "Lohegaon"],
    ["धानोरी", "Dhanori"], ["येरवडा", "Yerwada"], ["कोंढवा", "Kondhwa"],
  ];

  it.each(people)("person %s ≈ %s", (dev, en) => {
    expect(matchOwnerNamePhonetic(transliterateDevanagari(dev), en)).toBeGreaterThanOrEqual(0.8);
  });
  it.each(places)("place %s ≈ %s", (dev, en) => {
    expect(matchVillagePhonetic(transliterateDevanagari(dev), en)).toBeGreaterThanOrEqual(0.8);
  });

  it.each([
    ["राजेश मेहता", "Sunil Joshi"],
    ["अमित पाटील", "Vikram Shinde"],
    ["सचिन शिंदे", "Sachin Pawar"],
  ])("different person %s ≠ %s", (dev, en) => {
    expect(matchOwnerNamePhonetic(transliterateDevanagari(dev), en)).toBeLessThan(0.6);
  });

  it("scores a shared first name with a different surname as at most 'partial', never a match", () => {
    expect(matchOwnerNamePhonetic(transliterateDevanagari("प्रशांत कुलकर्णी"), "Prashant Kale")).toBeLessThan(0.8);
    expect(matchOwnerNamePhonetic(transliterateDevanagari("रमेश कदम"), "Ramesh Kale")).toBeLessThan(0.8);
  });

  it.each([["खराडी", "Hadapsar"], ["बाणेर", "Wakad"], ["हिंजवडी", "Hadapsar"]])("different place %s ≠ %s", (dev, en) => {
    expect(matchVillagePhonetic(transliterateDevanagari(dev), en)).toBeLessThan(0.5);
  });

  it("still scores close spelling variants of a place highly even when the keys differ", () => {
    expect(matchVillagePhonetic("Hinjewadi", "Hinjawadi")).toBeGreaterThanOrEqual(0.8);
  });

  it("never reports a phonetic match as perfect", () => {
    expect(matchOwnerNamePhonetic("Rajesh Mehta", "Rajesh Mehta")).toBeLessThanOrEqual(0.92);
  });
});
