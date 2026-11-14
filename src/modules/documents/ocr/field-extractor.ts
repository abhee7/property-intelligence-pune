// src/modules/documents/ocr/field-extractor.ts
//
// Pure functions — raw OCR text in, structured land-record fields out.
// Handles English and Marathi (Devanagari) labels as found on Maharashtra
// 7/12 extracts, sale deeds, title deeds, tax receipts and encumbrance certs.

// ─── Types ───

export type DocumentKind =
  | "seven_twelve"
  | "title_deed"
  | "sale_deed"
  | "encumbrance"
  | "tax_receipt"
  | "mutation"
  | "unknown";

export interface ExtractedFields {
  surveyNumber?: string;
  ownerName?: string;
  /** Every occupant listed on a gaon namuna 7 (one khate often has ten or more); ownerName is the first */
  ownerNames?: string[];
  /** Khate (account) numbers listed on a gaon namuna 7 */
  khateNumbers?: string[];
  buyerName?: string;
  village?: string;
  taluka?: string;
  district?: string;
  areaSqft?: number;
  areaText?: string;
  documentDate?: string; // ISO yyyy-mm-dd
  registrationNumber?: string;
  amount?: number;
}

export interface ExtractionResult {
  kind: DocumentKind; // the type we processed it as (uploaded type, else detected)
  detectedKind: DocumentKind; // what the text itself looks like
  kindScore: number; // 0..1 — how strongly the text looks like `detectedKind`
  fields: ExtractedFields;
  evidence: Record<string, string>; // field → the text snippet it came from
  expected: string[]; // fields we expect for this kind of document
  found: string[]; // expected fields that were actually found
  completeness: number; // found / expected, 0..1
}

// ─── Text normalisation ───

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function normalizeDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

export function hasDevanagari(text: string | null | undefined): boolean {
  return !!text && /[ऀ-ॿ]/.test(text);
}

export function cleanOcrText(raw: string): string {
  return normalizeDigits(raw)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[|¦]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Document classification ───

const KIND_KEYWORDS: Record<Exclude<DocumentKind, "unknown">, RegExp[]> = {
  seven_twelve: [/7\s*\/\s*12/, /सात\s*बारा/, /७\s*\/\s*१२/, /भोगवटादार/, /भूमी\s*अभिलेख/, /village form/i, /record of rights/i, /उतारा/],
  sale_deed: [/sale deed/i, /deed of sale/i, /खरेदी\s*खत/, /vendor/i, /vendee/i, /purchaser/i, /conveyance/i],
  title_deed: [/title deed/i, /deed of (?:title|gift|conveyance)/i, /absolute owner/i, /हक्क/],
  encumbrance: [/encumbrance/i, /भार\s*प्रमाणपत्र/, /nil encumbrance/i, /बोजा/],
  tax_receipt: [/property tax/i, /tax receipt/i, /municipal/i, /मिळकत\s*कर/, /assessment (?:no|number)/i, /ward/i],
  mutation: [/mutation/i, /फेरफार/, /ferfar/i],
};

/** The government's printed form title: "गाव नमुना सात (अधिकार अभिलेख पत्रक)". */
const GAON_NAMUNA_SAT = /गाव\s*नमुना\s*सात|अधिकार\s*अभिलेख\s*पत्रक/;

export function classifyDocument(text: string): { kind: DocumentKind; score: number } {
  // The form's own title is conclusive. (Its body says "फेरफार" for pending mutations, which
  // would otherwise make a 7/12 read as a mutation.)
  if (GAON_NAMUNA_SAT.test(text)) return { kind: "seven_twelve", score: 1 };
  let best: DocumentKind = "unknown";
  let bestScore = 0;
  for (const [kind, patterns] of Object.entries(KIND_KEYWORDS)) {
    const hits = patterns.filter((p) => p.test(text)).length;
    const score = hits / Math.min(patterns.length, 3);
    if (score > bestScore) {
      bestScore = score;
      best = kind as DocumentKind;
    }
  }
  return { kind: bestScore > 0 ? best : "unknown", score: Math.min(1, bestScore) };
}

/** Maps a DocumentType.slug from the database to a DocumentKind. */
export function kindFromSlug(slug: string | null | undefined): DocumentKind {
  const s = (slug || "").toLowerCase();
  if (s.includes("7-12") || s.includes("712")) return "seven_twelve";
  if (s.includes("sale")) return "sale_deed";
  if (s.includes("title")) return "title_deed";
  if (s.includes("encumbrance")) return "encumbrance";
  if (s.includes("tax")) return "tax_receipt";
  if (s.includes("mutation")) return "mutation";
  return "unknown";
}

const EXPECTED_FIELDS: Record<DocumentKind, (keyof ExtractedFields)[]> = {
  seven_twelve: ["surveyNumber", "ownerName", "village", "areaSqft"],
  title_deed: ["ownerName", "surveyNumber", "village", "documentDate"],
  sale_deed: ["ownerName", "buyerName", "surveyNumber", "documentDate", "amount"],
  encumbrance: ["surveyNumber", "village", "documentDate"],
  tax_receipt: ["ownerName", "amount", "documentDate"],
  mutation: ["surveyNumber", "village", "ownerName"],
  unknown: ["surveyNumber", "ownerName", "village"],
};

// ─── Helpers ───

function firstMatch(text: string, patterns: RegExp[]): { value: string; snippet: string } | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && m[1] && m[1].trim()) return { value: m[1].trim(), snippet: m[0].trim().slice(0, 120) };
  }
  return null;
}

