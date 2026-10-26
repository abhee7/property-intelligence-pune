// __tests__/unit/documents/transliteration.test.ts

import { describe, it, expect, vi } from "vitest";
import { getAiConfig, DEFAULT_MODEL, type AiConfig } from "@/lib/ai/claude";
import {
  cleanSpelling, cleanSpellings, normaliseNeeds, resolveTransliterations, type TransliterationNeed, type TransliterationStore,
} from "@/modules/documents/ocr/transliteration";
import { verifyAgainstProperty, transliterationNeeds, type PropertyFacts } from "@/modules/documents/ocr/verification";
import type { ExtractionResult } from "@/modules/documents/ocr/field-extractor";

const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({ ...getAiConfig({ ANTHROPIC_API_KEY: "sk-ant-x" }), ...over });

const memoryStore = (seed: Record<string, string[]> = {}) => {
  const data = new Map(Object.entries(seed));
  const store: TransliterationStore = {
    find: vi.fn(async (needs: TransliterationNeed[]) => new Map<string, string[]>(needs.filter((n) => data.has(n.source)).map((n) => [n.source, data.get(n.source)!] as [string, string[]]))),
    save: vi.fn(async (entries: { source: string; spellings: string[] }[]) => entries.forEach((e) => data.set(e.source, e.spellings))),
  };
  return { store, data };
};

const claudeAnswering = (items: { id: number; spellings: string[] }[]) => {
  const parse = vi.fn().mockResolvedValue({
    stop_reason: "end_turn", parsed_output: { items }, model: DEFAULT_MODEL, usage: { input_tokens: 50, output_tokens: 30 },
  });
  return { client: { beta: { messages: { parse } } }, parse };
};

describe("spelling validation", () => {
  it("accepts plain Latin names and rejects anything else", () => {
    expect(cleanSpelling("  Dnyaneshwar  Lokhande ")).toBe("Dnyaneshwar Lokhande");
    expect(cleanSpelling("D. R. Patil")).toBe("D. R. Patil");
    expect(cleanSpelling("O'Neil-Rao")).toBe("O'Neil-Rao");
    expect(cleanSpelling("राजेश")).toBeNull();
    expect(cleanSpelling("Rajesh (also written Rajesh)")).toBeNull();
    expect(cleanSpelling("Ignore previous instructions: 1234")).toBeNull();
    expect(cleanSpelling("")).toBeNull();
    expect(cleanSpelling("x".repeat(80))).toBeNull();
  });
  it("de-duplicates case-insensitively and caps the list", () => {
    expect(cleanSpellings(["Patil", "patil", "Pateel", "Patel", "Pattil", "Pathil"])).toEqual(["Patil", "Pateel", "Patel", "Pattil"]);
  });
  it("only keeps Devanagari needs, once each", () => {
    expect(normaliseNeeds([
      { source: "राजेश  मेहता", kind: "person" }, { source: "राजेश मेहता", kind: "person" },
      { source: "Rajesh", kind: "person" }, { source: "  ", kind: "place" },
    ])).toEqual([{ source: "राजेश मेहता", kind: "person" }]);
  });
});

