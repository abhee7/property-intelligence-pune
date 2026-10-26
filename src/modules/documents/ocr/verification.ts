// src/modules/documents/ocr/verification.ts
//
// Pure comparison of OCR-extracted fields against what the property record says.

import { matchSurveyNumber, matchOwnerName, matchVillage, matchArea } from "@/modules/matching/matching.algorithms";
import { transliterateDevanagari, hasDevanagariText, titleCase } from "@/lib/text/devanagari";
import { matchOwnerNamePhonetic, matchVillagePhonetic } from "@/lib/text/phonetic";
import { hasDevanagari, type DocumentKind, type ExtractionResult } from "./field-extractor";
import type { TransliterationMap, TransliterationNeed } from "./transliteration";

export type CheckStatus = "match" | "partial" | "mismatch" | "unverifiable" | "missing";

export interface FieldCheck {
  field: string;
  label: string;
  extracted: string | number | null;
  recorded: string | number | null;
  score: number | null;
  status: CheckStatus;
  note?: string;
  /** set when a Marathi value was compared with an English one through transliteration */
  transliteration?: { spellings: string[]; engine: "rules" | "claude" };
}

export interface VerificationResult {
  checks: FieldCheck[];
  overall: "verified" | "discrepancies" | "insufficient_data";
  kindMismatch?: { uploadedAs: DocumentKind; looksLike: DocumentKind };
  /** Other properties whose survey number matches this document better than its own property does. */
  possibleOtherProperties?: { id: string; title: string; surveyNumber: string | null; score: number }[];
}

export interface PropertyFacts {
  surveyNumber: string | null;
  areaSqft: number | null;
  ownerName: string | null;
  village: string | null;
}

function statusFromScore(score: number): CheckStatus {
  if (score >= 0.8) return "match";
  if (score >= 0.5) return "partial";
  return "mismatch";
}

type FieldKind = "person" | "place" | "identifier" | "number";

interface CompareOptions {
  kind: FieldKind;
  /** Claude's English spellings for Devanagari strings (keyed by the Devanagari text) */
  claude?: TransliterationMap;
}

/** Every English spelling we can offer for a value, and whether Claude contributed any. */
function latinCandidates(value: string, claude?: TransliterationMap): { spellings: string[]; viaClaude: boolean } {
  if (!hasDevanagariText(value)) return { spellings: [value], viaClaude: false };
  const rule = transliterateDevanagari(value);
  const fromClaude = (claude?.[value.replace(/s+/g, " ").trim()] ?? []).filter(Boolean);
  return { spellings: [...new Set([rule, ...fromClaude])], viaClaude: fromClaude.length > 0 };
}

/**
 * Marathi vs English (or two differently-spelled Marathi values). A rule-based transliteration is
 * a decent guess, but a low score from it alone proves nothing — "unverifiable". Once Claude has
 * supplied real-world spellings a low score is a genuine mismatch.
 */
function compareAcrossScripts(
  base: Omit<FieldCheck, "score" | "status">,
  ex: string,
  rec: string,
  opts: CompareOptions,
): FieldCheck {
  // survey numbers: only the digits/letters need converting, so the normal (exact) rules apply
  if (opts.kind === "identifier") {
    const score = matchSurveyNumber(transliterateDevanagari(ex), transliterateDevanagari(rec));
    return { ...base, score: Math.round(score * 100) / 100, status: statusFromScore(score), note: "Marathi digits converted before comparing" };
  }

  const phonetic = opts.kind === "place" ? matchVillagePhonetic : matchOwnerNamePhonetic;
  const a = latinCandidates(ex, opts.claude);
  const b = latinCandidates(rec, opts.claude);

  let best = 0;
  let bestSpelling = a.spellings[0];
  for (const x of a.spellings) {
    for (const y of b.spellings) {
      const sc = phonetic(x, y);
      if (sc > best) {
        best = sc;
        bestSpelling = hasDevanagariText(ex) ? x : y;
      }
    }
  }
  const viaClaude = a.viaClaude || b.viaClaude;
  // show how the Marathi side was read (not the record's own spelling), without duplicates differing only in case
  const marathiSide = [...(hasDevanagariText(ex) ? a.spellings : []), ...(hasDevanagariText(rec) ? b.spellings : [])];
  const seen = new Set<string>();
  const shown = marathiSide.map(titleCase).filter((x) => !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase())).slice(0, 5);
  const transliteration = { spellings: shown, engine: viaClaude ? ("claude" as const) : ("rules" as const) };
  const score = Math.round(best * 100) / 100;
  const read = `read as "${titleCase(bestSpelling)}"`;

  if (best >= 0.8) return { ...base, score, status: "match", note: `Marathi ${read}`, transliteration };
  if (best >= 0.5) return { ...base, score, status: "partial", note: `Marathi ${read} — only a partial match`, transliteration };
  if (viaClaude) return { ...base, score, status: "mismatch", note: `Marathi ${read} — doesn't match the record`, transliteration };
  return {
    ...base,
    score: null,
    status: "unverifiable",
    note: `Marathi ${read} doesn't match the record, but a rule-based reading can't rule out a different spelling — verify manually`,
    transliteration,
  };
}