const TITLE_PREFIX = /^(?:shri|shree|sri|smt|mr|mrs|ms|dr|prof|श्री|श्रीमती|सौ|कु)\.?\s+/i;

function cleanName(raw: string): string {
  let v = raw
    .split(/[,;\n(]|\s{2,}|\bs\/o\b|\bd\/o\b|\bw\/o\b|\bage\b|\bआयु\b|\brs\b|\bresiding\b|\bR\/o\b/i)[0]
    .replace(/[0-9_=*#@<>~^]/g, " ")
    .replace(/\.(?=\s|$)/g, " ") // "Rajesh. Mehta" / "R. Mehta" → words only
    .replace(/\s+/g, " ")
    .trim();
  v = stripOcrJunk(v);
  v = v.replace(TITLE_PREFIX, "").replace(TITLE_PREFIX, "").replace(/[.\-:]+$/g, "").trim();
  return v;
}

/**
 * Scans leave debris: stray quotes and dashes, Devanagari characters conjured from speckle
 * inside an English value, and 1–2 letter fragments trailing the real text ("Balewadi रा ह",
 * "Prabhat Road Ta Co"). Strip those so the value is just the words.
 */
export function stripOcrJunk(value: string, kind: "name" | "place" = "name"): string {
  const tokens = value
    .replace(/[^A-Za-zऀ-ॿ\s.'\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Mixed scripts → keep the words of whichever script has more letters ("Balewadi रा ह" is English
  // with speckle; "रत्नागिरी i es" is Marathi with speckle) and drop the other script's debris.
  const letters = (re: RegExp) => tokens.reduce((n, t) => n + (t.match(re)?.length ?? 0), 0);
  const hasLatin = letters(/[A-Za-z]/g) >= letters(/[ऀ-ॿ]/g) && letters(/[A-Za-z]/g) > 0;
  // drop tokens that are only punctuation
  const hasDev = !hasLatin && letters(/[ऀ-ॿ]/g) > 0;
  const kept = (hasLatin ? tokens.filter((t) => !/[ऀ-ॿ]/.test(t)) : hasDev ? tokens.filter((t) => !/[A-Za-z]/.test(t)) : tokens).filter((t) => /[A-Za-zऀ-ॿ]/.test(t));

  // Trailing fragments of ≤2 letters are debris. Place names never end like that, so any
  // trailing fragment goes; for personal names (which can end in an initial) only strip after
  // two real words, or an all-caps pair like "EE" after a full word.
  const fragment = (t: string) => t.replace(/[.'\-]/g, "").length <= 2;
  const lastIsCapsPair = () => kept.length >= 2 && /^[A-Z]{2}$/.test(kept[kept.length - 1]) && kept[kept.length - 2].length >= 4;
  while (kept.length > 1 && fragment(kept[kept.length - 1]) && (kind === "place" || kept.length > 2 || lastIsCapsPair())) kept.pop();
  return kept.join(" ");
}

function cleanPlace(raw: string): string {
  const first = raw
    // (\b doesn't work next to Devanagari, so the Marathi labels get explicit look-arounds)
    .split(/[,;\n(]|\s{2,}|\b(?:taluka|tal|dist|district|tehsil)\b|(?<![ऀ-ॿ])(?:तालुका|जिल्हा)(?![ऀ-ॿ])/i)[0]
    .replace(/[0-9_=*#@<>~^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripOcrJunk(first, "place").replace(/[.\-:]+$/g, "").trim();
}

// ─── Individual extractors ───

const SURVEY_NO =
  "(\\d{1,4}(?:\\s*[\\/\\-]\\s*\\d{1,3})?(?:\\s*[\\/\\-]?\\s*[A-Za-z](?![A-Za-z]))?)";

export function extractSurveyNumber(text: string) {
  return firstMatch(text, [
    new RegExp(`(?:survey|serve|sarve)\\s*(?:no\\.?|number|क्र\\.?)?\\s*[:.\\-]?\\s*${SURVEY_NO}`, "i"),
    new RegExp(`(?:gat|gut)\\s*(?:no\\.?|number|क्र\\.?)?\\s*[:.\\-]?\\s*${SURVEY_NO}`, "i"),
    new RegExp(`\\bS\\.?\\s*No\\.?\\s*[:.\\-]?\\s*${SURVEY_NO}`, "i"),
    new RegExp(`\\bCTS\\s*(?:no\\.?)?\\s*[:.\\-]?\\s*${SURVEY_NO}`, "i"),
    // government 7/12: "भूमापन क्रमांक व उपविभाग  233/10" (survey number and subdivision)
    new RegExp(`भूमापन\\s*क्रमांक\\s*(?:व|वं)?\\s*(?:उपविभाग|उप\\s*विभाग)?\\s*[:.\\-]?\\s*${SURVEY_NO}`),
    new RegExp(`(?:सर्व्हे|सर्वे|सर्व्हें|गट)\\s*(?:नंबर|नं|क्रमांक|क्र)?\\.?\\s*[:.\\-]?\\s*${SURVEY_NO}`),
    new RegExp(`भूमापन\\s*(?:क्रमांक|क्र|नं)?\\.?\\s*[:.\\-]?\\s*${SURVEY_NO}`),
  ]);
}

export function extractOwnerName(text: string) {
  const labelled = firstMatch(text, [
    /(?:name\s+of\s+(?:the\s+)?(?:owner|occupant|khatedar|holder|assessee|taxpayer)|owner(?:'s)?\s*name|occupant|khatedar|bhogavatdar|assessee|tax\s*payer|registered\s*owner|owner|seller|vendor|transferor|executant)\s*(?:name)?\s*[:\-]\s*([^\n]{3,80})/i,
    /(?:भोगवटादाराचे\s*नाव|खातेदाराचे\s*नाव|मालकाचे\s*नाव|भोगवटादार|खातेदार|लिहून\s*देणार)\s*[:\-]?\s*([^\n]{3,80})/,
    /(?:this deed.{0,60}?between|executed by)\s+(?:shri\.?|smt\.?|mr\.?|mrs\.?)?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})/i,
  ]);
  if (!labelled) return null;
  const name = cleanName(labelled.value);
  return name.length >= 3 ? { value: name, snippet: labelled.snippet } : null;
}

export function extractBuyerName(text: string) {
  const m = firstMatch(text, [
    /(?:purchaser|buyer|vendee|transferee|to\s+the\s+purchaser)\s*(?:name)?\s*[:\-]\s*([^\n]{3,80})/i,
    /(?:खरेदी\s*घेणार|खरेदीदार)\s*[:\-]?\s*([^\n]{3,80})/,
  ]);
  if (!m) return null;
  const name = cleanName(m.value);
  return name.length >= 3 ? { value: name, snippet: m.snippet } : null;
}

export function extractVillage(text: string) {
  const m = firstMatch(text, [
    /(?:village|gaon|mouje|moje|mauje)\s*(?:name)?\s*[:\-]\s*([^\n]{2,60})/i,
    /(?:गाव|मौजे|मौजा)\s*[:\-]+\s*([^\n]{2,60})/,
    // without a colon ("मौजे खराडी") — but never the form title "गाव नमुना ७/१२"
    /(?:गाव|मौजे|मौजा)(?!\s*नमुना)\s+([^\n]{2,60})/,
    /(?:situated at|located at|situate at)\s+(?:village\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/,
  ]);
  if (!m) return null;
  const v = cleanPlace(m.value);
  return v.length >= 2 ? { value: v, snippet: m.snippet } : null;
}

export function extractTaluka(text: string) {
  const m = firstMatch(text, [/(?:taluka|tal\.?|tehsil)\s*[:\-]\s*([^\n]{2,40})/i, /तालुका\s*[:\-]*\s*([^\n]{2,40})/]);
  if (!m) return null;
  const v = cleanPlace(m.value);
  return v.length >= 2 ? { value: v, snippet: m.snippet } : null;
}

export function extractDistrict(text: string) {
  const m = firstMatch(text, [/(?:district|dist\.?|zilla)\s*[:\-]\s*([^\n]{2,40})/i, /जिल्हा\s*[:\-]*\s*([^\n]{2,40})/]);
  if (!m) return null;
  const v = cleanPlace(m.value);
  return v.length >= 2 ? { value: v, snippet: m.snippet } : null;
}

// ─── Occupants on a gaon namuna 7 ───

/** Words of the printed form (headings, column titles, footer) that are never part of a person's name. */
const FORM_WORDS = new Set(
  (
    "महाराष्ट्र महाराट्र शासन गाव गांव नमुना सात बारा तालुका जिल्हा भूमापन क्रमांक उपविभाग क्षेत्राचे क्षेत्र एकक हे आर चौ मी " +
    "लागवड योग्य अयोग्य जिरायत बागायत एकुण एकूण पोटखराब पो ख वर्ग आकारणी जुडी किंवा विशेष सामाईक शेवटचा फेरफार प्रलंबित " +
    "नाही दिनांक कुळाचे नाव खंड अधिकार इतर भोगवटादाराचे भोगवटादार शेताचे स्थानीक मार्गावरील खाते ला यो तुकडा डाउनलोड वैधता " +
    "पडताळणीसाठी संकेत स्थळावर जाऊन वापरावा अभिलेख पत्रक नियम यातील आणि जमीन महसुल पिकांची नोंदवही व दि"
  ).split(/\s+/),
);

/**
 * The 7/12 lists every occupant of a khate as "name (mutation-no)", one per row, often beside area
 * figures from the next column. A run of 2–4 name-words directly followed by a bracketed number
 * or an area figure is a person; headings and column titles are filtered by FORM_WORDS.
 */
export function extractOccupants(text: string): string[] {
  if (!GAON_NAMUNA_SAT.test(text)) return [];
  // page 2 (gaon namuna 12, the crop register) has no occupants
  const page1 = text.split(/गाव\s*नमुना\s*बारा/)[0];
  const out: string[] = [];
  for (const line of page1.split("\n")) {
    // the certificate footer ("…स्वयंप्रमाणित असल्यामुळे ७/१२ अभिलेखावर…") reads like words followed by a number
    if (/स्वयंप्रमाणित|डिजिटल|स्वाक्षरी|अभिलेखावर|डाउनलोड|वैधता|सही\s*शिक्क्याची/.test(line)) continue;
    const tokens = line.split(/\s+/).filter(Boolean);
    let run: string[] = [];
    let found = false;
    /** The run just ended at `next`; it is a person only if a bracketed number or area figure follows. */
    const endRun = (next: string) => {
      // One occupant per row: anything further along the same row sits in the "इतर अधिकार"
      // (other rights) column on the right, e.g. a loan holder, who is not an occupant.
      if (!found && run.length >= 2 && /^[(\[]?\s*\d/.test(next)) {
        const name = (run.length > 4 ? run.slice(-3) : run).join(" ");
        if (!out.includes(name)) out.push(name);
        found = true;
      }
      run = [];
    };
    for (const raw of tokens) {
      const t = raw.replace(/^[\[(|\-]+|[.,:;|\])\-]+$/g, "");
      if (/^[ऀ-ॿ‌‍]{3,}$/.test(t) && !FORM_WORDS.has(t)) run.push(t);
      else endRun(raw);
    }
    // a run at the very end of a line has no number after it, so it is not a row
  }
  return out;
}

// ─── Area ───

const SQFT_PER = {
  sqft: 1,
  sqm: 10.7639,
  guntha: 1089,
  acre: 43560,
  hectare: 107639,
  are: 1076.39,
};

const AREA_PATTERNS: { re: RegExp; factor: number; unit: string }[] = [
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet|foot)|square\s*(?:feet|foot)|sqft|चौ\.?\s*फूट|चौरस\s*फूट)/i, factor: SQFT_PER.sqft, unit: "sq ft" },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*(?:m|mtr|mtrs|meters?|metres?)\b|square\s*met(?:er|re)s?|sqm|चौ\.?\s*मी\.?|चौरस\s*मीटर)/i, factor: SQFT_PER.sqm, unit: "sq m" },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:gunthas?|gunthe|guntas?|गुंठे|गुंठा)/i, factor: SQFT_PER.guntha, unit: "guntha" },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:acres?|एकर)/i, factor: SQFT_PER.acre, unit: "acre" },
  { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:hectares?|hect|हेक्टर)/i, factor: SQFT_PER.hectare, unit: "hectare" },
  // 7/12 style "0.40 H.R" → hectare.are written as a decimal hectare
  { re: /(\d+\.\d{2})\s*(?:H\.?\s*R\.?|हे\.?\s*आर)/i, factor: SQFT_PER.hectare, unit: "hectare" },
];

/**
 * The government 7/12 writes area as hectare.are.sq-metre in one number: "0.02.30" is 0 ha,
 * 2 are (200 m²) and 30 m² = 230 m². The grand total sits beside "एकुण क्षेत्र" (total area).
 */
export function parseHaAreSqm(h: string): number | null {
  const m = /^(\d{1,3})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})$/.exec(h.trim());
  if (!m) return null;
  const sqm = +m[1] * 10000 + +m[2] * 100 + +m[3];
  return sqm > 0 ? sqm : null;
}

function extractGovtSevenTwelveArea(text: string): { sqft: number; text: string; snippet: string } | null {
  const m = /(?:एकुण|एकूण)\s*क्षेत्र[^\d\n]{0,25}(\d{1,3}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2})/.exec(text);
  if (!m) return null;
  const sqm = parseHaAreSqm(m[1]);
  if (sqm === null) return null;
  return { sqft: Math.round(sqm * SQFT_PER.sqm * 100) / 100, text: `${m[1].replace(/\s+/g, "")} ha.are.m²`, snippet: m[0].trim() };
}