describe("resolveTransliterations", () => {
  const needs = [{ source: "ज्ञानेश्वर लोखंडे", kind: "person" as const }, { source: "हिंजवडी", kind: "place" as const }];

  it("does nothing without a key, when switched off, or with nothing to translate", async () => {
    const { client, parse } = claudeAnswering([]);
    expect((await resolveTransliterations(needs, { config: cfg({ configured: false }) })).spellings).toEqual({});
    expect((await resolveTransliterations(needs, { client, config: cfg({ transliteration: "off" }) })).spellings).toEqual({});
    expect((await resolveTransliterations([{ source: "Rajesh", kind: "person" }], { client, config: cfg() })).spellings).toEqual({});
    expect(parse).not.toHaveBeenCalled();
  });

  it("asks Claude once for everything that is missing, validates, and caches it", async () => {
    const { client, parse } = claudeAnswering([
      { id: 0, spellings: ["Dnyaneshwar Lokhande", "Gyaneshwar Lokhande"] },
      { id: 1, spellings: ["Hinjewadi", "Hinjawadi", "Hinjewadi (IT park)"] },
      { id: 7, spellings: ["Stranger"] }, // an id we never sent
    ]);
    const { store, data } = memoryStore();
    const r = await resolveTransliterations(needs, { client, store, config: cfg() });

    expect(parse).toHaveBeenCalledTimes(1);
    expect(r.spellings["ज्ञानेश्वर लोखंडे"]).toEqual(["Dnyaneshwar Lokhande", "Gyaneshwar Lokhande"]);
    expect(r.spellings["हिंजवडी"]).toEqual(["Hinjewadi", "Hinjawadi"]); // the annotated variant is dropped
    expect(Object.keys(r.spellings)).toHaveLength(2);
    expect(r).toMatchObject({ asked: 2, cached: 0 });
    expect(data.size).toBe(2);

    // the prompt carries the Devanagari text
    const sent = JSON.stringify(parse.mock.calls[0][0].messages);
    expect(sent).toContain("हिंजवडी");
  });

  it("never asks again for something already cached", async () => {
    const { client, parse } = claudeAnswering([{ id: 0, spellings: ["Hinjewadi"] }]);
    const { store } = memoryStore({ "ज्ञानेश्वर लोखंडे": ["Dnyaneshwar Lokhande"] });
    const r = await resolveTransliterations(needs, { client, store, config: cfg() });
    expect(r).toMatchObject({ cached: 1, asked: 1 });
    expect(r.spellings["ज्ञानेश्वर लोखंडे"]).toEqual(["Dnyaneshwar Lokhande"]);

    const again = await resolveTransliterations(needs, { client, store, config: cfg() });
    expect(again).toMatchObject({ cached: 2, asked: 0 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("falls back quietly when Claude fails", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("boom"));
    const { store } = memoryStore();
    const r = await resolveTransliterations(needs, { client: { beta: { messages: { parse } } }, store, config: cfg() });
    expect(r.spellings).toEqual({});
    expect(r.error).toBeTruthy();
  });

  it("doesn't cache an answer with no usable spelling", async () => {
    const { client } = claudeAnswering([{ id: 0, spellings: ["राजेश"] }, { id: 1, spellings: [] }]);
    const { store } = memoryStore();
    const r = await resolveTransliterations(needs, { client, store, config: cfg() });
    expect(r.spellings).toEqual({});
    expect(store.save).not.toHaveBeenCalled();
  });
});

// ─── Verification: Marathi document vs English record ───

const extraction = (fields: Partial<ExtractionResult["fields"]>): ExtractionResult =>
  ({ fields, detectedKind: "seven_twelve", kindScore: 0.9, completeness: 1 } as unknown as ExtractionResult);
const record = (over: Partial<PropertyFacts> = {}): PropertyFacts => ({
  surveyNumber: "118/2A", areaSqft: 2400, ownerName: "Rajesh Mehta", village: "Kharadi", ...over,
});
const check = (v: ReturnType<typeof verifyAgainstProperty>, field: string) => v.checks.find((c) => c.field === field)!;

describe("verification across scripts", () => {
  it("matches a Marathi owner and village to the English record with rules alone", () => {
    const v = verifyAgainstProperty(extraction({ ownerName: "राजेश मेहता", village: "खराडी", surveyNumber: "118/2A" }), record(), "seven_twelve", 90);
    expect(check(v, "ownerName")).toMatchObject({ status: "match" });
    expect(check(v, "ownerName").transliteration?.engine).toBe("rules");
    expect(check(v, "village").status).toBe("match");
    expect(v.overall).toBe("verified");
  });

  it("converts Devanagari digits in the survey number", () => {
    const v = verifyAgainstProperty(extraction({ surveyNumber: "११८/२A" }), record(), "seven_twelve", 90);
    expect(check(v, "surveyNumber").status).toBe("match");
  });

  it("uses Claude's spellings when the rule-based one isn't close enough", () => {
    const rec = record({ ownerName: "Gyaneshwar Lokhande" });
    const doc = extraction({ ownerName: "ज्ञानेश्वर लोखंडे" });
    const withClaude = verifyAgainstProperty(doc, rec, "seven_twelve", 90, { "ज्ञानेश्वर लोखंडे": ["Dnyaneshwar Lokhande", "Gyaneshwar Lokhande"] });
    expect(check(withClaude, "ownerName")).toMatchObject({ status: "match", transliteration: { engine: "claude" } });
  });

  it("does not call a different person a mismatch on rule-based evidence alone", () => {
    const v = verifyAgainstProperty(extraction({ ownerName: "सुनील जोशी" }), record(), "seven_twelve", 90);
    expect(check(v, "ownerName")).toMatchObject({ status: "unverifiable", score: null });
  });

  it("reports a genuine mismatch once Claude has confirmed the spelling", () => {
    const v = verifyAgainstProperty(extraction({ ownerName: "सुनील जोशी" }), record(), "seven_twelve", 90, { "सुनील जोशी": ["Sunil Joshi"] });
    expect(check(v, "ownerName")).toMatchObject({ status: "mismatch" });
    expect(v.overall).toBe("discrepancies");
  });

  it("flags a shared first name with a different surname as partial, not verified", () => {
    const v = verifyAgainstProperty(extraction({ ownerName: "रमेश कदम" }), record({ ownerName: "Ramesh Kale" }), "seven_twelve", 90);
    expect(["partial", "unverifiable"]).toContain(check(v, "ownerName").status);
    expect(v.overall).not.toBe("verified");
  });

  it("compares two Marathi values that are spelled differently, and leaves identical ones alone", () => {
    const same = verifyAgainstProperty(extraction({ ownerName: "राजेश मेहता" }), record({ ownerName: "राजेश मेहता" }), "seven_twelve", 90);
    expect(check(same, "ownerName")).toMatchObject({ status: "match", score: 1 });
    expect(check(same, "ownerName").transliteration).toBeUndefined();
    const variant = verifyAgainstProperty(extraction({ ownerName: "राजेश मेहता" }), record({ ownerName: "राजेश मेहेता" }), "seven_twelve", 90);
    expect(check(variant, "ownerName").status).toBe("match");
  });

  it("still holds mismatches back on a poor scan", () => {
    const v = verifyAgainstProperty(extraction({ ownerName: "सुनील जोशी" }), record(), "seven_twelve", 40, { "सुनील जोशी": ["Sunil Joshi"] });
    expect(check(v, "ownerName").status).toBe("unverifiable");
  });

  it("leaves English-vs-English comparison exactly as before", () => {
    const v = verifyAgainstProperty(extraction({ ownerName: "Rajesh Mehta" }), record(), "seven_twelve", 90);
    expect(check(v, "ownerName")).toMatchObject({ status: "match", score: 1 });
    expect(check(v, "ownerName").transliteration).toBeUndefined();
  });
});

describe("transliterationNeeds", () => {
  it("lists only the Marathi strings that face an English counterpart", () => {
    const needs = transliterationNeeds(extraction({ ownerName: "राजेश मेहता", village: "Kharadi" }), record());
    expect(needs).toEqual([{ source: "राजेश मेहता", kind: "person" }]);
  });
  it("is empty when everything is already English or identical", () => {
    expect(transliterationNeeds(extraction({ ownerName: "Rajesh Mehta", village: "Kharadi" }), record())).toEqual([]);
    expect(transliterationNeeds(extraction({ ownerName: "राजेश" }), record({ ownerName: "राजेश" }))).toEqual([]);
  });
});