function compare(
  field: string,
  label: string,
  extracted: string | number | undefined,
  recorded: string | number | null | undefined,
  scorer: (a: any, b: any) => number,
  opts: CompareOptions = { kind: "number" },
): FieldCheck {
  const ex = extracted ?? null;
  const rec = recorded ?? null;

  if (ex === null) return { field, label, extracted: null, recorded: rec, score: null, status: "missing", note: "Not found in document" };
  if (rec === null || rec === "") return { field, label, extracted: ex, recorded: null, score: null, status: "unverifiable", note: "No value on the property record" };

  // Marathi on one side, English on the other (or both Marathi but spelled differently)
  if (typeof ex === "string" && typeof rec === "string" && opts.kind !== "number") {
    const exDev = hasDevanagari(ex);
    const recDev = hasDevanagari(rec);
    if (exDev || recDev) {
      // the Latin-script scorers can't read Devanagari, so identical text is settled here
      if (ex.replace(/\s+/g, " ").trim() === rec.replace(/\s+/g, " ").trim()) return { field, label, extracted: ex, recorded: rec, score: 1, status: "match" };
      return compareAcrossScripts({ field, label, extracted: ex, recorded: rec }, ex, rec, opts);
    }
  }

  const score = scorer(ex, rec);
  return { field, label, extracted: ex, recorded: rec, score: Math.round(score * 100) / 100, status: statusFromScore(score) };
}

/**
 * Which Marathi strings would benefit from a Claude transliteration before verifying?
 * (Owner and village only — survey numbers just need their digits converted.)
 */
export function transliterationNeeds(extraction: ExtractionResult, property: PropertyFacts): TransliterationNeed[] {
  const needs: TransliterationNeed[] = [];
  const consider = (a: string | undefined | null, b: string | undefined | null, kind: TransliterationNeed["kind"]) => {
    if (!a || !b || a.trim() === b.trim()) return;
    if (hasDevanagariText(a) === hasDevanagariText(b) && !hasDevanagariText(a)) return;
    for (const v of [a, b]) if (hasDevanagariText(v)) needs.push({ source: v, kind });
  };
  consider(extraction.fields.ownerName, property.ownerName, "person");
  consider(extraction.fields.village, property.village, "place");
  return needs;
}

/** Below this OCR confidence a scan is too shaky to accuse a property of a mismatch. */
export const MIN_TRUSTED_CONFIDENCE = 65;

export function verifyAgainstProperty(
  extraction: ExtractionResult,
  property: PropertyFacts,
  uploadedKind: DocumentKind,
  scanConfidence?: number,
  /** Claude's English spellings for Marathi values (optional — rule-based transliteration is always applied) */
  claudeSpellings?: TransliterationMap,
): VerificationResult {
  const f = extraction.fields;

  let checks: FieldCheck[] = [
    compare("surveyNumber", "Survey number", f.surveyNumber, property.surveyNumber, matchSurveyNumber, { kind: "identifier" }),
    compare("ownerName", "Owner name", f.ownerName, property.ownerName, matchOwnerName, { kind: "person", claude: claudeSpellings }),
    compare("village", "Village", f.village, property.village, matchVillage, { kind: "place", claude: claudeSpellings }),
    compare("areaSqft", "Area (sq ft)", f.areaSqft, property.areaSqft, (a, b) => matchArea(a, b, 5)),
  ];

  // A poor scan can misread a digit or drop a slash. Don't let that count as a mismatch —
  // the document is already flagged for manual review, which is the honest outcome.
  let heldBack = 0;
  if (scanConfidence !== undefined && scanConfidence < MIN_TRUSTED_CONFIDENCE) {
    checks = checks.map((c) => {
      if (c.status !== "mismatch" && c.status !== "partial") return c;
      heldBack++;
      return { ...c, status: "unverifiable" as const, score: null, note: `Scan quality too low (${Math.round(scanConfidence)}%) to trust this field — verify manually` };
    });
  }

  const compared = checks.filter((c) => c.score !== null);

  let overall: VerificationResult["overall"];
  // fields held back for scan quality mean we can't call the document verified, even if the rest agree
  if (compared.length === 0 || (heldBack > 0 && !compared.some((c) => c.status === "mismatch" || c.status === "partial"))) overall = "insufficient_data";
  else overall = compared.some((c) => c.status === "mismatch" || c.status === "partial") ? "discrepancies" : "verified";

  const result: VerificationResult = { checks, overall };

  // Is this document what the user said it is?
  if (
    uploadedKind !== "unknown" &&
    extraction.detectedKind !== "unknown" &&
    extraction.kindScore >= 0.5 &&
    extraction.detectedKind !== uploadedKind
  ) {
    result.kindMismatch = { uploadedAs: uploadedKind, looksLike: extraction.detectedKind };
  }
  return result;
}