export function extractArea(text: string): { sqft: number; text: string; snippet: string } | null {
  const govt = extractGovtSevenTwelveArea(text);
  if (govt) return govt;
  const lines = text.split("\n");
  const labelled = lines.filter((l) => /area|क्षेत्र|क्षेत्रफळ|extent|admeasuring|measuring/i.test(l)).join("\n");

  for (const scope of [labelled, text]) {
    if (!scope) continue;
    for (const { re, factor, unit } of AREA_PATTERNS) {
      const m = re.exec(scope);
      if (m) {
        const n = parseFloat(m[1].replace(/,/g, ""));
        if (n > 0) return { sqft: Math.round(n * factor * 100) / 100, text: `${m[1]} ${unit}`, snippet: m[0].trim() };
      }
    }
  }
  return null;
}

// ─── Dates ───

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toIso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function extractDate(text: string): { iso: string; snippet: string } | null {
  const results: { iso: string; snippet: string; near: boolean }[] = [];

  const numeric = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/g;
  const named = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/g;

  let m: RegExpExecArray | null;
  while ((m = numeric.exec(text))) {
    const iso = toIso(+m[3], +m[2], +m[1]); // Indian format: dd/mm/yyyy
    if (iso) results.push({ iso, snippet: m[0], near: nearDateLabel(text, m.index) });
  }
  while ((m = named.exec(text))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mon) continue;
    const iso = toIso(+m[3], mon, +m[1]);
    if (iso) results.push({ iso, snippet: m[0], near: nearDateLabel(text, m.index) });
  }

  const best = results.find((r) => r.near) || results[0];
  return best ? { iso: best.iso, snippet: best.snippet } : null;
}

function nearDateLabel(text: string, index: number): boolean {
  return /(?:date|dated|दिनांक|तारीख|executed on|registered on)/i.test(text.slice(Math.max(0, index - 30), index));
}

// ─── Registration number & amount ───

export function extractRegistrationNumber(text: string) {
  return firstMatch(text, [
    /(?:regd?\.?|registration|document|doc\.?|दस्त)\s*(?:no\.?|number|क्रमांक|क्र\.?)\s*[:.\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-]{2,24})/i,
  ]);
}

export function extractAmount(text: string): { value: number; snippet: string } | null {
  const m = firstMatch(text, [
    /(?:consideration|sale\s*price|total\s*amount|amount\s*paid|amount|मोबदला|एकूण\s*रक्कम|रक्कम)\s*(?:of)?\s*[:\-]?\s*(?:rs\.?|inr|₹|रुपये)?\s*([\d,]{4,}(?:\.\d{1,2})?)/i,
    /(?:rs\.?|₹|inr)\s*\.?\s*([\d,]{4,}(?:\.\d{1,2})?)/i,
  ]);
  if (!m) return null;
  const n = parseFloat(m.value.replace(/,/g, ""));
  return n > 0 ? { value: n, snippet: m.snippet } : null;
}

// ─── Main entry point ───

export function extractFields(rawText: string, hintKind: DocumentKind = "unknown"): ExtractionResult {
  const text = cleanOcrText(rawText);
  const classified = classifyDocument(text);
  const kind = hintKind !== "unknown" ? hintKind : classified.kind;

  const fields: ExtractedFields = {};
  const evidence: Record<string, string> = {};

  const set = <K extends keyof ExtractedFields>(key: K, hit: { value: ExtractedFields[K]; snippet: string } | null) => {
    if (hit && hit.value !== undefined && hit.value !== "") {
      fields[key] = hit.value;
      evidence[key] = hit.snippet;
    }
  };

  set("surveyNumber", extractSurveyNumber(text));
  set("ownerName", extractOwnerName(text));
  const occupants = extractOccupants(text);
  if (occupants.length) {
    fields.ownerNames = occupants;
    fields.ownerName = occupants[0]; // the heading text the generic rule grabs is a column title here
    evidence.ownerName = occupants.slice(0, 3).join(", ") + (occupants.length > 3 ? ` … (${occupants.length} occupants)` : "");
  }
  const khate = /खाते\s*क्रमांक\s*[:\-]\s*([\d, ]+)/.exec(text);
  if (khate) fields.khateNumbers = khate[1].split(/[,\s]+/).filter(Boolean);
  set("buyerName", extractBuyerName(text));
  set("village", extractVillage(text));
  set("taluka", extractTaluka(text));
  set("district", extractDistrict(text));
  set("registrationNumber", extractRegistrationNumber(text));

  const area = extractArea(text);
  if (area) {
    fields.areaSqft = area.sqft;
    fields.areaText = area.text;
    evidence.areaSqft = area.snippet;
  }
  const date = extractDate(text);
  if (date) {
    fields.documentDate = date.iso;
    evidence.documentDate = date.snippet;
  }
  const amount = extractAmount(text);
  if (amount) {
    fields.amount = amount.value;
    evidence.amount = amount.snippet;
  }

  const expected = EXPECTED_FIELDS[kind] as string[];
  const found = expected.filter((k) => fields[k as keyof ExtractedFields] !== undefined);

  return {
    kind,
    detectedKind: classified.kind,
    kindScore: classified.score,
    fields,
    evidence,
    expected,
    found,
    completeness: expected.length ? found.length / expected.length : 0,
  };
}
